import { afterAll, beforeAll, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { verifyTestDatabase } from "../../../scripts/test-database.mjs";
import { createInvitationService } from "./service";
import { newToken } from "./security";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }),
});
const links: string[] = [];
const time = new Date("2026-11-13T00:00:00Z");
const service = createInvitationService(db, () => time);
let verified = false;
beforeAll(async () => {
  await verifyTestDatabase(process.env.TEST_DATABASE_URL);
  verified = true;
});
afterAll(async () => {
  if (!verified) {
    await db.$disconnect();
    return;
  }
  await db.participantSession.deleteMany({
    where: { participant: { promise: { promiseLinkId: { in: links } } } },
  });
  await db.participant.deleteMany({
    where: { promise: { promiseLinkId: { in: links } } },
  });
  await db.promiseRecord.deleteMany({
    where: { promiseLinkId: { in: links } },
  });
  await db.promiseLink.deleteMany({ where: { id: { in: links } } });
  await db.$disconnect();
});
async function fixtureLink(createdAt = time) {
  const link = await db.promiseLink.create({
    data: { inviteToken: newToken(), createdAt },
  });
  links.push(link.id);
  return link;
}

it("초대 발급은 난수 링크 하나만 저장한다", async () => {
  const issued = await service.issueInviteLink();
  expect(issued.inviteToken).toMatch(/^[\w-]{43}$/);
  const link = await db.promiseLink.findUniqueOrThrow({
    where: { inviteToken: issued.inviteToken },
    include: { promise: true },
  });
  links.push(link.id);
  expect(link.promise).toBeNull();
  expect(issued.expiresAt).toEqual(new Date("2027-02-13T00:00:00Z"));
});

it("링크 조회는 미사용·만료 초안을 표시하되 약속 생성이나 삭제를 하지 않는다", async () => {
  const link = await fixtureLink();
  expect(await service.readInvitation(link.inviteToken)).toMatchObject({
    state: "available",
  });
  expect(
    await db.promiseRecord.count({ where: { promiseLinkId: link.id } }),
  ).toBe(0);
  const draft = await db.promiseRecord.create({
    data: {
      promiseLinkId: link.id,
      createdAt: new Date(time.getTime() - 600000),
    },
  });
  expect(await service.readInvitation(link.inviteToken)).toMatchObject({
    state: "draft-expired",
  });
  expect(
    await db.promiseRecord.findUnique({ where: { id: draft.id } }),
  ).not.toBeNull();
  const expired = await fixtureLink(new Date("2026-08-13T00:00:00Z"));
  expect(await service.readInvitation(expired.inviteToken)).toEqual({
    state: "expired",
  });
  expect(await service.readInvitation("missing")).toEqual({ state: "invalid" });
});

it("등록은 링크를 먼저 검사하고 해시 실패를 안전한 오류로 반환한다", async () => {
  let hashCalls = 0;
  const failingHasher = async () => {
    hashCalls += 1;
    throw new Error("hash failed");
  };
  const guarded = createInvitationService(db, () => time, failingHasher);

  expect(
    await guarded.registerHost({
      inviteToken: "missing",
      nickname: "방장",
      pin: "1234",
    }),
  ).toEqual({ ok: false, code: "INVALID_LINK" });
  expect(hashCalls).toBe(0);

  const expired = await fixtureLink(new Date("2026-08-13T00:00:00Z"));
  expect(
    await guarded.registerHost({
      inviteToken: expired.inviteToken,
      nickname: "방장",
      pin: "1234",
    }),
  ).toEqual({ ok: false, code: "LINK_EXPIRED" });
  expect(hashCalls).toBe(0);

  const available = await fixtureLink();
  expect(
    await guarded.registerHost({
      inviteToken: available.inviteToken,
      nickname: "방장",
      pin: "1234",
    }),
  ).toEqual({ ok: false, code: "UNAVAILABLE" });
  expect(hashCalls).toBe(1);
  expect(
    await db.promiseRecord.count({ where: { promiseLinkId: available.id } }),
  ).toBe(0);
});

