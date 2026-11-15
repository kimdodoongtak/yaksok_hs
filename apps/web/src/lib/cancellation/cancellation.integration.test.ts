import { beforeAll, afterAll, expect, it } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { verifyTestDatabase } from "../../../scripts/test-database.mjs";
import { newToken, tokenHash } from "../invitation/security";
import { createCancellationService } from "./service";
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
it("명시적 취소는 같은 약속의 유효한 현재 방장에게만 허용한다", async () => {
  const f=await fixture(), other=await fixture(), service=createCancellationService(db,()=>at);
  expect(await service.cancel({...f.host.input,sessionToken:undefined})).toEqual({ok:false,code:"UNAUTHORIZED"});
  expect(await service.cancel(f.friend.input)).toEqual({ok:false,code:"FORBIDDEN"});
  expect(await service.cancel({...f.host.input,inviteToken:other.link.inviteToken})).toEqual({ok:false,code:"UNAUTHORIZED"});
  expect(await service.cancel({...f.host.input,expectedParticipantId:f.friend.id})).toEqual({ok:false,code:"UNAUTHORIZED"});
  expect(await service.cancel({...f.host.input,expectedParticipantId:undefined})).toEqual({ok:false,code:"UNAUTHORIZED"});
  await db.participantSession.updateMany({where:{participantId:f.host.id},data:{expiresAt:at}});
  expect(await service.cancel(f.host.input)).toEqual({ok:false,code:"UNAUTHORIZED"});
  expect(await db.promiseRecord.findUnique({where:{id:f.promise.id}})).toMatchObject({status:"collecting",cancelledAt:null});
});
it("방장은 모든 미취소 상태에서 취소하며 설정·확정·참여 기록과 세션 행을 보존한다", async () => {
  const service=createCancellationService(db,()=>at);
  for (const status of ["draft","collecting","closed","confirmed"]) {
    const f=await fixture();
    if(status==="draft") {
      await db.participantAvailableSlot.deleteMany({where:{participantId:f.friend.id}});
      await db.participantSession.deleteMany({where:{participantId:f.friend.id}});
      await db.participant.delete({where:{id:f.friend.id}});
    }
    await db.promiseRecord.update({where:{id:f.promise.id},data:{status,createdAt:at,confirmedStartAt:status==="confirmed"?new Date("2026-11-16T00:00:00Z"):null}});
    const before=await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}});
    const people=await db.participant.findMany({where:{promiseId:f.promise.id},orderBy:{id:"asc"},include:{availableSlots:true}});
    const sessions=await db.participantSession.findMany({where:{participant:{promiseId:f.promise.id}},orderBy:{id:"asc"}});
    expect(await service.cancel(f.host.input)).toEqual({ok:true});
    expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toEqual({...before,status:"cancelled",cancelledAt:at});
    expect(await db.participant.findMany({where:{promiseId:f.promise.id},orderBy:{id:"asc"},include:{availableSlots:true}})).toEqual(people);
    expect(await db.participantSession.findMany({where:{participant:{promiseId:f.promise.id}},orderBy:{id:"asc"}})).toEqual(sessions.map(row=>({...row,expiresAt:at})));
    expect(await createCancellationService(db,()=>new Date(at.getTime()+1)).cancel(f.host.input)).toEqual({ok:false,code:"PROMISE_CANCELLED"});
    expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).cancelledAt).toEqual(at);
  }
});

