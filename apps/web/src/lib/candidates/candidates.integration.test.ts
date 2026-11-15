import { beforeAll, afterAll, expect, it } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { verifyTestDatabase } from "../../../scripts/test-database.mjs";
import { newToken, tokenHash } from "../invitation/security";
import { createCandidatesService } from "./service";
import { createAvailabilityService } from "../availability/service";
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
  const host=await db.participant.create({data:{promiseId:promise.id,nickname:"방장",normalizedNickname:"방장",passwordHash:"unused",role:"host",createdAt:at}});
  const member=await db.participant.create({data:{promiseId:promise.id,nickname:"참여자",normalizedNickname:"참여자",passwordHash:"unused",role:"member",createdAt:new Date(at.getTime()+1)}});
  const hostToken=newToken();
  await db.participantSession.create({data:{participantId:host.id,sessionTokenHash:tokenHash(hostToken),expiresAt:new Date("2026-11-22T00:00:00Z")}});
  const sessionToken=newToken();
  await db.participantSession.create({data:{participantId:member.id,sessionTokenHash:tokenHash(sessionToken),expiresAt:new Date("2026-11-22T00:00:00Z")}});
  return {link,promise,host,member,hostInput:{inviteToken:link.inviteToken,sessionToken:hostToken},input:{inviteToken:link.inviteToken,sessionToken}};
}
const first="2026-11-15T00:00:00.000Z", second="2026-11-15T00:30:00.000Z";

it("방장·참여자 시간 조회는 진행 중인 쓰기 잠금을 기다리지 않고 커밋된 상태를 읽는다",async()=>{
  const f=await fixture();
  let release!:()=>void, ready!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const locked=new Promise<void>(resolve=>{ready=resolve;});
  const writing=db.$transaction(async tx=>{
    await tx.promiseRecord.update({where:{id:f.promise.id},data:{status:"cancelled",cancelledAt:at}});
    ready();await gate;
  },{timeout:10000});
  await locked;
  const availability=createAvailabilityService(otherDb,()=>at), overview=createCandidatesService(otherDb,()=>at);
  const reads=Promise.all([availability.read(f.hostInput),availability.read(f.input),overview.read(f.hostInput),overview.read(f.input)]);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const result=await Promise.race([reads,new Promise<"blocked"> (resolve=>{timer=setTimeout(()=>resolve("blocked"),2000);})]);
    expect(result,"조회가 다른 요청의 쓰기 잠금을 기다리면 안 된다").not.toBe("blocked");
    if(result==="blocked")throw new Error("조회 잠금 대기");
    for(const response of result)expect(response).toMatchObject({ok:true,snapshot:{status:"collecting"}});
  } finally {
    clearTimeout(timer);release();await writing;await reads;
  }
  for(const input of [f.hostInput,f.input]){
    expect(await availability.read(input)).toMatchObject({ok:false,code:"PROMISE_CANCELLED"});
    expect(await overview.read(input)).toMatchObject({ok:false,code:"PROMISE_CANCELLED"});
  }
});

it.each(["availability","overview"] as const)("%s 조회 도중 제출이 커밋되어도 설정과 슬롯을 같은 시점으로 반환한다",async kind=>{
  const f=await fixture();
  await db.participant.updateMany({where:{promiseId:f.promise.id},data:{availabilitySubmittedAt:at}});
  await db.participantAvailableSlot.createMany({data:[f.host,f.member].map(member=>({participantId:member.id,slotStartAt:new Date(first)}))});
  const commitDuringRead=async()=>{
    await db.$transaction(async tx=>{
      await tx.promiseRecord.update({where:{id:f.promise.id},data:{durationMinutes:60}});
      await tx.participantAvailableSlot.deleteMany({where:{participant:{promiseId:f.promise.id}}});
      await tx.participantAvailableSlot.createMany({data:[f.host,f.member].map(member=>({participantId:member.id,slotStartAt:new Date(second)}))});
      await tx.participant.updateMany({where:{promiseId:f.promise.id},data:{availabilityVersion:1}});
    });
    return at;
  };
  const during=kind==="availability"
    ? await createAvailabilityService(otherDb,commitDuringRead).read(f.input)
    : await createCandidatesService(otherDb,commitDuringRead).read(f.input);
  expect(during).toMatchObject({ok:true,snapshot:{settings:{durationMinutes:120},
    ...(kind==="availability"?{version:0,slots:[first]}:{heatmap:{[first]:2}})}});
  const after=kind==="availability"
    ? await createAvailabilityService(otherDb,()=>at).read(f.input)
    : await createCandidatesService(otherDb,()=>at).read(f.input);
  expect(after).toMatchObject({ok:true,snapshot:{settings:{durationMinutes:60},
    ...(kind==="availability"?{version:1,slots:[second]}:{heatmap:{[second]:2}})}});
});