it("이미 선점된 링크는 PIN 해시 전에 거절한다", async () => {
  const link = await fixtureLink();
  const claimed = await service.registerHost({
    inviteToken: link.inviteToken,
    nickname: "먼저온방장",
    pin: "1234",
  });
  if (!claimed.ok) throw new Error("선점 준비 실패");

  let hashCalls = 0;
  const guarded = createInvitationService(db, () => time, async () => {
    hashCalls += 1;
    throw new Error("hash should not run");
  });
  expect(
    await guarded.registerHost({
      inviteToken: link.inviteToken,
      nickname: "늦은방장",
      pin: "1234",
    }),
  ).toEqual({ ok: false, code: "ALREADY_CLAIMED" });
  expect(hashCalls).toBe(0);
});

import { tokenHash, verifyPin } from "./security";
it("독립 연결의 동시 등록 중 하나만 약속·방장·해시 세션을 생성한다", async () => {
  const link = await fixtureLink();
  const other = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }),
  });
  try {
    const [a, b] = await Promise.all([
      db.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`,
      other.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`,
    ]);
    expect(a[0].pid).not.toBe(b[0].pid);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const attempt = async (client: PrismaClient, nickname: string) => {
      await gate;
      return createInvitationService(client, () => time).registerHost({
        inviteToken: link.inviteToken,
        nickname,
        pin: "0012",
      });
    };
    const pending = [attempt(db, "가나"), attempt(other, "다라")];
    release();
    const results = await Promise.all(pending);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, code: "ALREADY_CLAIMED" },
    ]);
    const winner = results.find((r) => r.ok)!;
    if (!winner.ok) throw new Error("등록 실패");
    const promise = await db.promiseRecord.findUniqueOrThrow({
      where: { promiseLinkId: link.id },
      include: { participants: { include: { sessions: true } } },
    });
    expect(promise.participants).toHaveLength(1);
    const host = promise.participants[0];
    expect(host.role).toBe("host");
    expect(host.status).toBe("active");
    expect(await verifyPin("0012", host.passwordHash)).toBe(true);
    expect(host.sessions).toHaveLength(1);
    expect(host.sessions[0].sessionTokenHash).toBe(
      tokenHash(winner.sessionToken),
    );
    expect(host.sessions[0].sessionTokenHash).not.toBe(winner.sessionToken);
    expect(winner.expiresAt).toEqual(new Date("2026-11-13T00:10:00Z"));
  } finally {
    await other.$disconnect();
  }
});

it("본인 세션만 초안 설정 진입을 허용하며 8분 경고와 10분 만료를 재판정한다", async () => {
  const link = await fixtureLink();
  const registration = await service.registerHost({
    inviteToken: link.inviteToken,
    nickname: "방장",
    pin: "0012",
  });
  expect(registration.ok).toBe(true);
  if (!registration.ok) return;
  expect(
    await service.readInvitation(link.inviteToken, registration.sessionToken),
  ).toMatchObject({ state: "host", nickname: "방장", warning: false });
  expect(await service.readInvitation(link.inviteToken, "forged")).toEqual({
    state: "waiting",
  });
  const other = await fixtureLink();
  const otherRegistration = await service.registerHost({
    inviteToken: other.inviteToken,
    nickname: "다른방장",
    pin: "0012",
  });
  if (!otherRegistration.ok) throw new Error("다른 등록 실패");
  expect(
    await service.readInvitation(
      link.inviteToken,
      otherRegistration.sessionToken,
    ),
  ).toEqual({ state: "waiting" });
  const atEight = createInvitationService(
    db,
    () => new Date(time.getTime() + 480000),
  );
  expect(
    await atEight.readInvitation(link.inviteToken, registration.sessionToken),
  ).toMatchObject({ state: "host", warning: true });
  const atTen = createInvitationService(
    db,
    () => new Date(time.getTime() + 600000),
  );
  expect(
    await atTen.readInvitation(link.inviteToken, registration.sessionToken),
  ).toEqual({ state: "draft-expired" });
  await db.participantSession.updateMany({
    where: { sessionTokenHash: tokenHash(registration.sessionToken) },
    data: { expiresAt: time },
  });
  expect(
    await service.readInvitation(link.inviteToken, registration.sessionToken),
  ).toEqual({ state: "waiting" });
});

