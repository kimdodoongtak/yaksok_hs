import { afterAll, beforeAll, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { verifyTestDatabase } from "../../../scripts/test-database.mjs";
import { newToken, tokenHash } from "../invitation/security";
import { createParticipantAccessService } from "./service";
const makeDb = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
const db = makeDb();
const otherDb = makeDb();
const links: string[] = [];
const at = new Date("2026-11-14T00:00:00Z");
const service = createParticipantAccessService(db, () => at, async pin => `test:${pin}`);
let verified = false;
beforeAll(async () => { await verifyTestDatabase(process.env.TEST_DATABASE_URL); verified = true; });
afterAll(async () => {
  if (verified) {
    await db.participantSession.deleteMany({ where: { participant: { promise: { promiseLinkId: { in: links } } } } });
    await db.participant.deleteMany({ where: { promise: { promiseLinkId: { in: links } } } });
    await db.promiseRecord.deleteMany({ where: { promiseLinkId: { in: links } } });
    await db.promiseLink.deleteMany({ where: { id: { in: links } } });
  }
  await db.$disconnect(); await otherDb.$disconnect();
});
async function fixture(limit = 5) {
  const link = await db.promiseLink.create({ data: { inviteToken: newToken(), createdAt: at } });
  links.push(link.id);
  const promise = await db.promiseRecord.create({ data: {
    promiseLinkId: link.id, status: "collecting", participantLimit: limit,
    dateRangeStart: new Date("2026-11-15"), dateRangeEnd: new Date("2026-11-20"),
    dailyStartMinute: 540, dailyEndMinute: 1080, durationMinutes: 120,
    votingDeadlineAt: new Date("2026-11-15T00:00:00Z"), createdAt: at,
  } });
  const host = await db.participant.create({ data: { promiseId: promise.id, nickname: "방장", normalizedNickname: "방장", passwordHash: "test:1234", role: "host" } });
  return { link, promise, host };
}
it("모집 중 친구 등록은 정규화한 이름과 해시·마감+7일 세션을 함께 저장한다", async () => {
  const { link, promise } = await fixture();
  const result = await service.join({ inviteToken: link.inviteToken, nickname: " Iris ", pin: "1234" });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("등록 실패");
  expect(result.expiresAt).toEqual(new Date("2026-11-22T00:00:00Z"));
  const member = await db.participant.findUniqueOrThrow({ where: { promiseId_normalizedNickname: { promiseId: promise.id, normalizedNickname: "iris" } }, include: { sessions: true } });
  expect(member).toMatchObject({ nickname: "Iris", role: "member", status: "active", passwordHash: "test:1234" });
  expect(member.sessions).toHaveLength(1);
  expect(member.sessions[0].sessionTokenHash).toBe(tokenHash(result.sessionToken));
});
it("마지막 한 자리에 독립 연결로 동시 등록하면 한 명만 성공한다", async () => {
  const { link, promise } = await fixture(2);
  let entered = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const hash = async (pin: string) => { if (++entered === 2) release(); await gate; return `test:${pin}`; };
  const a = createParticipantAccessService(db, () => at, hash);
  const b = createParticipantAccessService(otherDb, () => at, hash);
  const results = await Promise.all([
    a.join({ inviteToken: link.inviteToken, nickname: "첫친구", pin: "1234" }),
    b.join({ inviteToken: link.inviteToken, nickname: "둘친구", pin: "5678" }),
  ]);
  expect(results.filter(r => r.ok)).toHaveLength(1);
  expect(results.find(r => !r.ok)).toEqual({ ok: false, code: "CAPACITY_FULL" });
  expect(await db.participant.count({ where: { promiseId: promise.id, status: "active" } })).toBe(2);
});
it("신규 참여는 만료·취소·초안·마감·중복 이름을 거절한다", async () => {
  const { link, promise } = await fixture();
  const request = { inviteToken: link.inviteToken, nickname: "친구", pin: "1234" };
  await db.promiseRecord.update({ where: { id: promise.id }, data: { status: "cancelled", cancelledAt: at } });
  expect(await service.join(request)).toEqual({ ok: false, code: "PROMISE_CANCELLED" });
  await db.promiseLink.update({ where: { id: link.id }, data: { createdAt: new Date("2026-08-14T00:00:00Z") } });
  expect(await service.join(request)).toEqual({ ok: false, code: "LINK_EXPIRED" });
  await db.promiseLink.update({ where: { id: link.id }, data: { createdAt: at } });
  await db.promiseRecord.update({ where: { id: promise.id }, data: { status: "draft", cancelledAt: null } });
  expect(await service.join(request)).toEqual({ ok: false, code: "NOT_COLLECTING" });
  await db.promiseRecord.update({ where: { id: promise.id }, data: { status: "collecting", votingDeadlineAt: at } });
  expect(await service.join(request)).toEqual({ ok: false, code: "REGISTRATION_CLOSED" });
  expect((await db.promiseRecord.findUniqueOrThrow({ where: { id: promise.id } })).status).toBe("closed");
  await db.promiseRecord.update({ where: { id: promise.id }, data: { status: "collecting", votingDeadlineAt: new Date("2026-11-15T00:00:00Z") } });
  await db.participant.create({ data: { promiseId: promise.id, nickname: "Iris", normalizedNickname: "iris", passwordHash: "test", role: "member", status: "cancelled", cancelledAt: at } });
  expect(await service.join({ ...request, nickname: " IRIS " })).toEqual({ ok: false, code: "NICKNAME_TAKEN" });
  expect(await service.join({ ...request, nickname: "친구😀" })).toEqual({ ok: false, code: "INVALID_INPUT" });
  expect(await db.participant.count({ where: { promiseId: promise.id } })).toBe(2);
});
it("마감+7일 이후에도 재로그인은 성공 시각+7일의 독립 세션을 발급한다", async () => {
  const { link, host } = await fixture();
  const loginAt = new Date("2026-12-01T03:00:00Z");
  const auth = createParticipantAccessService(db, () => loginAt, async pin => `test:${pin}`, async (pin, hash) => hash === `test:${pin}`);
  const first = await auth.authenticate({ inviteToken: link.inviteToken, nickname: "방장", pin: "1234" });
  expect(first.ok).toBe(true);
  const second = await auth.authenticate({ inviteToken: link.inviteToken, nickname: "방장", pin: "1234" });
  expect(second.ok).toBe(true);
  if (!first.ok || !second.ok) throw new Error("인증 실패");
  expect(first.expiresAt).toEqual(new Date("2026-12-08T03:00:00Z"));
  expect(first.sessionToken === second.sessionToken).toBe(false);
  expect(await db.participantSession.count({ where: { participantId: host.id } })).toBe(2);
  expect(await auth.authenticate({ inviteToken: link.inviteToken, nickname: "방장", pin: "0000" })).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
  expect(await auth.authenticate({ inviteToken: link.inviteToken, nickname: "없는이름", pin: "1234" })).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
});
it("연속 5회 실패를 공유하고 10분 차단은 재시도로 늘어나지 않는다", async () => {
  const { link } = await fixture();
  let current = at;
  const a = createParticipantAccessService(db, () => current, async pin => `test:${pin}`, async (pin, hash) => hash === `test:${pin}`);
  const b = createParticipantAccessService(otherDb, () => current, async pin => `test:${pin}`, async (pin, hash) => hash === `test:${pin}`);
  const input = { inviteToken: link.inviteToken, nickname: "방장", pin: "0000" };
  for (let i = 0; i < 4; i++) expect(await a.authenticate(input)).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
  const blocked = { ok: false, code: "PIN_LOCKED", retryAt: new Date("2026-11-14T00:10:00Z") };
  expect(await b.authenticate(input)).toEqual(blocked);
  current = new Date("2026-11-14T00:09:59.999Z");
  expect(await b.authenticate({ ...input, pin: "1234" })).toEqual(blocked);
  current = new Date("2026-11-14T00:10:00Z");
  expect((await b.authenticate({ ...input, pin: "1234" })).ok).toBe(true);
  for (let i = 0; i < 4; i++) expect(await a.authenticate(input)).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
  expect((await a.authenticate({ ...input, pin: "1234" })).ok).toBe(true);
  expect(await a.authenticate(input)).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
});
it("본인 조회·현재 기기 로그아웃은 약속 소속과 최신 세션·역할·상태를 확인한다", async () => {
  const { link, promise } = await fixture();
  const other = await fixture();
  let current = at;
  const auth = createParticipantAccessService(db, () => current, async pin => `test:${pin}`, async (pin, hash) => hash === `test:${pin}`);
  const input = { inviteToken: link.inviteToken, nickname: "방장", pin: "1234" };
  const a = await auth.authenticate(input); const b = await auth.authenticate(input);
  if (!a.ok || !b.ok) throw new Error("fixture 인증 실패");
  const own = { inviteToken: link.inviteToken, sessionToken: a.sessionToken };
  expect(await auth.read(own)).toMatchObject({ ok: true, participant: { nickname: "방장", role: "host" } });
  expect(await auth.read({ ...own, inviteToken: other.link.inviteToken })).toEqual({ ok: false, code: "UNAUTHORIZED" });
  expect(await auth.logout({ ...own, inviteToken: other.link.inviteToken })).toEqual({ ok: false, code: "UNAUTHORIZED" });
  expect(await auth.logout(own)).toEqual({ ok: true });
  expect(await auth.read(own)).toEqual({ ok: false, code: "UNAUTHORIZED" });
  expect((await auth.read({ ...own, sessionToken: b.sessionToken })).ok).toBe(true);
  current = new Date("2026-11-21T00:00:00Z");
  expect(await auth.read({ ...own, sessionToken: b.sessionToken })).toEqual({ ok: false, code: "UNAUTHORIZED" });
  await db.promiseRecord.update({ where: { id: promise.id }, data: { status: "cancelled", cancelledAt: current } });
  expect(await auth.read(own)).toEqual({ ok: false, code: "PROMISE_CANCELLED" });
  expect(await auth.read({ inviteToken: link.inviteToken })).toEqual({ ok: false, code: "PROMISE_CANCELLED" });
  current = new Date("2027-02-14T00:00:00Z");
  expect(await auth.read(own)).toEqual({ ok: false, code: "LINK_EXPIRED" });
});
it("PIN 변경은 현재 PIN과 공유 실패 제한을 확인하고 모든 기존 세션을 폐기한다", async () => {
  const { link, host } = await fixture();
  const auth = createParticipantAccessService(db, () => at, async pin => `test:${pin}`, async (pin, hash) => hash === `test:${pin}`);
  const input = { inviteToken: link.inviteToken, nickname: "방장", pin: "1234" };
  const a = await auth.authenticate(input); const b = await auth.authenticate(input);
  if (!a.ok || !b.ok) throw new Error("fixture 인증 실패");
  const change = { inviteToken: link.inviteToken, sessionToken: a.sessionToken, currentPin: "0000", newPin: "5678" };
  expect(await auth.changePin(change)).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
  expect((await db.participant.findUniqueOrThrow({ where: { id: host.id } })).passwordHash).toBe("test:1234");
  expect(await db.participantSession.count({ where: { participantId: host.id } })).toBe(2);
  expect(await auth.changePin({ ...change, currentPin: "1234", newPin: "12" })).toEqual({ ok: false, code: "INVALID_INPUT" });
  expect(await auth.changePin({ ...change, currentPin: "1234" })).toEqual({ ok: true });
  expect(await db.participantSession.count({ where: { participantId: host.id } })).toBe(0);
  expect(await auth.authenticate(input)).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
  const fresh = await auth.authenticate({ ...input, pin: "5678" });
  expect(fresh.ok).toBe(true);
  if (!fresh.ok) throw new Error("변경 후 인증 실패");
  for (let i = 0; i < 4; i++) await auth.authenticate({ ...input, pin: "0000" });
  expect(await auth.changePin({ ...change, sessionToken: fresh.sessionToken })).toMatchObject({ ok: false, code: "PIN_LOCKED" });
  expect(await auth.changePin({ ...change, sessionToken: fresh.sessionToken, currentPin: "5678" })).toMatchObject({ ok: false, code: "PIN_LOCKED" });
});
it("IP 요청 예산은 여러 연결에서 공유하고 10분 창 끝에서 초기화한다", async () => {
  const address = `test-${newToken()}`;
  let current = at;
  const a = createParticipantAccessService(db, () => current);
  const b = createParticipantAccessService(otherDb, () => current);
  const keyHash = tokenHash(JSON.stringify(["ip", address]));
  try {
    for (let i = 0; i < 29; i++) expect(await a.consumeRequest(address)).toEqual({ ok: true });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const requests = [a, b].map(async instance => { await gate; return instance.consumeRequest(address); });
    release();
    const results = await Promise.all(requests);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.find(r => !r.ok)).toEqual({ ok: false, code: "RATE_LIMITED", retryAt: new Date("2026-11-14T00:10:00Z") });
    current = new Date("2026-11-14T00:10:00Z");
    expect(await a.consumeRequest(address)).toEqual({ ok: true });
  } finally { await db.authAttempt.deleteMany({ where: { keyHash } }); }
});
it("동시 실패도 잃지 않고 없는 닉네임에도 같은 제한을 적용한다", async () => {
  const { link } = await fixture();
  const make = (client: PrismaClient) => createParticipantAccessService(client, () => at, async pin => `test:${pin}`, async (pin, hash) => hash === `test:${pin}`);
  const a = make(db), b = make(otherDb);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const requests = Array.from({ length: 6 }, (_, index) => (async () => { await gate; return (index % 2 ? a : b).authenticate({ inviteToken: link.inviteToken, nickname: "없는이름", pin: "0000" }); })());
  release();
  const results = await Promise.all(requests);
  expect(results.filter(r => !r.ok && r.code === "INVALID_CREDENTIALS")).toHaveLength(4);
  expect(results.filter(r => !r.ok && r.code === "PIN_LOCKED")).toHaveLength(2);
});
it("탈퇴·내보내기 상태와 바뀐 역할을 기존 세션에 즉시 적용한다", async () => {
  const { link, promise } = await fixture();
  const joined = await service.join({ inviteToken: link.inviteToken, nickname: "참여자", pin: "1234" });
  if (!joined.ok) throw new Error("fixture 등록 실패");
  const member = await db.participant.findUniqueOrThrow({ where: { promiseId_normalizedNickname: { promiseId: promise.id, normalizedNickname: "참여자" } } });
  const input = { inviteToken: link.inviteToken, sessionToken: joined.sessionToken };
  await db.participant.update({ where: { id: member.id }, data: { status: "cancelled", cancelledAt: at } });
  expect(await service.read(input)).toEqual({ ok: false, code: "UNAUTHORIZED" });
  expect(await service.changePin({ ...input, currentPin: "1234", newPin: "5678" })).toEqual({ ok: false, code: "UNAUTHORIZED" });
  const auth = createParticipantAccessService(db, () => at, async pin => `test:${pin}`, async (pin, hash) => hash === `test:${pin}`);
  expect(await auth.authenticate({ inviteToken: link.inviteToken, nickname: "참여자", pin: "1234" })).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
  const hostLogin = await auth.authenticate({ inviteToken: link.inviteToken, nickname: "방장", pin: "1234" });
  if (!hostLogin.ok) throw new Error("fixture 인증 실패");
  await db.$transaction(async tx => {
    await tx.participant.updateMany({ where: { promiseId: promise.id, role: "host" }, data: { role: "member" } });
    await tx.participant.update({ where: { id: member.id }, data: { status: "active", cancelledAt: null, role: "host" } });
  });
  expect(await auth.read({ inviteToken: link.inviteToken, sessionToken: hostLogin.sessionToken })).toMatchObject({ ok: true, participant: { role: "member" } });
});
it("세션 저장 실패는 신규 참여자 생성까지 롤백한다", async () => {
  const { link, promise } = await fixture();
  await db.$executeRawUnsafe(`CREATE FUNCTION test_access_session_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$`);
  try {
    await db.$executeRawUnsafe(`CREATE TRIGGER test_access_session_insert BEFORE INSERT ON participant_sessions FOR EACH ROW EXECUTE FUNCTION test_access_session_insert()`);
    expect(await service.join({ inviteToken: link.inviteToken, nickname: "롤백친구", pin: "1234" })).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(await db.participant.count({ where: { promiseId: promise.id } })).toBe(1);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_access_session_insert ON participant_sessions`);
    await db.$executeRawUnsafe(`DROP FUNCTION test_access_session_insert()`);
  }
});
it("기존 세션 폐기 실패는 새 PIN 저장도 롤백한다", async () => {
  const { link, host } = await fixture();
  const auth = createParticipantAccessService(db, () => at, async pin => `test:${pin}`, async (pin, hash) => hash === `test:${pin}`);
  const login = await auth.authenticate({ inviteToken: link.inviteToken, nickname: "방장", pin: "1234" });
  if (!login.ok) throw new Error("fixture 인증 실패");
  await db.$executeRawUnsafe(`CREATE FUNCTION test_access_session_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$`);
  try {
    await db.$executeRawUnsafe(`CREATE TRIGGER test_access_session_delete BEFORE DELETE ON participant_sessions FOR EACH ROW EXECUTE FUNCTION test_access_session_delete()`);
    expect(await auth.changePin({ inviteToken: link.inviteToken, sessionToken: login.sessionToken, currentPin: "1234", newPin: "5678" })).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect((await db.participant.findUniqueOrThrow({ where: { id: host.id } })).passwordHash).toBe("test:1234");
    expect((await auth.read({ inviteToken: link.inviteToken, sessionToken: login.sessionToken })).ok).toBe(true);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_access_session_delete ON participant_sessions`);
    await db.$executeRawUnsafe(`DROP FUNCTION test_access_session_delete()`);
  }
});
it("세션 만료 직전은 허용하고 링크 만료 정각은 로그인·변경도 차단한다", async () => {
  const { link } = await fixture();
  let current = at;
  const auth = createParticipantAccessService(db, () => current, async pin => `test:${pin}`, async (pin, hash) => hash === `test:${pin}`);
  const credentials = { inviteToken: link.inviteToken, nickname: "방장", pin: "1234" };
  const login = await auth.authenticate(credentials);
  if (!login.ok) throw new Error("fixture 인증 실패");
  const input = { inviteToken: link.inviteToken, sessionToken: login.sessionToken };
  current = new Date("2026-11-20T23:59:59.999Z");
  expect((await auth.read(input)).ok).toBe(true);
  current = new Date("2027-02-14T00:00:00Z");
  expect(await auth.authenticate(credentials)).toEqual({ ok: false, code: "LINK_EXPIRED" });
  expect(await auth.changePin({ ...input, currentPin: "1234", newPin: "5678" })).toEqual({ ok: false, code: "LINK_EXPIRED" });
});
it("기존 방장 등록·초안 나가기·모집 시작도 취소 오류를 인증 오류보다 우선한다", async () => {
  const { createInvitationService } = await import("../invitation/service");
  const { createPromiseSettingsService } = await import("../promise-settings/service");
  const { link, promise } = await fixture();
  await db.promiseRecord.update({ where: { id: promise.id }, data: { status: "cancelled", cancelledAt: at } });
  const invitation = createInvitationService(db, () => at, async () => "test");
  expect(await invitation.abandonDraft(link.inviteToken, "expired")).toEqual({ ok: false, code: "PROMISE_CANCELLED" });
  expect(await invitation.registerHost({ inviteToken: link.inviteToken, nickname: "방장", pin: "1234" })).toEqual({ ok: false, code: "PROMISE_CANCELLED" });
  const settings = createPromiseSettingsService(db, () => at);
  expect(await settings.startCollection({ inviteToken: link.inviteToken, sessionToken: "expired", settings: { participantLimit: "5", dateRangeStart: "2026-11-15", dateRangeEnd: "2026-11-20", dailyStart: "09:00", dailyEnd: "18:00", durationMinutes: "120", votingDeadline: "2026-11-14T12:00" } })).toEqual({ ok: false, code: "PROMISE_CANCELLED" });
});
it("현재 PIN과 같은 새 PIN은 거절하고 기존 PIN·모든 세션을 유지한다", async () => {
  const { link, host } = await fixture();
  const auth = createParticipantAccessService(db, () => at, async pin => `test:${pin}`, async (pin, hash) => hash === `test:${pin}`);
  const credentials = { inviteToken: link.inviteToken, nickname: "방장", pin: "1234" };
  const a = await auth.authenticate(credentials);
  const b = await auth.authenticate(credentials);
  if (!a.ok || !b.ok) throw new Error("fixture 인증 실패");
  const input = { inviteToken: link.inviteToken, sessionToken: a.sessionToken };
  expect(await auth.changePin({ ...input, currentPin: "1234", newPin: "1234" })).toEqual({ ok: false, code: "SAME_PIN" });
  expect((await db.participant.findUniqueOrThrow({ where: { id: host.id } })).passwordHash).toBe("test:1234");
  expect(await db.participantSession.count({ where: { participantId: host.id } })).toBe(2);
  expect((await auth.read(input)).ok).toBe(true);
  expect((await auth.read({ ...input, sessionToken: b.sessionToken })).ok).toBe(true);
  expect(await auth.changePin({ ...input, currentPin: "0000", newPin: "0000" })).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
});
