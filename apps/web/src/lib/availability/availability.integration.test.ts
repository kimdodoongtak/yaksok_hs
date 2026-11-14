import { beforeAll, afterAll, expect, it } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { verifyTestDatabase } from "../../../scripts/test-database.mjs";
import { newToken, tokenHash } from "../invitation/security";
import { createAvailabilityService } from "./service";
const makeDb = () => new PrismaClient({adapter: new PrismaPg({connectionString:process.env.TEST_DATABASE_URL})});
const db=makeDb(), otherDb=makeDb();
const links:string[]=[];
const at = new Date("2026-11-14T00:00:00Z");
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
  const promise=await db.promiseRecord.create({data:{promiseLinkId:link.id,status:"collecting",participantLimit:5,dateRangeStart:new Date("2026-11-15"),dateRangeEnd:new Date("2026-11-16"),dailyStartMinute:540,dailyEndMinute:1440,durationMinutes:120,votingDeadlineAt:new Date("2026-11-15T00:00:00Z"),createdAt:at}});
  const host=await db.participant.create({data:{promiseId:promise.id,nickname:"방장",normalizedNickname:"방장",passwordHash:"unused",role:"host"}});
  const member=await db.participant.create({data:{promiseId:promise.id,nickname:"참여자",normalizedNickname:"참여자",passwordHash:"unused",role:"member"}});
  const sessionToken=newToken();
  await db.participantSession.create({data:{participantId:member.id,sessionTokenHash:tokenHash(sessionToken),expiresAt:new Date("2026-11-22T00:00:00Z")}});
  return {link,promise,host,member,input:{inviteToken:link.inviteToken,sessionToken}};
}
const first="2026-11-15T00:00:00.000Z", second="2026-11-15T00:30:00.000Z";
it("본인 최종 슬롯·제출 시각·버전을 함께 저장하고 빈 재제출도 제출로 기록한다",async()=>{
  const f=await fixture();const service=createAvailabilityService(db,()=>at);
  expect(await service.submit({...f.input,baseVersion:0,slots:[first,first,second]})).toMatchObject({ok:true});
  expect((await db.participantAvailableSlot.findMany({where:{participantId:f.member.id},orderBy:{slotStartAt:"asc"}})).map(s=>s.slotStartAt.toISOString())).toEqual([first,second]);
  expect(await db.participant.findUnique({where:{id:f.member.id}})).toMatchObject({availabilityVersion:1,availabilitySubmittedAt:at});
  expect(await service.submit({...f.input,baseVersion:1,slots:[]})).toMatchObject({ok:true});
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(0);
  expect(await db.participant.findUnique({where:{id:f.member.id}})).toMatchObject({availabilityVersion:2,availabilitySubmittedAt:at});
  expect(await db.participant.findUnique({where:{id:f.host.id}})).toMatchObject({availabilityVersion:0,availabilitySubmittedAt:null});
});
it("오래된 버전의 다른 선택은 최신 값을 반환하고 같은 결과 재시도는 버전을 늘리지 않는다",async()=>{
  const f=await fixture();const service=createAvailabilityService(db,()=>at);
  await service.submit({...f.input,baseVersion:0,slots:[first]});
  expect(await service.submit({...f.input,baseVersion:0,slots:[second]})).toMatchObject({ok:false,code:"AVAILABILITY_VERSION_CONFLICT",snapshot:{version:1,slots:[first]}});
  expect(await service.submit({...f.input,baseVersion:0,slots:[first,first]})).toMatchObject({ok:true,snapshot:{version:1,slots:[first]}});
  await db.participant.update({where:{id:f.member.id},data:{availabilityVersion:{increment:1},availabilitySubmittedAt:null}});
  expect(await service.submit({...f.input,baseVersion:1,slots:[first]})).toMatchObject({ok:false,code:"AVAILABILITY_VERSION_CONFLICT",snapshot:{version:2,submittedAt:null}});
});
it("본인 조회는 최신 설정·선택만 반환하고 마감 GET은 DB 상태를 변경하지 않는다",async()=>{
  const f=await fixture();let current=at;const service=createAvailabilityService(db,()=>current);
  expect(await service.read(f.input)).toMatchObject({ok:true,snapshot:{participantId:f.member.id,version:0,submittedAt:null,slots:[],status:"collecting",settings:{dailyEndMinute:1440}}});
  const other=await fixture();
  expect(await service.read({...f.input,inviteToken:other.link.inviteToken})).toMatchObject({ok:false,code:"UNAUTHORIZED"});
  current=new Date("2026-11-15T00:00:00Z");
  expect(await service.read(f.input)).toMatchObject({ok:true,snapshot:{status:"closed"}});
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("collecting");
});
it("마감 정각 제출은 closed를 저장하고 선택·버전은 변경하지 않는다",async()=>{
  const f=await fixture();const service=createAvailabilityService(db,()=>new Date("2026-11-15T00:00:00Z"));
  expect(await service.submit({...f.input,baseVersion:0,slots:[second]})).toMatchObject({ok:false,code:"VOTING_CLOSED"});
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("closed");
  expect((await db.participant.findUniqueOrThrow({where:{id:f.member.id}})).availabilityVersion).toBe(0);
  for (const status of ["draft","confirmed"]){
    await db.promiseRecord.update({where:{id:f.promise.id},data:{status,createdAt:new Date("2026-11-15T00:00:00Z"),confirmedStartAt:status==="confirmed"?new Date(first):null}});
    expect(await service.submit({...f.input,baseVersion:0,slots:[]})).toMatchObject({ok:false,code:"VOTING_CLOSED"});
  }
});
it("독립 연결의 동시 제출은 하나만 저장하고 같은 재시도는 성공한다", async()=>{
  const f=await fixture();
  const services=[createAvailabilityService(db,()=>at),createAvailabilityService(otherDb,()=>at)];
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const requests=services.map((service,i)=>(async()=>{await gate;return service.submit({...f.input,baseVersion:0,slots:[i?second:first]});})());
  release();const results=await Promise.all(requests);
  expect(results.filter(r=>r.ok)).toHaveLength(1);
  expect(results.filter(r=>!r.ok && r.code==="AVAILABILITY_VERSION_CONFLICT")).toHaveLength(1);
  const winner=results.find(r=>r.ok)!;
  if(!winner.ok) throw new Error("성공 없음");
  expect((await db.participant.findUniqueOrThrow({where:{id:f.member.id}})).availabilityVersion).toBe(1);
  const retries=await Promise.all(services.map(service=>service.submit({...f.input,baseVersion:0,slots:winner.snapshot.slots})));
  expect(retries.every(r=>r.ok && r.snapshot.version===1)).toBe(true);
});
it("세션 없는 요청·다른 약속·비활성 참여자를 막고 취소 안내를 인증보다 우선한다",async()=>{
  const f=await fixture(), other=await fixture();const service=createAvailabilityService(db,()=>at);
  const submit=(input:typeof f.input | {inviteToken:string})=>service.submit({...input,baseVersion:0,slots:[first]});
  expect(await submit({inviteToken:f.link.inviteToken})).toMatchObject({ok:false,code:"UNAUTHORIZED"});
  expect(await submit({...f.input,inviteToken:other.link.inviteToken})).toMatchObject({ok:false,code:"UNAUTHORIZED"});
  await db.participant.update({where:{id:f.member.id},data:{status:"cancelled",cancelledAt:at}});
  expect(await submit(f.input)).toMatchObject({ok:false,code:"UNAUTHORIZED"});
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"cancelled",cancelledAt:at}});
  expect(await submit({inviteToken:f.link.inviteToken})).toMatchObject({ok:false,code:"PROMISE_CANCELLED"});
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(0);
});
it("DB 제약이 30분 위반·중복·참조 중 참여자 삭제를 거절한다",async()=>{
  const f=await fixture();
  for(const slot of ["2026-11-15T00:15:00Z","2026-11-15T00:30:01Z"]){
    await expect(db.participantAvailableSlot.create({data:{participantId:f.member.id,slotStartAt:new Date(slot)}})).rejects.toThrow();
  }
  await db.participantAvailableSlot.create({data:{participantId:f.member.id,slotStartAt:new Date(first)}});
  await expect(db.participantAvailableSlot.create({data:{participantId:f.member.id,slotStartAt:new Date(first)}})).rejects.toThrow();
  await db.participantSession.deleteMany({where:{participantId:f.member.id}});
  await expect(db.participant.delete({where:{id:f.member.id}})).rejects.toThrow();
});
it("저장 도중 오류가 나면 기존 슬롯·제출 시각·버전을 모두 롤백한다",async()=>{
  const f=await fixture(), service=createAvailabilityService(db,()=>at);
  await service.submit({...f.input,baseVersion:0,slots:[first]});
  // 허용된 전용 DB에만 대상 참여자의 갱신을 거절하는 임시 제약을 설치한다.
  await db.$executeRawUnsafe(`ALTER TABLE participants ADD CONSTRAINT test_availability_rollback CHECK (id <> '${f.member.id}'::uuid OR availability_version <= 1)`);
  try {
    expect(await service.submit({...f.input,baseVersion:1,slots:[second]})).toMatchObject({ok:false,code:"UNAVAILABLE"});
    expect(await service.read(f.input)).toMatchObject({ok:true,snapshot:{version:1,submittedAt:at.toISOString(),slots:[first]}});
  } finally {await db.$executeRawUnsafe('ALTER TABLE participants DROP CONSTRAINT test_availability_rollback');}
});
it("잠금을 기다리는 동안 마감이 지나면 잠금 획득 후 시각으로 거절한다",async()=>{
  const f=await fixture();let current=at;
  let unlock!:()=>void, locked!:()=>void;
  const gate=new Promise<void>(r=>{unlock=r;}), ready=new Promise<void>(r=>{locked=r;});
  const holding=db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM promises WHERE id=${f.promise.id}::uuid FOR UPDATE`;locked();await gate;},{timeout:10000});
  await ready;
  const saving=createAvailabilityService(otherDb,()=>current).submit({...f.input,baseVersion:0,slots:[second]});
  try {
    await expect.poll(async()=>{
      const rows=await db.$queryRaw<{waiting:boolean}[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT p.id FROM promises p%') AS waiting`;
      return rows[0].waiting;
    }).toBe(true);
    current=new Date("2026-11-15T00:00:00Z");
  } finally {unlock();await holding;}
  expect(await saving).toMatchObject({ok:false,code:"VOTING_CLOSED"});
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("closed");
  expect((await db.participant.findUniqueOrThrow({where:{id:f.member.id}})).availabilityVersion).toBe(0);
});
it("재제출은 이미 저장된 과거를 보존하고 새 과거 요청·잘못된 미래를 저장하지 않는다",async()=>{
  const f=await fixture();let current=at;const service=createAvailabilityService(db,()=>current);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{votingDeadlineAt:new Date("2026-11-16T00:00:00Z")}});
  await service.submit({...f.input,baseVersion:0,slots:[first,second]});
  current=new Date(first);
  expect(await service.submit({...f.input,baseVersion:1,slots:["2026-11-14T00:00:00.000Z"]})).toMatchObject({ok:true,snapshot:{version:2,slots:[first]}});
  expect(await service.submit({...f.input,baseVersion:2,slots:["2026-11-15T00:15:00.000Z"]})).toMatchObject({ok:false,code:"INVALID_INPUT"});
  expect(await service.read(f.input)).toMatchObject({ok:true,snapshot:{version:2,slots:[first]}});
});
it("다른 탭에서 로그인 대상이 바뀌면 이전 화면의 선택을 새 참여자에게 저장하지 않는다",async()=>{
  const f=await fixture(),service=createAvailabilityService(db,()=>at);
  expect(await service.submit({...f.input,expectedParticipantId:f.host.id,baseVersion:0,slots:[first]})).toMatchObject({ok:false,code:"UNAUTHORIZED"});
  expect((await db.participant.findUniqueOrThrow({where:{id:f.member.id}})).availabilityVersion).toBe(0);
  expect(await service.submit({...f.input,expectedParticipantId:f.member.id,baseVersion:0,slots:[first]})).toMatchObject({ok:true});
});
