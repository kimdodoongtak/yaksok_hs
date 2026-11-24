import { returningCalendarUser } from "./returning-calendar-user";
import { selectDeadline } from "./settings-calendar";
import { test, expect, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { newToken, tokenHash, hashPin } from "../src/lib/invitation/security";
import { sessionCookie } from "../src/lib/invitation/cookie";
import { verifyTestDatabase } from "../scripts/test-database.mjs";
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.TEST_DATABASE_URL})});
const links:string[]=[];let verified=false;
test.beforeAll(async()=>{await verifyTestDatabase(process.env.TEST_DATABASE_URL);verified=true;});
test.afterAll(async()=>{
  if(verified){
    const where={participant:{promise:{promiseLinkId:{in:links}}}};
    await db.participantAvailableSlot.deleteMany({where});
    await db.participantSession.deleteMany({where});
    await db.participant.deleteMany({where:{promise:{promiseLinkId:{in:links}}}});
    await db.promiseRecord.deleteMany({where:{promiseLinkId:{in:links}}});
    await db.promiseLink.deleteMany({where:{id:{in:links}}});
  }
  await db.$disconnect();
});
async function fixture(context:BrowserContext){
  await returningCalendarUser(context);
  const link=await db.promiseLink.create({data:{inviteToken:newToken()}});links.push(link.id);
  const day=(offset:number)=>new Date(Date.now()+9*3600000+offset*86400000).toISOString().slice(0,10);
  const start=day(1),end=day(15);
  const promise=await db.promiseRecord.create({data:{promiseLinkId:link.id,status:"closed",participantLimit:5,dateRangeStart:new Date(start),dateRangeEnd:new Date(end),dailyStartMinute:540,dailyEndMinute:1080,durationMinutes:60,votingDeadlineAt:new Date(Date.now()-1000)}});
  const member=await db.participant.create({data:{promiseId:promise.id,nickname:"테스트친구",normalizedNickname:"테스트친구",passwordHash:await hashPin("1234"),role:"host",availabilitySubmittedAt:new Date()}});
  const sessionToken=newToken(), expiresAt=new Date(Date.now()+7*86400000);
  await db.participantSession.create({data:{participantId:member.id,sessionTokenHash:tokenHash(sessionToken),expiresAt}});
  const cookie=sessionCookie(link.inviteToken,expiresAt);
  await context.addCookies([{name:cookie.name,value:sessionToken,domain:"127.0.0.1",path:cookie.path,httpOnly:true,sameSite:"Lax",expires:expiresAt.getTime()/1000}]);
  const slot=(time:string,dayValue=start)=>new Date(`${dayValue}T${time}:00+09:00`).toISOString();
  const friend=await db.participant.create({data:{promiseId:promise.id,nickname:"확정친구",normalizedNickname:"확정친구",passwordHash:await hashPin("1234"),role:"member",availabilitySubmittedAt:new Date()}});
  for(const person of [member,friend])await db.participantAvailableSlot.createMany({data:["09:00","09:30","10:00"].map(time=>({participantId:person.id,slotStartAt:new Date(slot(time))}))});
  return {link,promise,member,friend,start,end,slot,path:`/p/${link.inviteToken}/availability`};
}
test("확정 재조율은 영향 안내 후 저장하고 다른 열린 결과 화면을 동기화한다",async({page,context})=>{
 const f=await fixture(context);await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"confirmed",confirmedStartAt:new Date(f.slot("09:00"))}});
 await page.setViewportSize({width:393,height:852});await page.goto(`/p/${f.link.inviteToken}/result`);
 const other=await context.newPage();await other.goto(`/p/${f.link.inviteToken}/result`);
 await page.getByRole("link",{name:"재조율하기",exact:true}).click();
 await expect(page.getByRole("heading",{name:"재조율",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"하루 종료 30분 늘리기",exact:true}).click();
 await page.getByRole("button",{name:"다음",exact:true}).click();
 await selectDeadline(page, `${f.start}T23:59`);
 await page.getByRole("button",{name:"변경 내용 확인",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"변경 내용을 적용할까요?",exact:true});
 await expect(dialog).toContainText("모든 참여자가 가능 시간을 다시 제출해야 해요.");await expect(dialog).toContainText("기존 확정 시간은 해제돼요.");
 await dialog.getByRole("button",{name:"재조율 시작",exact:true}).click();
 await expect(page).toHaveURL(f.path);
 expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toMatchObject({status:"collecting",confirmedStartAt:null,dailyEndMinute:1110});
 expect((await db.participant.findUniqueOrThrow({where:{id:f.friend.id}})).availabilitySubmittedAt).toBeNull();
 await other.bringToFront();await other.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(other).toHaveURL(f.path);await other.close();
});
test("모집 중 확대 저장은 열린 시간표의 미제출 편집을 버리고 재제출을 안내한다",async({page,context})=>{
 const f=await fixture(context);await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"collecting",votingDeadlineAt:new Date(`${f.start}T08:00:00+09:00`)}});
 const other=await context.newPage();await other.goto(f.path);await other.getByRole("button",{name:"30분",exact:true}).click();
 const cell=other.getByRole("button",{name:`${f.start} 11:00`,exact:true});await cell.click();await expect(cell).toHaveAttribute("aria-pressed","true");
 await page.goto(`/p/${f.link.inviteToken}/settings/edit`);await page.getByRole("button",{name:"하루 종료 30분 늘리기",exact:true}).click();await page.getByRole("button",{name:"다음",exact:true}).click();await page.getByRole("button",{name:"변경 내용 확인",exact:true}).click();
 await page.getByRole("button",{name:"변경 저장",exact:true}).click();await expect(page).toHaveURL(f.path);
 await other.bringToFront();await other.evaluate(()=>window.dispatchEvent(new Event("focus")));
 await expect(other.getByText("약속 설정이 변경됐어요. 가능 시간을 확인하고 다시 제출해 주세요.",{exact:true})).toBeVisible();
 await expect(cell).toHaveAttribute("aria-pressed","false");
 for(const time of ["09:00","09:30","10:00"])await expect(other.getByRole("button",{name:`${f.start} ${time}`,exact:true})).toHaveAttribute("aria-pressed","true");
 await other.close();
});
test("변경 취소·연결 실패 재시도·중복 클릭 방지와 모바일 폼을 지원한다",async({page,context})=>{
 const f=await fixture(context),path=`/p/${f.link.inviteToken}/settings/edit`;
 await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"collecting",votingDeadlineAt:new Date(`${f.start}T08:00:00+09:00`)}});
 await page.goto(path);
 for(const width of [320,393,1280]){
  await page.setViewportSize({width,height:width===1280?800:852});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole("button",{name:"다음",exact:true})).toBeInViewport();await page.screenshot({path:`test-results/rescheduling-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:393,height:852});
 await page.getByRole("button",{name:"소요 시간 30분 늘리기",exact:true}).click();await page.getByRole("button",{name:"다음",exact:true}).click();await page.getByRole("button",{name:"변경 내용 확인",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"변경 내용을 적용할까요?",exact:true});await expect(dialog).toContainText("기존 선택과 제출 상태는 유지돼요.");
 await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).durationMinutes).toBe(60);
 await page.getByRole("button",{name:"변경 내용 확인",exact:true}).click();await page.screenshot({path:"test-results/rescheduling-confirm-393.png",fullPage:true});
 await page.route(`**${path}`,route=>route.request().method()==="POST"?route.abort():route.continue());
 await dialog.getByRole("button",{name:"변경 저장",exact:true}).click();await expect(dialog.getByRole("alert")).toContainText("다시 시도");
 await page.unroute(`**${path}`);
 let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{started=r;});
 await page.route(`**${path}`,async route=>{if(route.request().method()!=="POST"){await route.continue();return;}started();await gate;await route.continue();},{times:1});
 await dialog.getByRole("button",{name:"변경 저장",exact:true}).click();await ready;
 try{await expect(dialog.getByRole("button",{name:"저장 중…",exact:true})).toBeDisabled();await expect(dialog.getByRole("button",{name:"취소",exact:true})).toBeDisabled();await page.keyboard.press("Escape");await expect(dialog).toBeVisible();}finally{release();}
 await expect(page).toHaveURL(f.path);expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).durationMinutes).toBe(90);
 expect((await db.participant.findUniqueOrThrow({where:{id:f.member.id}})).availabilitySubmittedAt).not.toBeNull();
});
test("편집 화면은 방장만 접근하고 마감·역할 변경 시 저장을 거절한다",async({page,context,request})=>{
 const f=await fixture(context),path=`/p/${f.link.inviteToken}/settings/edit`;
 expect(new URL((await request.get(path)).url()).pathname).toBe(`/p/${f.link.inviteToken}`);
 await db.participant.update({where:{id:f.member.id},data:{role:"member"}});await page.goto(path);await expect(page).toHaveURL(`/p/${f.link.inviteToken}/candidates`);await expect(page.getByRole("link",{name:"재조율하기",exact:true})).toHaveCount(0);
 await db.participant.update({where:{id:f.member.id},data:{role:"host"}});await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"collecting",votingDeadlineAt:new Date(`${f.start}T08:00:00+09:00`)}});
 await page.goto(path);await page.getByRole("button",{name:"다음",exact:true}).click();await page.getByRole("button",{name:"변경 내용 확인",exact:true}).click();
 await db.promiseRecord.update({where:{id:f.promise.id},data:{votingDeadlineAt:new Date(Date.now()-1000)}});
 await page.getByRole("button",{name:"변경 저장",exact:true}).click();await expect(page.getByRole("dialog").getByRole("alert")).toContainText("약속 상태가 변경됐어요.");expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("closed");
});
for(const changedAfterDialog of [false,true])test(`오래된 설정의 영향이 달라지면 저장 전 재확인한다 (확인 창 이후 변경: ${changedAfterDialog})`,async({page,context})=>{
 const f=await fixture(context),edit=`/p/${f.link.inviteToken}/settings/edit`;
 await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"collecting",votingDeadlineAt:new Date(`${f.start}T08:00:00+09:00`)}});
 await page.goto(edit);const other=await context.newPage();await other.goto(edit);
 const dialog=page.getByRole("dialog",{name:"변경 내용을 적용할까요?",exact:true});
 async function stageOld(){await page.bringToFront();await page.getByRole("button",{name:"소요 시간 30분 늘리기",exact:true}).click();await page.getByRole("button",{name:"다음",exact:true}).click();await page.getByRole("button",{name:"변경 내용 확인",exact:true}).click();await expect(dialog).toContainText("기존 선택과 제출 상태는 유지돼요.");}
 if(changedAfterDialog)await stageOld();
 await other.getByRole("button",{name:"하루 종료 30분 줄이기",exact:true}).click();await other.getByRole("button",{name:"다음",exact:true}).click();await other.getByRole("button",{name:"변경 내용 확인",exact:true}).click();await other.getByRole("button",{name:"변경 저장",exact:true}).click();await expect(other).toHaveURL(f.path);
 if(!changedAfterDialog)await stageOld();
 await page.bringToFront();await dialog.getByRole("button",{name:"변경 저장",exact:true}).click();
 await expect(dialog).toContainText("모든 참여자가 가능 시간을 다시 제출해야 해요.");
 await expect(dialog).toContainText("다른 화면에서 설정이 변경됐어요. 변경 영향을 다시 확인해 주세요.");
 expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toMatchObject({dailyEndMinute:1050,durationMinutes:60});
 expect(await db.participant.count({where:{promiseId:f.promise.id,availabilitySubmittedAt:{not:null}}})).toBe(2);
 await dialog.getByRole("button",{name:"변경 저장",exact:true}).click();await expect(page).toHaveURL(f.path);
 expect(await db.participant.count({where:{promiseId:f.promise.id,availabilitySubmittedAt:{not:null}}})).toBe(0);await other.close();
});
test("확인 창 이후 약속이 확정되면 확정 해제를 다시 안내한다",async({page,context})=>{
 const f=await fixture(context);await page.goto(`/p/${f.link.inviteToken}/settings/edit`);
 await page.getByRole("button",{name:"다음",exact:true}).click();await selectDeadline(page, `${f.start}T23:59`);await page.getByRole("button",{name:"변경 내용 확인",exact:true}).click();
 const dialog=page.getByRole("dialog");await expect(dialog).not.toContainText("기존 확정 시간은 해제돼요.");
 await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"confirmed",confirmedStartAt:new Date(f.slot("09:00"))}});
 await dialog.getByRole("button",{name:"재조율 시작",exact:true}).click();await expect(dialog).toContainText("기존 확정 시간은 해제돼요.");
 expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("confirmed");
 await dialog.getByRole("button",{name:"재조율 시작",exact:true}).click();await expect(page).toHaveURL(f.path);
 expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).confirmedStartAt).toBeNull();
});