it("10분이 지난 초안은 새 등록 쓰기에서만 정리하고 같은 링크를 재사용한다", async () => {
  const link = await fixtureLink();
  const old = await service.registerHost({
    inviteToken: link.inviteToken,
    nickname: "이전방장",
    pin: "0012",
  });
  if (!old.ok) throw new Error("등록 실패");
  const previous = await db.promiseRecord.findUniqueOrThrow({
    where: { promiseLinkId: link.id },
  });
  const later = createInvitationService(
    db,
    () => new Date(time.getTime() + 600000),
  );
  const result = await later.registerHost({
    inviteToken: link.inviteToken,
    nickname: "새방장",
    pin: "1234",
  });
  expect(result.ok).toBe(true);
  expect(
    await db.promiseRecord.findUnique({ where: { id: previous.id } }),
  ).toBeNull();
  expect(
    await db.participantSession.findUnique({
      where: { sessionTokenHash: tokenHash(old.sessionToken) },
    }),
  ).toBeNull();
  expect(await db.promiseLink.count({ where: { id: link.id } })).toBe(1);
  expect(
    await db.participant.count({
      where: { promise: { promiseLinkId: link.id } },
    }),
  ).toBe(1);
});

it("초안 나가기는 유효한 본인 방장 세션에만 허용하고 링크를 보존한다", async () => {
  const link = await fixtureLink();
  const result = await service.registerHost({
    inviteToken: link.inviteToken,
    nickname: "방장",
    pin: "1234",
  });
  if (!result.ok) throw new Error("등록 실패");
  expect(await service.abandonDraft(link.inviteToken, "forged")).toEqual({
    ok: false,
    code: "UNAUTHORIZED",
  });
  expect(
    await db.promiseRecord.count({ where: { promiseLinkId: link.id } }),
  ).toBe(1);
  expect(
    await service.abandonDraft(link.inviteToken, result.sessionToken),
  ).toEqual({ ok: true });
  expect(
    await db.promiseRecord.count({ where: { promiseLinkId: link.id } }),
  ).toBe(0);
  expect(
    await db.participantSession.count({
      where: { sessionTokenHash: tokenHash(result.sessionToken) },
    }),
  ).toBe(0);
  expect(await service.readInvitation(link.inviteToken)).toEqual({
    state: "available",
  });
});

it("만료된 초안 변경 요청은 세션이 남아 있어도 변경 대신 정리한다", async () => {
  const link = await fixtureLink();
  const result = await service.registerHost({
    inviteToken: link.inviteToken,
    nickname: "방장",
    pin: "1234",
  });
  if (!result.ok) throw new Error("등록 실패");
  const expired = createInvitationService(
    db,
    () => new Date(time.getTime() + 600000),
  );
  let changed = false;
  const outcome = await expired.mutateDraft(
    link.inviteToken,
    result.sessionToken,
    async () => {
      changed = true;
    },
  );
  expect(outcome).toEqual({ ok: false, code: "DRAFT_EXPIRED" });
  expect(changed).toBe(false);
  expect(
    await db.promiseRecord.count({ where: { promiseLinkId: link.id } }),
  ).toBe(0);
  expect(await db.promiseLink.count({ where: { id: link.id } })).toBe(1);
});

it("만료 초안은 위조·누락·타 약속 세션 요청으로 삭제하지 않는다", async () => {
  const link = await fixtureLink();
  const result = await service.registerHost({
    inviteToken: link.inviteToken,
    nickname: "방장",
    pin: "1234",
  });
  if (!result.ok) throw new Error("등록 실패");
  const other = await fixtureLink();
  const otherResult = await service.registerHost({
    inviteToken: other.inviteToken,
    nickname: "다른방장",
    pin: "1234",
  });
  if (!otherResult.ok) throw new Error("다른 등록 실패");
  const expired = createInvitationService(
    db,
    () => new Date(time.getTime() + 600000),
  );

  for (const token of [undefined, "forged", otherResult.sessionToken]) {
    expect(await expired.abandonDraft(link.inviteToken, token)).toEqual({
      ok: false,
      code: "UNAUTHORIZED",
    });
    expect(
      await db.promiseRecord.count({ where: { promiseLinkId: link.id } }),
    ).toBe(1);
  }

  expect(
    await expired.abandonDraft(link.inviteToken, result.sessionToken),
  ).toEqual({ ok: false, code: "DRAFT_EXPIRED" });
  expect(
    await db.promiseRecord.count({ where: { promiseLinkId: link.id } }),
  ).toBe(0);
});

