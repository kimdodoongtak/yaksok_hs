import { beforeAll, afterAll, expect, it } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { verifyTestDatabase } from "../../../scripts/test-database.mjs";
import { newToken, tokenHash } from "../invitation/security";
import { createReschedulingService } from "./service";
const makeDb=()=>new PrismaClient({adapter:new PrismaPg({connectionString:process.env.TEST_DATABASE_URL})});
const db=makeDb(),otherDb=makeDb(),links:string[]=[];
const at=new Date("2026-11-15T00:00:00Z");
const settings={participantLimit:5,dateRangeStart:"2026-11-16",dateRangeEnd:"2026-11-18",dailyStart:"09:00",dailyEnd:"18:00",durationMinutes:60,votingDeadline:"2026-11-15T23:59"};
let verified=false;
beforeAll(async()=>{await verifyTestDatabase(process.env.TEST_DATABASE_URL);verified=true;});
afterAll(async()=>{
 if(verified){
 const where={participant:{promise:{promiseLinkId:{in:links}}}};
 await db.participantAvailableSlot.deleteMany({where});await db.participantSession.deleteMany({where});
 await db.participant.deleteMany({where:{promise:{promiseLinkId:{in:links}}}});await db.promiseRecord.deleteMany({where:{promiseLinkId:{in:links}}});await db.promiseLink.deleteMany({where:{id:{in:links}}});
 }
 await db.$disconnect();await otherDb.$disconnect();
});
async function fixture(){
 const link=await db.promiseLink.create({data:{inviteToken:newToken(),createdAt:at}});links.push(link.id);
 const promise=await db.promiseRecord.create({data:{promiseLinkId:link.id,status:"collecting",participantLimit:5,dateRangeStart:new Date(settings.dateRangeStart),dateRangeEnd:new Date(settings.dateRangeEnd),dailyStartMinute:540,dailyEndMinute:1080,durationMinutes:60,votingDeadlineAt:new Date("2026-11-15T14:59:00Z")}});
 const host=await db.participant.create({data:{promiseId:promise.id,nickname:"방장",normalizedNickname:"방장",passwordHash:"hidden",role:"host",availabilitySubmittedAt:at}});
 const friend=await db.participant.create({data:{promiseId:promise.id,nickname:"친구",normalizedNickname:"친구",passwordHash:"hidden",role:"member",availabilitySubmittedAt:at}});
 const left=await db.participant.create({data:{promiseId:promise.id,nickname:"탈퇴자",normalizedNickname:"탈퇴자",passwordHash:"hidden",role:"member",status:"cancelled",cancelledAt:at,availabilitySubmittedAt:at}});
 const token=newToken(),friendToken=newToken();
 for(const [id,value] of [[host.id,token],[friend.id,friendToken],[left.id,newToken()]])await db.participantSession.create({data:{participantId:id,sessionTokenHash:tokenHash(value),expiresAt:id===left.id?at:new Date("2026-11-22")}});
 const slot=(time:string,day="2026-11-16")=>new Date(`${day}T${time}:00+09:00`);
 for(const p of [host,friend,left])await db.participantAvailableSlot.createMany({data:["09:00","09:30","10:00"].map(time=>({participantId:p.id,slotStartAt:slot(time)}))});
 return {link,promise,host,friend,left,slot,input:{inviteToken:link.inviteToken,sessionToken:token,expectedParticipantId:host.id,mode:"reset" as const,confirmedImpact:"same" as const,confirmedClear:false,settings},friendToken};
}
it("모집 중 현재 방장만 설정을 바꾸며 소요 시간 변경은 응답과 모든 세션 만료를 보존한다",async()=>{
 const f=await fixture(),service=createReschedulingService(db,()=>at),other=await fixture();
 expect(await service.change({...f.input,sessionToken:undefined})).toMatchObject({ok:false,code:"UNAUTHORIZED"});
 expect(await service.change({...f.input,sessionToken:f.friendToken,expectedParticipantId:f.friend.id})).toMatchObject({ok:false,code:"FORBIDDEN"});
 expect(await service.change({...f.input,inviteToken:other.link.inviteToken})).toMatchObject({ok:false,code:"UNAUTHORIZED"});
 expect(await service.change({...f.input,expectedParticipantId:f.friend.id})).toMatchObject({ok:false,code:"UNAUTHORIZED"});
 const {createCandidatesService}=await import("../candidates/service");
 const candidates=createCandidatesService(db,()=>at);
 const initialCandidates=await candidates.read(f.input);expect(initialCandidates.ok&&initialCandidates.snapshot.weekCandidates.length).toBe(2);
 const people=await db.participant.findMany({where:{promiseId:f.promise.id},orderBy:{id:"asc"},include:{availableSlots:true,sessions:true}});
 expect(await service.change({...f.input,settings:{...settings,durationMinutes:120}})).toEqual({ok:true});
 expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toMatchObject({status:"collecting",durationMinutes:120});
 expect(await db.participant.findMany({where:{promiseId:f.promise.id},orderBy:{id:"asc"},include:{availableSlots:true,sessions:true}})).toEqual(people);
 const changedCandidates=await candidates.read(f.input);expect(changedCandidates.ok&&changedCandidates.snapshot.weekCandidates.length).toBe(0);
});
it("마감된 모집은 명시적 재조율만 허용하고 확정 재조율은 확정을 지운다",async()=>{
 const f=await fixture(),service=createReschedulingService(db,()=>at);
 await db.promiseRecord.update({where:{id:f.promise.id},data:{votingDeadlineAt:at}});
 expect(await service.change(f.input)).toMatchObject({ok:false,code:"STATE_CHANGED"});
 expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("closed");
 expect(await service.change({...f.input,mode:"reopen"})).toEqual({ok:true});
 await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"confirmed",confirmedStartAt:f.slot("09:00"),confirmedEndAt:f.slot("11:00")}});
 expect(await service.change(f.input)).toMatchObject({ok:false,code:"STATE_CHANGED"});
 expect(await service.change({...f.input,mode:"reopen",confirmedClear:true})).toEqual({ok:true});
 expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toMatchObject({status:"collecting",confirmedStartAt:null,confirmedEndAt:null});
});
it("이전 앱이 확정 시작만 해제해도 종료를 함께 해제하고 기존 응답은 보존한다",async()=>{
 const f=await fixture();
 await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"confirmed",confirmedStartAt:f.slot("09:00"),confirmedEndAt:f.slot("11:00")}});
 const slots=await db.participantAvailableSlot.count({where:{participant:{promiseId:f.promise.id}}});
 // 배포 전 앱의 재조율 요청은 새 종료 컬럼을 모른다.
 await db.$executeRaw`UPDATE promises SET status='collecting', confirmed_start_at=NULL WHERE id=${f.promise.id}::uuid`;
 expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toMatchObject({status:"collecting",confirmedStartAt:null,confirmedEndAt:null,durationMinutes:60});
 expect(await db.participantAvailableSlot.count({where:{participant:{promiseId:f.promise.id}}})).toBe(slots);
 // 이전 앱의 다음 확정은 NULL 종료를 허용하고, 새 앱의 명시적 종료 검증은 유지한다.
 await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"confirmed",confirmedStartAt:f.slot("09:00")}});
 expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).confirmedEndAt).toBeNull();
 await expect(db.promiseRecord.update({where:{id:f.promise.id},data:{confirmedEndAt:f.slot("09:30")}})).rejects.toThrow();
});
it("축소는 범위 밖 active 슬롯만 삭제하고 실제 삭제한 사람의 버전만 증가한다",async()=>{
 const f=await fixture();
 await db.participantAvailableSlot.deleteMany({where:{participantId:f.friend.id,slotStartAt:{lt:f.slot("10:00")}}});
 const departed=await db.participant.findUniqueOrThrow({where:{id:f.left.id},include:{availableSlots:true,sessions:true}});
 expect(await createReschedulingService(db,()=>at).change({...f.input,confirmedImpact:"shrink",settings:{...settings,dailyStart:"10:00"}})).toEqual({ok:true});
 expect(await db.participant.findUniqueOrThrow({where:{id:f.host.id},include:{availableSlots:true}})).toMatchObject({availabilityVersion:1,availabilitySubmittedAt:at,availableSlots:[{slotStartAt:f.slot("10:00")}]});
 expect((await db.participant.findUniqueOrThrow({where:{id:f.friend.id}})).availabilityVersion).toBe(0);
 expect(await db.participant.findUniqueOrThrow({where:{id:f.left.id},include:{availableSlots:true,sessions:true}})).toEqual(departed);
});
it("일부 축소와 확대가 섞여도 모든 active 응답은 재제출 대상이고 세션·탈퇴자는 보존한다",async()=>{
 const f=await fixture();await db.participant.update({where:{id:f.friend.id},data:{availabilitySubmittedAt:null}});
 const sessions=await db.participantSession.findMany({where:{participant:{promiseId:f.promise.id}},orderBy:{id:"asc"}});
 const departed=await db.participant.findUniqueOrThrow({where:{id:f.left.id},include:{availableSlots:true}});
 expect(await createReschedulingService(db,()=>at).change({...f.input,confirmedImpact:"expand",settings:{...settings,dailyStart:"10:00",dailyEnd:"19:00"}})).toEqual({ok:true});
 const active=await db.participant.findMany({where:{promiseId:f.promise.id,status:"active"},include:{availableSlots:true}});
 for(const member of active)expect(member).toMatchObject({availabilitySubmittedAt:null,availabilityVersion:1,availableSlots:[{slotStartAt:f.slot("10:00")}]});
 expect(await db.participantSession.findMany({where:{participant:{promiseId:f.promise.id}},orderBy:{id:"asc"}})).toEqual(sessions);
 expect(await db.participant.findUniqueOrThrow({where:{id:f.left.id},include:{availableSlots:true}})).toEqual(departed);
});
it("검증 실패는 보존되고 정원은 현재 active 인원 이상이며 만료·취소 접근을 거절한다",async()=>{
 const f=await fixture(),service=createReschedulingService(db,()=>at);
 await db.participant.create({data:{promiseId:f.promise.id,nickname:"세번째",normalizedNickname:"세번째",role:"member",passwordHash:"hidden"}});
 const before=await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}});
 for(const invalid of [{participantLimit:2},{participantLimit:31},{dateRangeStart:"2026-11-14"},{dailyEnd:"09:00"},{durationMinutes:700},{votingDeadline:"2026-11-15T09:00"}])expect(await service.change({...f.input,settings:{...settings,...invalid}})).toMatchObject({ok:false,code:"INVALID_INPUT"});
 expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toEqual(before);
 await db.participantSession.updateMany({where:{participantId:f.host.id},data:{expiresAt:at}});
 expect(await service.change(f.input)).toMatchObject({ok:false,code:"UNAUTHORIZED"});
 await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"cancelled",cancelledAt:at}});
 expect(await service.change(f.input)).toMatchObject({ok:false,code:"PROMISE_CANCELLED"});
});
it("확대 저장 실패는 슬롯·제출·확정까지 롤백하고 재시도할 수 있다",async()=>{
 const f=await fixture(),service=createReschedulingService(db,()=>at);
 await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"confirmed",confirmedStartAt:f.slot("09:00")}});
 const before=await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}}),people=await db.participant.findMany({where:{promiseId:f.promise.id},orderBy:{id:"asc"},include:{availableSlots:true}});
 const input={...f.input,mode:"reopen" as const,confirmedClear:true,confirmedImpact:"expand" as const,settings:{...settings,dailyStart:"10:00",dailyEnd:"19:00"}};
 await db.$executeRawUnsafe(`CREATE FUNCTION test_rescheduling_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.daily_end_minute = 1140 THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`);
 try{
 await db.$executeRawUnsafe(`CREATE TRIGGER test_rescheduling_failure BEFORE UPDATE ON promises FOR EACH ROW EXECUTE FUNCTION test_rescheduling_failure()`);
 expect(await service.change(input)).toEqual({ok:false,code:"UNAVAILABLE"});
 expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toEqual(before);
 expect(await db.participant.findMany({where:{promiseId:f.promise.id},orderBy:{id:"asc"},include:{availableSlots:true}})).toEqual(people);
 }finally{await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_rescheduling_failure ON promises`);await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS test_rescheduling_failure()`);}
 expect(await service.change(input)).toEqual({ok:true});
});
it("동시 재조율은 한 요청만 성공하고 마지막 상태로 중복 실행을 막는다",async()=>{
 const f=await fixture();await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"closed"}});
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 const first=gate.then(()=>createReschedulingService(db,()=>at).change({...f.input,mode:"reopen",settings:{...settings,durationMinutes:90}}));
 const second=gate.then(()=>createReschedulingService(otherDb,()=>at).change({...f.input,mode:"reopen",settings:{...settings,durationMinutes:120}}));
 release();const results=await Promise.all([first,second]);
 expect(results.filter(result=>result.ok)).toHaveLength(1);expect(results.filter(result=>!result.ok)).toEqual([{ok:false,code:"STATE_CHANGED"}]);
 expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toMatchObject({status:"collecting",durationMinutes:results[0].ok?90:120});
});
it("동시 설정 변경은 잠금 순서대로 최신 범위와 비교하며 기존 제출과 경쟁해도 유효한 상태만 남는다",async()=>{
 const {createAvailabilityService}=await import("../availability/service");
 const f=await fixture();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 const expand=gate.then(()=>createReschedulingService(db,()=>at).change({...f.input,confirmedImpact:"expand",settings:{...settings,dailyEnd:"19:00"}}));
 const shrink=gate.then(()=>createReschedulingService(otherDb,()=>at).change({...f.input,confirmedImpact:"shrink",settings:{...settings,dailyStart:"10:00"}}));
 release();expect(await Promise.all([expand,shrink])).toEqual([{ok:true},{ok:true}]);
 const promise=await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}}),host=await db.participant.findUniqueOrThrow({where:{id:f.host.id},include:{availableSlots:true}});
 expect([1080,1140]).toContain(promise.dailyEndMinute);expect(host.availabilityVersion).toBe(2);expect(host.availabilitySubmittedAt).toBeNull();
 expect(host.availableSlots.map(s=>s.slotStartAt)).toEqual([f.slot("10:00")]);
 const g=await fixture();let go!:()=>void;const barrier=new Promise<void>(r=>{go=r;});
 const changing=barrier.then(()=>createReschedulingService(db,()=>at).change({...g.input,confirmedImpact:"expand",settings:{...settings,dailyEnd:"19:00"}}));
 const submitting=barrier.then(()=>createAvailabilityService(otherDb,()=>at).submit({...g.input,baseVersion:0,slots:[g.slot("10:00").toISOString()]}));
 go();const [changed,submitted]=await Promise.all([changing,submitting]);expect(changed).toEqual({ok:true});
 expect(submitted.ok||submitted.code==="AVAILABILITY_VERSION_CONFLICT").toBe(true);
 const member=await db.participant.findUniqueOrThrow({where:{id:g.host.id}});
 expect(member.availabilityVersion).toBe(submitted.ok?2:1);expect(member.availabilitySubmittedAt).toBeNull();
});
it("잠금을 기다린 변경 요청은 갱신된 방장 권한으로 판단한다",async()=>{
 const f=await fixture();let release!:()=>void,locked!:()=>void;const gate=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{locked=r;});
 const holding=db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM promises WHERE id=${f.promise.id}::uuid FOR UPDATE`;locked();await gate;
  await tx.participant.update({where:{id:f.host.id},data:{role:"member"}});
  await tx.participant.update({where:{id:f.friend.id},data:{role:"host"}});
 },{timeout:10000});
 await ready;const changing=createReschedulingService(otherDb,()=>at).change(f.input);
 try{await expect.poll(async()=>{
 const rows=await db.$queryRaw<{waiting:boolean}[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT p.id FROM promises p%') AS waiting`;return rows[0].waiting;
 }).toBe(true);}finally{release();await holding;}
 expect(await changing).toMatchObject({ok:false,code:"FORBIDDEN"});
});
it("안내한 영향과 잠금 후 최신 영향이 다르면 응답을 변경하지 않고 재확인을 요구한다",async()=>{
 const f=await fixture(),service=createReschedulingService(db,()=>at);
 const shrink={...f.input,settings:{...settings,dailyEnd:"17:30"},confirmedImpact:"shrink" as const};
 expect(await service.change(shrink)).toEqual({ok:true});
 const people=await db.participant.findMany({where:{promiseId:f.promise.id},orderBy:{id:"asc"},include:{availableSlots:true}});
 const oldTab={...f.input,settings:{...settings,durationMinutes:90},confirmedImpact:"same" as const};
 expect(await service.change(oldTab)).toMatchObject({ok:false,code:"IMPACT_CHANGED",impact:"expand"});
 expect(await db.participant.findMany({where:{promiseId:f.promise.id},orderBy:{id:"asc"},include:{availableSlots:true}})).toEqual(people);
 expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toMatchObject({dailyEndMinute:1050,durationMinutes:60});
 expect(await service.change({...oldTab,confirmedImpact:"expand"})).toEqual({ok:true});
 expect(await db.participant.count({where:{promiseId:f.promise.id,status:"active",availabilitySubmittedAt:{not:null}}})).toBe(0);
});
it("마감 화면 확인 후 약속이 확정되면 확정 해제도 다시 확인해야 한다",async()=>{
 const f=await fixture(),service=createReschedulingService(db,()=>at);
 await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"confirmed",confirmedStartAt:f.slot("09:00")}});
 const input={...f.input,mode:"reopen" as const,confirmedClear:false};
 expect(await service.change(input)).toMatchObject({ok:false,code:"IMPACT_CHANGED",impact:"same",clearsConfirmation:true});
 expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).confirmedStartAt).toEqual(f.slot("09:00"));
 expect(await service.change({...input,confirmedClear:true})).toEqual({ok:true});
});