it("인증한 같은 약속의 active 명단과 제출 슬롯만 공개하며 타인 제출 상태는 숨긴다",async()=>{
  const f=await fixture(), other=await fixture();
  await db.participant.update({where:{id:f.host.id},data:{availabilitySubmittedAt:at}});
  await db.participantAvailableSlot.createMany({data:[{participantId:f.host.id,slotStartAt:new Date(first)},{participantId:f.member.id,slotStartAt:new Date(first)}]});
  const inactive=await db.participant.create({data:{promiseId:f.promise.id,nickname:"나간사람",normalizedNickname:"나간사람",passwordHash:"hidden",role:"member",status:"cancelled",cancelledAt:at}});
  const service=createCandidatesService(db,()=>at);
  const result=await service.read({...f.input,week:"2026-11-15",participantId:f.host.id});
  expect(result).toMatchObject({ok:true,snapshot:{participantId:f.member.id,status:"collecting",selected:{participantId:f.host.id,slots:[first]},heatmap:{[first]:1},slotParticipantIndexes:{[first]:[0]},candidates:[],hasMore:false}});
  if(!result.ok)throw new Error("조회 실패");
  expect(await service.read({...f.input,week:"2026-11-22"})).toMatchObject({ok:true,snapshot:{slotParticipantIndexes:{}}});
  expect(result.snapshot.participants).toEqual([{id:f.host.id,nickname:"방장",role:"host"},{id:f.member.id,nickname:"참여자",role:"member"}]);
  expect(JSON.stringify(result)).not.toMatch(/submitted|passwordHash|sessionToken|availabilityVersion/);
  expect(await service.read({...f.input,participantId:f.member.id})).toMatchObject({ok:true,snapshot:{selected:{slots:[]}}});
  expect(await service.read({...f.input,participantId:inactive.id})).toMatchObject({ok:false,code:"NOT_FOUND"});
  expect(await service.read({...f.input,participantId:other.host.id})).toMatchObject({ok:false,code:"NOT_FOUND"});
  expect(await service.read({inviteToken:f.link.inviteToken})).toMatchObject({ok:false,code:"UNAUTHORIZED"});
  expect(await service.read({...f.input,inviteToken:other.link.inviteToken})).toMatchObject({ok:false,code:"UNAUTHORIZED"});
});
it("마감 GET은 DB를 쓰지 않고 전체 범위 상위 5개·더 보기·시간 경과를 일관된 목록으로 반환한다",async()=>{
  const f=await fixture();let current=at;const service=createCandidatesService(db,()=>current);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{durationMinutes:30}});
  current=new Date("2026-11-15T00:00:00Z");
  expect(await service.read(f.input)).toMatchObject({ok:true,snapshot:{status:"closed",candidates:[]}});
  const times=Array.from({length:10},(_,i)=>new Date(new Date(second).getTime()+i*1800000));
  for(const member of [f.host,f.member]){
    await db.participant.update({where:{id:member.id},data:{availabilitySubmittedAt:at}});
    await db.participantAvailableSlot.createMany({data:times.map(slotStartAt=>({participantId:member.id,slotStartAt}))});
  }
  current=at;expect(await service.read(f.input)).toMatchObject({ok:true,snapshot:{status:"collecting",candidates:[]}});
  current=new Date("2026-11-15T00:00:00Z");
  const firstPage=await service.read({...f.input,week:"2026-11-22"});
  expect(firstPage).toMatchObject({ok:true,snapshot:{status:"closed",hasMore:true,heatmap:{}}});
  if(!firstPage.ok)throw new Error("실패");expect(firstPage.snapshot.candidates).toHaveLength(5);
  expect(firstPage.snapshot.candidates[0]).toMatchObject({startAt:second,count:2});
  const more=await service.read({...f.input,limit:10});if(!more.ok)throw new Error("실패");
  expect(more.snapshot.candidates).toHaveLength(10);expect(more.snapshot.candidates.slice(0,5)).toEqual(firstPage.snapshot.candidates);expect(more.snapshot.hasMore).toBe(false);
  current=new Date("2026-11-15T01:00:00Z");
  const later=await service.read({...f.input,limit:10});if(!later.ok)throw new Error("실패");expect(later.snapshot.candidates).toHaveLength(8);
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("collecting");
  for(const input of [{limit:0},{limit:5000},{week:"2026-02-30"}])expect(await service.read({...f.input,...input})).toMatchObject({ok:false,code:"INVALID_INPUT"});
});
it("현재 방장만 조기 마감하며 재시도는 멱등이고 뒤늦은 제출을 막는다",async()=>{
  const f=await fixture(),service=createCandidatesService(db,()=>at);
  expect(await service.close(f.input)).toMatchObject({ok:false,code:"FORBIDDEN"});
  expect(await service.close({...f.hostInput,expectedParticipantId:f.member.id})).toMatchObject({ok:false,code:"UNAUTHORIZED"});
  expect(await service.close(f.hostInput)).toEqual({ok:true});
  expect(await service.close(f.hostInput)).toEqual({ok:true});
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("closed");
  expect(await createAvailabilityService(otherDb,()=>at).submit({...f.input,baseVersion:0,slots:[first]})).toMatchObject({ok:false,code:"VOTING_CLOSED"});
  expect(await db.participantAvailableSlot.count({where:{participant:{promiseId:f.promise.id}}})).toBe(0);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"cancelled",cancelledAt:at}});
  expect(await service.close({inviteToken:f.link.inviteToken})).toMatchObject({ok:false,code:"PROMISE_CANCELLED"});
});
it("조기 마감과 제출의 동시 요청은 같은 약속 잠금으로 직렬화된다",async()=>{
  const f=await fixture();
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  const closing=gate.then(()=>createCandidatesService(db,()=>at).close(f.hostInput));
  const submitting=gate.then(()=>createAvailabilityService(otherDb,()=>at).submit({...f.input,baseVersion:0,slots:[first]}));
  release();const [closed,saved]=await Promise.all([closing,submitting]);
  expect(closed).toEqual({ok:true});
  expect(saved.ok || saved.code==="VOTING_CLOSED").toBe(true);
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("closed");
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(saved.ok?1:0);
  expect(await createAvailabilityService(otherDb,()=>at).submit({...f.input,baseVersion:saved.ok?1:0,slots:[second]})).toMatchObject({ok:false,code:"VOTING_CLOSED"});
});
it("마감 요청이 잠금을 기다리는 동안 방장 권한이 바뀌면 최신 권한으로 거절한다",async()=>{
  const f=await fixture();let unlock!:()=>void,locked!:()=>void;
  const gate=new Promise<void>(r=>{unlock=r;}),ready=new Promise<void>(r=>{locked=r;});
  const holding=db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM promises WHERE id=${f.promise.id}::uuid FOR UPDATE`;
    locked();await gate;
    await tx.participant.update({where:{id:f.host.id},data:{role:"member"}});
    await tx.participant.update({where:{id:f.member.id},data:{role:"host"}});
  },{timeout:10000});
  await ready;const closing=createCandidatesService(otherDb,()=>at).close(f.hostInput);
  try {
    await expect.poll(async()=>{
      const rows=await db.$queryRaw<{waiting:boolean}[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT p.id FROM promises p%') AS waiting`;
      return rows[0].waiting;
    }).toBe(true);
  } finally {unlock();await holding;}
  expect(await closing).toMatchObject({ok:false,code:"FORBIDDEN"});
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("collecting");
});
it("최대 30명·90일·하루 48슬롯을 실제 DB에서 집계하고 응답 크기를 측정한다",async()=>{
  const f=await fixture();
  const start=new Date("2026-11-15T00:00:00+09:00"),end=new Date(start.getTime()+89*86400000);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"closed",participantLimit:30,dateRangeEnd:new Date(end.getTime()+9*3600000),dailyStartMinute:0,dailyEndMinute:1440,durationMinutes:30}});
  const ids=[f.host.id,f.member.id];
  for(let i=2;i<30;i++)ids.push((await db.participant.create({data:{promiseId:f.promise.id,nickname:`참여${i}`,normalizedNickname:`참여${i}`,passwordHash:"unused",role:"member"}})).id);
  await db.participant.updateMany({where:{promiseId:f.promise.id},data:{availabilitySubmittedAt:at}});
  for(const participantId of ids)await db.participantAvailableSlot.createMany({data:Array.from({length:90*48},(_,i)=>({participantId,slotStartAt:new Date(start.getTime()+i*1800000)}))});
  const began=performance.now(),result=await createCandidatesService(db,()=>at).read({...f.input,week:"2026-11-15"});
  const elapsed=performance.now()-began;
  expect(result).toMatchObject({ok:true,snapshot:{hasMore:true,participants:expect.arrayContaining([{id:f.host.id,nickname:"방장",role:"host"}])}});
  if(!result.ok)throw new Error("최대 범위 조회 실패");
  expect(result.snapshot.candidates).toHaveLength(5);expect(result.snapshot.candidates[0].count).toBe(30);expect(Object.keys(result.snapshot.heatmap)).toHaveLength(7*48);
  console.log(`005 최대 범위: 슬롯 129600개, 조회 ${elapsed.toFixed(1)}ms, 기본 응답 ${Buffer.byteLength(JSON.stringify(result))}bytes`);
},30000);
it("주간 임시 후보는 슬롯 인원이 아닌 연속 참석자 교집합으로 계산하고 공식 목록과 구분한다",async()=>{
  const f=await fixture();
  await db.promiseRecord.update({where:{id:f.promise.id},data:{durationMinutes:60}});
  const third=await db.participant.create({data:{promiseId:f.promise.id,nickname:"세번째",normalizedNickname:"세번째",passwordHash:"unused",role:"member",availabilitySubmittedAt:at}});
  await db.participant.updateMany({where:{promiseId:f.promise.id},data:{availabilitySubmittedAt:at}});
  const atTime=(time:string)=>new Date(`2026-11-15T${time}:00+09:00`);
  for(const [id,times] of [[f.host.id,["09:00","11:00","11:30"]],[f.member.id,["09:00","09:30","11:00","11:30"]],[third.id,["09:30"]]] as const){
    await db.participantAvailableSlot.createMany({data:times.map(time=>({participantId:id,slotStartAt:atTime(time)}))});
  }
  const result=await createCandidatesService(db,()=>at).read({...f.input,week:"2026-11-15"});
  expect(result).toMatchObject({ok:true,snapshot:{status:"collecting",candidates:[],weekCandidates:[{startAt:atTime("11:00").toISOString(),endAt:atTime("12:00").toISOString(),count:2}]}});
  expect(await createCandidatesService(db,()=>at).read({...f.input,week:"2026-11-22"})).toMatchObject({ok:true,snapshot:{weekCandidates:[]}});
});