it("DB는 허용되지 않은 약속 상태와 상태별 필수값 누락을 거부한다", async () => {
  const link = await fixtureLink();
  const promise = await db.promiseRecord.create({
    data: { promiseLinkId: link.id },
  });
  const invalid = [
    { status: "unknown" },
    { status: "collecting" },
    { status: "closed" },
    { status: "confirmed" },
    { status: "cancelled" },
    { cancelledAt: time },
    { confirmedStartAt: time },
    { participantLimit: 1 },
    { participantLimit: 31 },
    {
      dateRangeStart: new Date("2026-11-14"),
      dateRangeEnd: new Date("2026-11-13"),
    },
    {
      dateRangeStart: new Date("2026-01-01"),
      dateRangeEnd: new Date("2026-04-01"),
    },
    { dailyStartMinute: -30 },
    { dailyStartMinute: 1440 },
    { dailyStartMinute: 31 },
    { dailyEndMinute: 0 },
    { dailyEndMinute: 1470 },
    { dailyEndMinute: 31 },
    { dailyStartMinute: 600, dailyEndMinute: 600 },
    { durationMinutes: 0 },
    { durationMinutes: 31 },
    { dailyStartMinute: 600, dailyEndMinute: 630, durationMinutes: 60 },
  ];
  for (const data of invalid) {
    await expect(
      db.promiseRecord.update({ where: { id: promise.id }, data }),
    ).rejects.toThrow();
  }
  await expect(
    db.promiseRecord.update({
      where: { id: promise.id },
      data: {
        status: "collecting",
        participantLimit: 2,
        dateRangeStart: new Date("2026-11-13"),
        dateRangeEnd: new Date("2026-11-13"),
        dailyStartMinute: 0,
        dailyEndMinute: 1440,
        durationMinutes: 30,
        votingDeadlineAt: time,
      },
    }),
  ).resolves.toMatchObject({ status: "collecting" });
});

it("DB는 두 방장·잘못된 역할·비활성 방장과 취소 시각 불일치를 거부한다", async () => {
  const link = await fixtureLink();
  const promise = await db.promiseRecord.create({
    data: { promiseLinkId: link.id },
  });
  const host = await db.participant.create({
    data: {
      promiseId: promise.id,
      nickname: "방장",
      normalizedNickname: "방장",
      passwordHash: "test-only",
      role: "host",
    },
  });
  await expect(
    db.participant.create({
      data: {
        promiseId: promise.id,
        nickname: "다른방장",
        normalizedNickname: "다른방장",
        passwordHash: "test-only",
        role: "host",
      },
    }),
  ).rejects.toThrow();
  for (const data of [
    { role: "admin" },
    { status: "unknown" },
    { status: "cancelled", cancelledAt: time },
    { cancelledAt: time },
  ]) {
    await expect(
      db.participant.update({ where: { id: host.id }, data }),
    ).rejects.toThrow();
  }
  await db.participant.update({
    where: { id: host.id },
    data: { role: "member" },
  });
  await expect(
    db.participant.update({
      where: { id: host.id },
      data: { status: "cancelled" },
    }),
  ).rejects.toThrow();
  await expect(
    db.participant.update({
      where: { id: host.id },
      data: { status: "cancelled", cancelledAt: time },
    }),
  ).resolves.toMatchObject({ status: "cancelled" });
});

