import { beforeAll, afterAll, expect, it } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { verifyTestDatabase } from "../../../scripts/test-database.mjs";
import { newToken, tokenHash } from "../invitation/security";
import { createParticipantManagementService } from "./service";
const makeDb = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
const db = makeDb(), otherDb = makeDb(), links: string[] = [];
const at = new Date("2026-11-15T00:00:00Z");
let verified = false;
beforeAll(async () => { await verifyTestDatabase(process.env.TEST_DATABASE_URL); verified = true; });
afterAll(async () => {
  if (verified) {
    const where = { participant: { promise: { promiseLinkId: { in: links } } } };
    await db.participantAvailableSlot.deleteMany({ where });
    await db.participantSession.deleteMany({ where });
    await db.participant.deleteMany({ where: { promise: { promiseLinkId: { in: links } } } });
    await db.promiseRecord.deleteMany({ where: { promiseLinkId: { in: links } } });
    await db.promiseLink.deleteMany({ where: { id: { in: links } } });
  }
  await db.$disconnect(); await otherDb.$disconnect();
});
async function fixture() {
  const link = await db.promiseLink.create({ data: { inviteToken: newToken(), createdAt: at } }); links.push(link.id);
  const promise = await db.promiseRecord.create({ data: { promiseLinkId: link.id, status: "collecting", participantLimit: 5, dateRangeStart: new Date("2026-11-16"), dateRangeEnd: new Date("2026-11-18"), dailyStartMinute: 540, dailyEndMinute: 1080, durationMinutes: 60, votingDeadlineAt: new Date("2026-11-15T12:00:00Z") } });
  async function member(nickname: string, role: string, createdAt: Date) {
    const person = await db.participant.create({ data: { promiseId: promise.id, nickname, normalizedNickname: nickname, passwordHash: "preserved-hash", role, createdAt, availabilitySubmittedAt: at, availabilityVersion: 3 } });
    const token = newToken();
    for (const value of [token, newToken()]) await db.participantSession.create({ data: { participantId: person.id, sessionTokenHash: tokenHash(value), expiresAt: new Date("2026-11-22") } });
    await db.participantAvailableSlot.createMany({ data: ["00:00", "00:30"].map(time => ({ participantId: person.id, slotStartAt: new Date(`2026-11-16T${time}:00Z`) })) });
    return { ...person, input: { inviteToken: link.inviteToken, sessionToken: token, expectedParticipantId: person.id, expectedSuccessorId: null, expectedRole: role } };
  }
  const host = await member("방장", "host", at), friend = await member("친구", "member", new Date(at.getTime() + 1000));
  return { link, promise, host, friend, member };
}
it("본인 탈퇴는 인증·소속을 확인하고 기록을 보존하며 모든 기기 세션을 즉시 만료한다", async () => {
  const f = await fixture(), other = await fixture(), service = createParticipantManagementService(db, () => at);
  expect(await service.leave({ ...f.friend.input, sessionToken: undefined })).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  expect(await service.leave({ ...f.friend.input, inviteToken: other.link.inviteToken })).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  expect(await service.leave({ ...f.friend.input, expectedParticipantId: f.host.id })).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  const before = await db.participant.findUniqueOrThrow({ where: { id: f.friend.id }, include: { availableSlots: true } });
  const sessions = await db.participantSession.findMany({ where: { participantId: f.friend.id } });
  expect(await service.leave(f.friend.input)).toEqual({ ok: true, outcome: "left" });
  expect(await db.participant.findUniqueOrThrow({ where: { id: f.friend.id }, include: { availableSlots: true } })).toEqual({ ...before, status: "cancelled", cancelledAt: at });
  expect(await db.participantSession.count({ where: { participantId: f.friend.id } })).toBe(2);
  for (const session of sessions) expect(await db.participantSession.findUnique({ where: { id: session.id } })).toEqual({ ...session, expiresAt: at });
  expect(await service.leave(f.friend.input)).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
});
it("방장 탈퇴는 제출 여부와 무관하게 가입 시각·ID 순으로 승계하며 바뀐 후임은 재확인한다", async () => {
  const f = await fixture(), service = createParticipantManagementService(db, () => at);
  const second = await f.member("두번째", "member", f.friend.createdAt);
  const ordered = [f.friend, second].sort((a,b) => a.id.localeCompare(b.id));
  await db.participant.update({ where: { id: ordered[0].id }, data: { availabilitySubmittedAt: null } });
  expect(await service.leave({ ...f.host.input, expectedSuccessorId: null })).toMatchObject({ ok: false, code: "SUCCESSOR_CHANGED" });
  expect(await service.leave({ ...f.host.input, expectedSuccessorId: ordered[0].id })).toEqual({ ok: true, outcome: "left", successorNickname: ordered[0].nickname });
  expect(await db.participant.findUnique({ where: { id: f.host.id } })).toMatchObject({ role: "member", status: "cancelled" });
  expect(await db.participant.findUnique({ where: { id: ordered[0].id } })).toMatchObject({ role: "host", status: "active", availabilitySubmittedAt: null });
  expect(await db.participant.count({ where: { promiseId: f.promise.id, role: "host", status: "active" } })).toBe(1);
});
it("마지막 방장은 참여 기록을 유지하고 약속 취소와 전체 세션 만료를 함께 수행한다", async () => {
  const f = await fixture(), service = createParticipantManagementService(db, () => at);
  expect(await service.leave(f.friend.input)).toMatchObject({ ok: true });
  const host = await db.participant.findUnique({ where: { id: f.host.id } });
  expect(await service.leave({ ...f.host.input, expectedSuccessorId: f.friend.id })).toMatchObject({ ok: false, code: "SUCCESSOR_CHANGED" });
  expect(await service.leave(f.host.input)).toEqual({ ok: true, outcome: "cancelled" });
  expect(await db.participant.findUnique({ where: { id: f.host.id } })).toEqual(host);
  expect(await db.promiseRecord.findUnique({ where: { id: f.promise.id } })).toMatchObject({ status: "cancelled", cancelledAt: at });
  expect(await db.participantSession.count({ where: { participant: { promiseId: f.promise.id } } })).toBe(4);
  expect(await db.participantSession.count({ where: { participant: { promiseId: f.promise.id }, expiresAt: { gt: at } } })).toBe(0);
  expect(await service.leave(f.host.input)).toMatchObject({ ok: false, code: "PROMISE_CANCELLED" });
});
it("방장의 내보내기는 마감 전 같은 약속의 다른 active 참여자에게만 허용한다", async () => {
  const f = await fixture(), other = await fixture(), service = createParticipantManagementService(db, () => at);
  const input = { ...f.host.input, targetParticipantId: f.friend.id };
  expect(await service.remove({ ...f.friend.input, targetParticipantId: f.host.id })).toMatchObject({ ok: false, code: "FORBIDDEN" });
  for (const targetParticipantId of [f.host.id, other.friend.id, "invalid"]) expect(await service.remove({ ...input, targetParticipantId })).toMatchObject({ ok: false, code: "INVALID_TARGET" });
  for (const status of ["closed", "confirmed"]) {
    await db.promiseRecord.update({ where: { id: f.promise.id }, data: { status, confirmedStartAt: status === "confirmed" ? new Date("2026-11-16T00:00:00Z") : null } });
    expect(await service.remove(input)).toMatchObject({ ok: false, code: "STATE_CHANGED" });
  }
  await db.promiseRecord.update({ where: { id: f.promise.id }, data: { status: "collecting", confirmedStartAt: null, votingDeadlineAt: at } });
  expect(await service.remove(input)).toMatchObject({ ok: false, code: "STATE_CHANGED" });
  await db.promiseRecord.update({ where: { id: f.promise.id }, data: { status: "collecting", votingDeadlineAt: new Date(at.getTime()+1) } });
  expect(await service.remove(input)).toEqual({ ok: true, outcome: "removed" });
  expect(await db.participant.findUnique({ where: { id: f.friend.id } })).toMatchObject({ status: "cancelled", cancelledAt: at, passwordHash: "preserved-hash", availabilityVersion: 3, availabilitySubmittedAt: at });
  expect(await db.participantAvailableSlot.count({ where: { participantId: f.friend.id } })).toBe(2);
  expect(await db.participantSession.count({ where: { participantId: f.friend.id, expiresAt: at } })).toBe(2);
  expect(await service.remove(input)).toMatchObject({ ok: false, code: "INVALID_TARGET" });
});
it("일반 참여자의 나가기 확인 후 방장이 되면 약속 취소 전에 새 역할을 확인해야 한다", async () => {
  const f = await fixture(), service = createParticipantManagementService(db, () => at);
  expect(await service.leave({ ...f.host.input, expectedSuccessorId: f.friend.id })).toMatchObject({ ok: true });
  expect(await service.leave(f.friend.input)).toMatchObject({ ok: false, code: "STATE_CHANGED" });
  expect(await db.promiseRecord.findUnique({ where: { id: f.promise.id } })).toMatchObject({ status: "collecting" });
  expect(await service.leave({ ...f.friend.input, expectedRole: "host" })).toMatchObject({ ok: true, outcome: "cancelled" });
});
it("마감·확정 뒤에도 본인 탈퇴가 가능하며 후보와 참석자만 갱신하고 확정은 유지한다", async () => {
  const { createCandidatesService } = await import("../candidates/service");
  const { createConfirmationService } = await import("../confirmation/service");
  for (const status of ["closed", "confirmed"]) {
    const f = await fixture();
    await db.promiseRecord.update({ where: { id: f.promise.id }, data: { status, confirmedStartAt: status === "confirmed" ? new Date("2026-11-16T00:00:00Z") : null } });
    expect(await createParticipantManagementService(db,()=>at).leave(f.friend.input)).toMatchObject({ ok:true });
    const overview = await createCandidatesService(db,()=>at).read(f.host.input);
    expect(overview.ok && overview.snapshot.participants.map(p=>p.id)).toEqual([f.host.id]);
    expect(overview.ok && overview.snapshot.candidates).toEqual([]);
    if(status === "confirmed") {
      const result = await createConfirmationService(db,()=>at).read(f.host.input);
      expect(result).toMatchObject({ ok:true,snapshot:{startAt:"2026-11-16T00:00:00.000Z",attendees:[{id:f.host.id}]} });
    }
    expect(await db.promiseRecord.findUnique({where:{id:f.promise.id}})).toMatchObject({status});
  }
});
it("승계 중 실패와 마지막 방장 취소 중 실패는 세션·역할·약속을 모두 롤백한다", async () => {
  const f=await fixture(),service=createParticipantManagementService(db,()=>at);
  const before=await db.participant.findMany({where:{promiseId:f.promise.id},orderBy:{id:"asc"},include:{sessions:true}});
  await db.$executeRawUnsafe(`CREATE FUNCTION test_management_host_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.role = 'host' AND OLD.role = 'member' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`);
  try {
    await db.$executeRawUnsafe(`CREATE TRIGGER test_management_host_failure BEFORE UPDATE ON participants FOR EACH ROW EXECUTE FUNCTION test_management_host_failure()`);
    expect(await service.leave({...f.host.input,expectedSuccessorId:f.friend.id})).toEqual({ok:false,code:"UNAVAILABLE"});
    expect(await db.participant.findMany({where:{promiseId:f.promise.id},orderBy:{id:"asc"},include:{sessions:true}})).toEqual(before);
  } finally { await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_management_host_failure ON participants`);await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS test_management_host_failure()`); }
  expect(await service.leave(f.friend.input)).toMatchObject({ok:true});
  await db.$executeRawUnsafe(`CREATE FUNCTION test_management_session_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$`);
  try {
    await db.$executeRawUnsafe(`CREATE TRIGGER test_management_session_failure BEFORE UPDATE ON participant_sessions FOR EACH ROW EXECUTE FUNCTION test_management_session_failure()`);
    expect(await service.leave(f.host.input)).toEqual({ok:false,code:"UNAVAILABLE"});
    expect(await db.promiseRecord.findUnique({where:{id:f.promise.id}})).toMatchObject({status:"collecting",cancelledAt:null});
    expect(await db.participantSession.count({where:{participantId:f.host.id,expiresAt:{gt:at}}})).toBe(2);
  } finally { await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_management_session_failure ON participant_sessions`);await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS test_management_session_failure()`); }
  expect(await service.leave(f.host.input)).toMatchObject({ok:true,outcome:"cancelled"});
});
it("동시 탈퇴·내보내기는 한 번만 반영하고 가입과 경쟁해도 정원·방장 불변식을 유지한다", async () => {
  const f=await fixture(),a=createParticipantManagementService(db,()=>at),b=createParticipantManagementService(otherDb,()=>at);
  let go!:()=>void;const gate=new Promise<void>(r=>{go=r;});
  const left=gate.then(()=>a.leave(f.friend.input)),removed=gate.then(()=>b.remove({...f.host.input,targetParticipantId:f.friend.id}));
  go();const results=await Promise.all([left,removed]);expect(results.filter(r=>r.ok)).toHaveLength(1);
  expect(await db.participant.count({where:{promiseId:f.promise.id,status:"active",role:"host"}})).toBe(1);
  const g=await fixture();await db.promiseRecord.update({where:{id:g.promise.id},data:{participantLimit:2}});
  const {createParticipantAccessService}=await import("../participant-access/service");
  const joining=createParticipantAccessService(otherDb,()=>at,async()=>"preserved-hash");
  let release!:()=>void;const barrier=new Promise<void>(r=>{release=r;});
  const leaving=barrier.then(()=>a.leave(g.friend.input));
  const entering=barrier.then(()=>joining.join({inviteToken:g.link.inviteToken,nickname:"새참여자",pin:"1234"}));
  release();const [leave,join]=await Promise.all([leaving,entering]);expect(leave.ok).toBe(true);expect(join.ok||join.code==="CAPACITY_FULL").toBe(true);
  expect(await db.participant.count({where:{promiseId:g.promise.id,status:"active"}})).toBe(join.ok?2:1);
  expect(await db.participant.count({where:{promiseId:g.promise.id,status:"active",role:"host"}})).toBe(1);
});
it("만료·취소는 우선 거절하고 draft는 기존 폐기 경로로 남긴다", async () => {
  const f=await fixture(),service=createParticipantManagementService(db,()=>at);
  await db.participantSession.updateMany({where:{participantId:f.friend.id},data:{expiresAt:at}});
  expect(await service.leave(f.friend.input)).toMatchObject({ok:false,code:"UNAUTHORIZED"});
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"cancelled",cancelledAt:at}});
  expect(await service.leave(f.friend.input)).toMatchObject({ok:false,code:"PROMISE_CANCELLED"});
  expect(await service.remove({...f.host.input,targetParticipantId:f.friend.id})).toMatchObject({ok:false,code:"PROMISE_CANCELLED"});
  await db.promiseLink.update({where:{id:f.link.id},data:{createdAt:new Date("2026-08-15T00:00:00Z")}});
  expect(await service.leave(f.host.input)).toMatchObject({ok:false,code:"LINK_EXPIRED"});
  const g=await fixture();await db.promiseRecord.update({where:{id:g.promise.id},data:{status:"draft",createdAt:at}});
  expect(await service.leave(g.host.input)).toMatchObject({ok:false,code:"STATE_CHANGED"});
  expect(await db.promiseRecord.count({where:{id:g.promise.id}})).toBe(1);
});
it("참여자 조회는 인증된 active 명단·최신 역할만 제공하고 개인정보를 노출하지 않는다",async()=>{
  const f=await fixture(),service=createParticipantManagementService(db,()=>at);
  expect(await service.read({inviteToken:f.link.inviteToken})).toEqual({ok:false,code:"UNAUTHORIZED"});
  expect(await service.read(f.host.input)).toEqual({ok:true,snapshot:{participantId:f.host.id,role:"host",status:"collecting",participants:[{id:f.host.id,nickname:"방장",role:"host"},{id:f.friend.id,nickname:"친구",role:"member"}]}});
  expect(await service.leave({...f.host.input,expectedSuccessorId:f.friend.id})).toMatchObject({ok:true});
  expect(await service.read(f.friend.input)).toEqual({ok:true,snapshot:{participantId:f.friend.id,role:"host",status:"collecting",participants:[{id:f.friend.id,nickname:"친구",role:"host"}]}});
  expect(await service.read(f.host.input)).toEqual({ok:false,code:"UNAUTHORIZED"});
  await db.promiseRecord.update({where:{id:f.promise.id},data:{votingDeadlineAt:at}});
  expect(await service.read(f.friend.input)).toMatchObject({ok:true,snapshot:{status:"closed"}});
});