it("취소 중 DB 오류는 약속·세션 전체를 롤백하고 재시도할 수 있다",async()=>{
  const f=await fixture(),service=createCancellationService(db,()=>at);
  const before=await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}});
  const sessions=await db.participantSession.findMany({where:{participant:{promiseId:f.promise.id}},orderBy:{id:"asc"}});
  await db.$executeRawUnsafe(`CREATE FUNCTION test_cancellation_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$`);
  try {
    await db.$executeRawUnsafe(`CREATE TRIGGER test_cancellation_failure BEFORE UPDATE ON participant_sessions FOR EACH ROW EXECUTE FUNCTION test_cancellation_failure()`);
    expect(await service.cancel(f.host.input)).toEqual({ok:false,code:"UNAVAILABLE"});
    expect(await db.promiseRecord.findUnique({where:{id:f.promise.id}})).toEqual(before);
    expect(await db.participantSession.findMany({where:{participant:{promiseId:f.promise.id}},orderBy:{id:"asc"}})).toEqual(sessions);
  }finally{
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_cancellation_failure ON participant_sessions`);
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS test_cancellation_failure()`);
  }
  expect(await service.cancel(f.host.input)).toEqual({ok:true});
});
it("링크 만료·취소·초안 만료 순서를 따르고 만료된 초안을 취소로 되살리지 않는다",async()=>{
  const f=await fixture(),service=createCancellationService(db,()=>at);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"draft",createdAt:new Date(at.getTime()-600000)}});
  expect(await service.cancel(f.host.input)).toEqual({ok:false,code:"DRAFT_EXPIRED"});
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("draft");
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"cancelled",cancelledAt:at}});
  expect(await service.cancel({...f.host.input,sessionToken:undefined})).toEqual({ok:false,code:"PROMISE_CANCELLED"});
  await db.promiseLink.update({where:{id:f.link.id},data:{createdAt:new Date("2026-08-15T00:00:00Z")}});
  expect(await service.cancel(f.host.input)).toEqual({ok:false,code:"LINK_EXPIRED"});
});
it("취소 후 기존 서비스의 조회·등록·탈퇴·투표·확정·재조율은 기록을 변경하지 않는다",async()=>{
  const f=await fixture();
  const {createParticipantAccessService}=await import("../participant-access/service");
  const {createAvailabilityService}=await import("../availability/service");
  const {createCandidatesService}=await import("../candidates/service");
  const {createConfirmationService}=await import("../confirmation/service");
  const {createReschedulingService}=await import("../rescheduling/service");
  const {createParticipantManagementService}=await import("../participant-management/service");
  const {createInvitationService}=await import("../invitation/service");
  const {createPromiseSettingsService}=await import("../promise-settings/service");
  const clock=()=>at, auth=createParticipantAccessService(db,clock,async()=>"hash"),availability=createAvailabilityService(db,clock),candidates=createCandidatesService(db,clock),confirmation=createConfirmationService(db,clock),management=createParticipantManagementService(db,clock),invitation=createInvitationService(db,clock,async()=>"hash");
  expect(await createCancellationService(db,clock).cancel(f.host.input)).toEqual({ok:true});
  const before=await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id},include:{participants:{orderBy:{id:"asc"},include:{availableSlots:true,sessions:true}}}});
  const settings={participantLimit:"5",dateRangeStart:"2026-11-16",dateRangeEnd:"2026-11-18",dailyStart:"09:00",dailyEnd:"18:00",durationMinutes:"60",votingDeadline:"2026-11-15T21:00"};
  const results=await Promise.all([
    auth.read(f.host.input),auth.page({inviteToken:f.link.inviteToken}),auth.join({inviteToken:f.link.inviteToken,nickname:"새친구",pin:"1234"}),auth.authenticate({inviteToken:f.link.inviteToken,nickname:"방장",pin:"1234"}),auth.changePin({...f.host.input,currentPin:"1234",newPin:"5678"}),
    availability.read(f.host.input),availability.submit({...f.friend.input,baseVersion:3,slots:[]}),candidates.read(f.host.input),candidates.close(f.host.input),confirmation.read(f.host.input),confirmation.confirm({...f.host.input,startAt:"2026-11-16T00:00:00Z"}),
    management.leave(f.friend.input),management.remove({...f.host.input,targetParticipantId:f.friend.id}),
    createReschedulingService(db,clock).change({...f.host.input,mode:"reopen",settings,confirmedImpact:"same",confirmedClear:false}),
    createPromiseSettingsService(db,clock).startCollection({...f.host.input,settings}),invitation.abandonDraft(f.link.inviteToken,f.host.input.sessionToken),invitation.registerHost({inviteToken:f.link.inviteToken,nickname:"방장",pin:"1234"})
  ]);
  for(const result of results)expect(result).toEqual({ok:false,code:"PROMISE_CANCELLED"});
  expect(await invitation.readInvitation(f.link.inviteToken)).toEqual({state:"cancelled"});
  expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id},include:{participants:{orderBy:{id:"asc"},include:{availableSlots:true,sessions:true}}}})).toEqual(before);
});
it("동시 취소·제출과 중복 취소는 잠금 순서로 처리하고 취소 시각을 덮어쓰지 않는다",async()=>{
  const f=await fixture(),a=createCancellationService(db,()=>at),b=createCancellationService(otherDb,()=>new Date(at.getTime()+1));
  let go!:()=>void;const gate=new Promise<void>(resolve=>{go=resolve;});
  const first=gate.then(()=>a.cancel(f.host.input)),second=gate.then(()=>b.cancel(f.host.input));go();
  const results=await Promise.all([first,second]);expect(results.filter(r=>r.ok)).toHaveLength(1);expect(results.find(r=>!r.ok)).toEqual({ok:false,code:"PROMISE_CANCELLED"});
  const saved=(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).cancelledAt;
  expect(saved).toEqual(results[0].ok?at:new Date(at.getTime()+1));
  const g=await fixture();const {createAvailabilityService}=await import("../availability/service");
  let release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});
  const cancel=barrier.then(()=>a.cancel(g.host.input));
  const submit=barrier.then(()=>createAvailabilityService(otherDb,()=>at).submit({...g.friend.input,baseVersion:3,slots:[]}));
  release();const [cancelled,submitted]=await Promise.all([cancel,submit]);
  expect(cancelled.ok).toBe(true);expect(submitted.ok||submitted.code==="PROMISE_CANCELLED").toBe(true);
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:g.promise.id}})).status).toBe("cancelled");
  expect(await db.participantAvailableSlot.count({where:{participantId:g.friend.id}})).toBe(submitted.ok?0:2);
  expect(await db.participantSession.count({where:{participant:{promiseId:g.promise.id},expiresAt:{gt:at}}})).toBe(0);
});