// 아래는 앞서 구현한 트랜잭션·검증 경계의 추가 회귀 검증이다(새 RED로 기록하지 않음).
it("링크 만료는 유효 세션보다 우선하며 조회·변경·등록 모두 데이터를 보존한다", async () => {
  const link = await fixtureLink(new Date("2026-08-13T00:00:00Z"));
  const promise = await db.promiseRecord.create({
    data: { promiseLinkId: link.id, createdAt: time },
  });
  const host = await db.participant.create({
    data: {
      promiseId: promise.id,
      nickname: "방장",
      normalizedNickname: "방장",
      passwordHash: "test-only",
      role: "host",
    },
  });
  const token = newToken();
  await db.participantSession.create({
    data: {
      participantId: host.id,
      sessionTokenHash: tokenHash(token),
      expiresAt: new Date("2027-01-01"),
    },
  });
  expect(await service.readInvitation(link.inviteToken, token)).toEqual({
    state: "expired",
  });
  expect(await service.abandonDraft(link.inviteToken, token)).toEqual({
    ok: false,
    code: "LINK_EXPIRED",
  });
  expect(
    await service.registerHost({
      inviteToken: link.inviteToken,
      nickname: "새방장",
      pin: "1234",
    }),
  ).toEqual({ ok: false, code: "LINK_EXPIRED" });
  expect(await db.promiseRecord.count({ where: { id: promise.id } })).toBe(1);
});

it("타 약속·만료·탈퇴·일반 참여자 세션은 초안을 변경할 수 없다", async () => {
  const link = await fixtureLink();
  const result = await service.registerHost({
    inviteToken: link.inviteToken,
    nickname: "방장",
    pin: "1234",
  });
  if (!result.ok) throw new Error("등록 실패");
  const promise = await db.promiseRecord.findUniqueOrThrow({
    where: { promiseLinkId: link.id },
  });
  const member = await db.participant.create({
    data: {
      promiseId: promise.id,
      nickname: "멤버",
      normalizedNickname: "멤버",
      passwordHash: "test-only",
      role: "member",
    },
  });
  const token = newToken();
  await db.participantSession.create({
    data: {
      participantId: member.id,
      sessionTokenHash: tokenHash(token),
      expiresAt: new Date(time.getTime() + 600000),
    },
  });
  const denied = { ok: false, code: "UNAUTHORIZED" };
  expect(await service.abandonDraft(link.inviteToken, token)).toEqual(denied);
  await db.participant.update({
    where: { id: member.id },
    data: { status: "cancelled", cancelledAt: time },
  });
  expect(await service.abandonDraft(link.inviteToken, token)).toEqual(denied);
  const other = await fixtureLink();
  const otherResult = await service.registerHost({
    inviteToken: other.inviteToken,
    nickname: "다른방장",
    pin: "1234",
  });
  if (!otherResult.ok) throw new Error("등록 실패");
  expect(
    await service.abandonDraft(link.inviteToken, otherResult.sessionToken),
  ).toEqual(denied);
  await db.participantSession.updateMany({
    where: { sessionTokenHash: tokenHash(result.sessionToken) },
    data: { expiresAt: time },
  });
  expect(
    await service.abandonDraft(link.inviteToken, result.sessionToken),
  ).toEqual(denied);
  expect(await db.promiseRecord.count({ where: { id: promise.id } })).toBe(1);
});

