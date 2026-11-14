import { beforeAll, afterAll, expect, it } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { verifyTestDatabase } from "../../../scripts/test-database.mjs";
import { newToken, tokenHash } from "../invitation/security";
import { createPromiseSettingsService } from "../promise-settings/service";
import { createConfirmationService } from "./service";
const makeDb=()=>new PrismaClient({adapter:new PrismaPg({connectionString:process.env.TEST_DATABASE_URL})});
const db=makeDb(),otherDb=makeDb(),links:string[]=[];
const at=new Date("2026-11-15T00:00:00Z");
const startAt="2026-11-16T00:00:00.000Z",later="2026-11-16T00:30:00.000Z";
let verified=false;
beforeAll(async()=>{await verifyTestDatabase(process.env.TEST_DATABASE_URL);verified=true;});
afterAll(async()=>{
  if(verified){
    const where={participant:{promise:{promiseLinkId:{in:links}}}};
    await db.participantAvailableSlot.deleteMany({where});
    await db.participantSession.deleteMany({where});
    await db.participant.deleteMany({where:{promise:{promiseLinkId:{in:links}}}});
    await db.promiseRecord.deleteMany({where:{promiseLinkId:{in:links}}});
    await db.promiseLink.deleteMany({where:{id:{in:links}}});
  }
  await db.$disconnect();await otherDb.$disconnect();
});
async function fixture(){
  const link=await db.promiseLink.create({data:{inviteToken:newToken(),createdAt:at}});links.push(link.id);
  const promise=await db.promiseRecord.create({data:{promiseLinkId:link.id,status:"closed",participantLimit:5,dateRangeStart:new Date("2026-11-16"),dateRangeEnd:new Date("2026-11-18"),dailyStartMinute:540,dailyEndMinute:1440,durationMinutes:60,votingDeadlineAt:at}});
  const host=await db.participant.create({data:{promiseId:promise.id,nickname:"방장",normalizedNickname:"방장",passwordHash:"hidden",role:"host",availabilitySubmittedAt:at}});
  const friend=await db.participant.create({data:{promiseId:promise.id,nickname:"친구",normalizedNickname:"친구",passwordHash:"hidden",role:"member",availabilitySubmittedAt:at}});
  const hostToken=newToken(),friendToken=newToken();
  for(const [id,token] of [[host.id,hostToken],[friend.id,friendToken]]){
    await db.participantSession.create({data:{participantId:id,sessionTokenHash:tokenHash(token),expiresAt:new Date("2026-11-22")}});
    await db.participantAvailableSlot.createMany({data:[0,1,2].map(i=>({participantId:id,slotStartAt:new Date(new Date(startAt).getTime()+i*1800000)}))});
  }
  return {link,promise,host,friend,input:{inviteToken:link.inviteToken,sessionToken:hostToken,startAt,expectedParticipantId:host.id},friendInput:{inviteToken:link.inviteToken,sessionToken:friendToken}};
}
it("같은 약속의 현재 방장만 유효 후보를 원자 확정하고 첫 순위를 강제하지 않는다",async()=>{
  const f=await fixture(),other=await fixture(),service=createConfirmationService(db,()=>at);
  expect(await service.confirm({...f.input,sessionToken:undefined})).toMatchObject({ok:false,code:"UNAUTHORIZED"});
  expect(await service.confirm({...f.input,...f.friendInput,expectedParticipantId:f.friend.id})).toMatchObject({ok:false,code:"FORBIDDEN"});
  expect(await service.confirm({...f.input,inviteToken:other.link.inviteToken})).toMatchObject({ok:false,code:"UNAUTHORIZED"});
  expect(await service.confirm({...f.input,expectedParticipantId:f.friend.id})).toMatchObject({ok:false,code:"UNAUTHORIZED"});
  expect(await service.confirm({...f.input,startAt:later})).toEqual({ok:true});
  expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toMatchObject({status:"confirmed",confirmedStartAt:new Date(later)});
});
it("확정 재시도는 멱등이고 기한 경과 collecting을 확정하되 다른 시간으로 덮어쓰지 않는다",async()=>{
  const f=await fixture(),service=createConfirmationService(db,()=>at);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"collecting"}});
  expect(await service.confirm(f.input)).toEqual({ok:true});
  expect(await service.confirm(f.input)).toEqual({ok:true});
  expect(await service.confirm({...f.input,startAt:later})).toEqual({ok:false,code:"ALREADY_CONFIRMED"});
  expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toMatchObject({status:"confirmed",confirmedStartAt:new Date(startAt)});
});
it("결과는 같은 약속 active 참여자에게만 공개하고 과거 결과와 탈퇴 후 1명도 유지한다",async()=>{
  const f=await fixture(),other=await fixture();let current=at;
  const service=createConfirmationService(db,()=>current);
  await service.confirm(f.input);
  expect(await service.read({inviteToken:f.link.inviteToken})).toEqual({ok:false,code:"UNAUTHORIZED"});
  expect(await service.read({...f.friendInput,inviteToken:other.link.inviteToken})).toEqual({ok:false,code:"UNAUTHORIZED"});
  const result=await service.read(f.friendInput);
  expect(result).toMatchObject({ok:true,snapshot:{participantId:f.friend.id,startAt,endAt:"2026-11-16T01:00:00.000Z",attendees:[{id:f.host.id,nickname:"방장"},{id:f.friend.id,nickname:"친구"}]}});
  expect(JSON.stringify(result)).not.toMatch(/passwordHash|sessionToken|availabilitySubmittedAt|availabilityVersion/);
  current=new Date("2026-11-17T00:00:00Z");
  await db.participant.update({where:{id:f.friend.id},data:{status:"cancelled",cancelledAt:current}});
  expect(await service.read(f.friendInput)).toEqual({ok:false,code:"UNAUTHORIZED"});
  expect(await service.read(f.input)).toMatchObject({ok:true,snapshot:{startAt,attendees:[{id:f.host.id,nickname:"방장"}]}});
  expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toMatchObject({status:"confirmed",confirmedStartAt:new Date(startAt)});
  await db.participantSession.updateMany({where:{participantId:f.host.id},data:{expiresAt:current}});
  expect(await service.read(f.input)).toEqual({ok:false,code:"UNAUTHORIZED"});
});
it("잘못된 시간·부족한 공통 인원·마감 전은 거절하고 무효 후보여도 기한 경과 마감은 보존한다",async()=>{
  const f=await fixture();let current=at;const service=createConfirmationService(db,()=>current);
  for(const value of [null,123,"bad","2026-11-16T00:01:00Z"])expect(await service.confirm({...f.input,startAt:value})).toMatchObject({ok:false,code:"INVALID_INPUT"});
  for(const value of ["2026-11-15T00:00:00Z","2026-11-16T14:30:00Z","2026-11-19T00:00:00Z"])expect(await service.confirm({...f.input,startAt:value})).toMatchObject({ok:false,code:"CANDIDATE_INVALID"});
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"collecting",votingDeadlineAt:new Date(at.getTime()+1000)}});
  expect(await service.confirm(f.input)).toMatchObject({ok:false,code:"NOT_CLOSED"});
  current=new Date(at.getTime()+1000);
  await db.participantAvailableSlot.deleteMany({where:{participantId:f.friend.id,slotStartAt:new Date(later)}});
  expect(await service.confirm(f.input)).toMatchObject({ok:false,code:"CANDIDATE_INVALID"});
  expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toMatchObject({status:"closed",confirmedStartAt:null});
  expect(await service.read(f.input)).toEqual({ok:false,code:"NOT_CONFIRMED"});
});
it("서로 다른 후보의 동시 확정은 하나만 성공하고 다른 결과를 덮어쓰지 않는다",async()=>{
  const f=await fixture();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  const first=gate.then(()=>createConfirmationService(db,()=>at).confirm(f.input));
  const second=gate.then(()=>createConfirmationService(otherDb,()=>at).confirm({...f.input,startAt:later}));
  release();const results=await Promise.all([first,second]);
  expect(results.filter(result=>result.ok)).toHaveLength(1);
  expect(results.filter(result=>!result.ok)).toEqual([{ok:false,code:"ALREADY_CONFIRMED"}]);
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).confirmedStartAt?.toISOString()).toBe(results[0].ok?startAt:later);
});
it("잠금 대기 후 최신 역할과 시작 시각 경계으로 확정을 검증한다",async()=>{
  const f=await fixture();let unlock!:()=>void,locked!:()=>void;
  const gate=new Promise<void>(r=>{unlock=r;}),ready=new Promise<void>(r=>{locked=r;});
  const holding=db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM promises WHERE id=${f.promise.id}::uuid FOR UPDATE`;
    locked();await gate;
    await tx.participant.update({where:{id:f.host.id},data:{role:"member"}});
    await tx.participant.update({where:{id:f.friend.id},data:{role:"host"}});
  },{timeout:10000});
  await ready;const confirming=createConfirmationService(otherDb,()=>new Date(startAt)).confirm(f.input);
  try {await expect.poll(async()=>{
    const rows=await db.$queryRaw<{waiting:boolean}[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT p.id FROM promises p%') AS waiting`;
    return rows[0].waiting;
  }).toBe(true);} finally {unlock();await holding;}
  expect(await confirming).toMatchObject({ok:false,code:"FORBIDDEN"});
  expect(await createConfirmationService(otherDb,()=>new Date(startAt)).confirm({...f.friendInput,startAt})).toMatchObject({ok:false,code:"CANDIDATE_INVALID"});
  expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toMatchObject({status:"closed",confirmedStartAt:null});
});
it("현재 참석 가능하지 않은 참여자도 결과를 보고 취소·링크 만료는 인증보다 우선한다",async()=>{
  const f=await fixture(),service=createConfirmationService(db,()=>at);
  const third=await db.participant.create({data:{promiseId:f.promise.id,nickname:"불참자",normalizedNickname:"불참자",role:"member",passwordHash:"hidden"}});
  const token=newToken();await db.participantSession.create({data:{participantId:third.id,sessionTokenHash:tokenHash(token),expiresAt:new Date("2026-11-22")}});
  await service.confirm(f.input);
  expect(await service.read({inviteToken:f.link.inviteToken,sessionToken:token})).toMatchObject({ok:true,snapshot:{participantId:third.id,attendees:expect.arrayContaining([{id:f.host.id,nickname:"방장"},{id:f.friend.id,nickname:"친구"}])}});
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"cancelled",cancelledAt:at}});
  expect(await service.read({inviteToken:f.link.inviteToken})).toEqual({ok:false,code:"PROMISE_CANCELLED"});
  expect(await createConfirmationService(db,()=>new Date("2027-02-15T00:00:00Z")).read(f.input)).toEqual({ok:false,code:"LINK_EXPIRED"});
});