it("세션 저장 실패는 약속과 방장까지 롤백한다", async () => {
  const link = await fixtureLink();
  await db.$executeRawUnsafe(
    `CREATE FUNCTION test_reject_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$`,
  );
  try {
    await db.$executeRawUnsafe(
      `CREATE TRIGGER test_session_failure BEFORE INSERT ON participant_sessions FOR EACH ROW EXECUTE FUNCTION test_reject_session()`,
    );
    expect(
      await service.registerHost({
        inviteToken: link.inviteToken,
        nickname: "방장",
        pin: "0012",
      }),
    ).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(
      await db.promiseRecord.count({ where: { promiseLinkId: link.id } }),
    ).toBe(0);
    expect(
      await db.participant.count({
        where: { promise: { promiseLinkId: link.id } },
      }),
    ).toBe(0);
  } finally {
    await db.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS test_session_failure ON participant_sessions`,
    );
    await db.$executeRawUnsafe(`DROP FUNCTION test_reject_session()`);
  }
});

it("설정 완료가 잠금을 선점하면 동시에 기다리는 만료 정리는 모집 중 약속을 삭제하지 않는다", async () => {
  const link = await fixtureLink();
  const result = await service.registerHost({
    inviteToken: link.inviteToken,
    nickname: "방장",
    pin: "0012",
  });
  if (!result.ok) throw new Error("등록 실패");
  const other = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }),
  });
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const completion = createInvitationService(
    db,
    () => new Date(time.getTime() + 599999),
  ).mutateDraft(link.inviteToken, result.sessionToken, async (tx, promise) => {
    entered();
    await gate;
    await tx.promiseRecord.update({
      where: { id: promise.id },
      data: {
        status: "collecting",
        participantLimit: 2,
        dateRangeStart: new Date("2026-11-14"),
        dateRangeEnd: new Date("2026-11-14"),
        dailyStartMinute: 540,
        dailyEndMinute: 1080,
        durationMinutes: 60,
        votingDeadlineAt: new Date("2026-11-14"),
      },
    });
  });
  await started;
  const cleanup = createInvitationService(
    other,
    () => new Date(time.getTime() + 600000),
  ).abandonDraft(link.inviteToken, result.sessionToken);
  try {
    // 실제 PostgreSQL에서 두 번째 연결이 잠금 대기 중인지 확인한 뒤 첫 트랜잭션을 풀어 준다.
    const end = Date.now() + 3000;
    let waiting = false;
    while (Date.now() < end) {
      const rows = await other.$queryRaw<
        { waiting: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%promise_links%') AS waiting`;
      if (rows[0].waiting) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(waiting).toBe(true);
  } finally {
    release();
  }
  try {
    expect(await completion).toEqual({ ok: true });
    expect(await cleanup).toEqual({ ok: false, code: "NOT_DRAFT" });
    expect(
      await db.promiseRecord.findUnique({ where: { promiseLinkId: link.id } }),
    ).toMatchObject({ status: "collecting" });
  } finally {
    await other.$disconnect();
  }
});

it("기본 UNIQUE와 RESTRICT는 중복 등록·고아 참조·자동 삭제를 차단한다", async () => {
  const link = await fixtureLink();
  const result = await service.registerHost({
    inviteToken: link.inviteToken,
    nickname: " Iris ",
    pin: "0012",
  });
  if (!result.ok) throw new Error("등록 실패");
  const promise = await db.promiseRecord.findUniqueOrThrow({
    where: { promiseLinkId: link.id },
    include: { participants: true },
  });
  expect(promise.participants[0]).toMatchObject({
    nickname: "Iris",
    normalizedNickname: "iris",
  });
  await expect(
    db.promiseLink.create({ data: { inviteToken: link.inviteToken } }),
  ).rejects.toThrow();
  await expect(
    db.promiseRecord.create({ data: { promiseLinkId: link.id } }),
  ).rejects.toThrow();
  await expect(
    db.participant.create({
      data: {
        promiseId: promise.id,
        nickname: "iris",
        normalizedNickname: "iris",
        passwordHash: "test-only",
        role: "member",
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.promiseLink.delete({ where: { id: link.id } }),
  ).rejects.toThrow();
  await expect(
    db.promiseRecord.delete({ where: { id: promise.id } }),
  ).rejects.toThrow();
  await expect(
    db.participant.delete({ where: { id: promise.participants[0].id } }),
  ).rejects.toThrow();
  await expect(
    db.participantSession.create({
      data: {
        participantId: promise.participants[0].id,
        sessionTokenHash: tokenHash(result.sessionToken),
        expiresAt: time,
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.participantSession.create({
      data: {
        participantId: "00000000-0000-0000-0000-000000000001",
        sessionTokenHash: tokenHash(newToken()),
        expiresAt: time,
      },
    }),
  ).rejects.toThrow();
  expect(
    await service.registerHost({
      inviteToken: link.inviteToken,
      nickname: "😀",
      pin: "1234",
    }),
  ).toEqual({ ok: false, code: "INVALID_INPUT" });
});