it("저장 오류는 마감 전환까지 롤백하고 확정 후 소요 시간 직접 변경은 거절한다",async()=>{
  const f=await fixture(),service=createConfirmationService(db,()=>at);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"collecting"}});
  await db.$executeRawUnsafe(`CREATE FUNCTION test_confirmation_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'confirmed' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`);
  try {
    await db.$executeRawUnsafe(`CREATE TRIGGER test_confirmation_failure BEFORE UPDATE ON promises FOR EACH ROW EXECUTE FUNCTION test_confirmation_failure()`);
    expect(await service.confirm(f.input)).toEqual({ok:false,code:"UNAVAILABLE"});
    expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toMatchObject({status:"collecting",confirmedStartAt:null});
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_confirmation_failure ON promises`);
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS test_confirmation_failure()`);
  }
  expect(await service.confirm(f.input)).toEqual({ok:true});
  expect(await createPromiseSettingsService(db,()=>at).startCollection({...f.input,settings:{participantLimit:5,dateRangeStart:"2026-11-16",dateRangeEnd:"2026-11-18",dailyStart:"09:00",dailyEnd:"24:00",durationMinutes:120,votingDeadline:"2026-11-15T12:00"}})).toMatchObject({ok:false,code:"NOT_DRAFT"});
  expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toMatchObject({status:"confirmed",durationMinutes:60,confirmedStartAt:new Date(startAt)});
});
