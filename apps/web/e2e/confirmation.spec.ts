import { returningCalendarUser } from "./returning-calendar-user";
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
test("방장은 두 번째 후보를 확인 후 확정하고 결과 링크를 공유한다",async({page,context})=>{
  const f=await fixture(context);await page.setViewportSize({width:393,height:852});await page.goto(f.path);
  await page.getByRole("button",{name:"이 시간 선택",exact:true}).nth(1).click();
  const dialog=page.getByRole("dialog",{name:"이 시간으로 확정할까요?",exact:true});
  await expect(dialog).toContainText("09:30");await expect(dialog).toContainText("10:30");
  await dialog.getByRole("button",{name:"취소",exact:true}).click();
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("closed");
  await page.getByRole("button",{name:"이 시간 선택",exact:true}).nth(1).click();
  await dialog.getByRole("button",{name:"확정하기",exact:true}).click();
  await expect(page).toHaveURL(`/p/${f.link.inviteToken}/result`);
  await expect(page.getByRole("heading",{name:"약속 확정",exact:true})).toBeVisible();
  await expect(page.getByLabel("확정 시간",{exact:true})).toHaveText("09:30 ~ 10:30");
  await expect(page.getByRole("list",{name:"참석자",exact:true})).toHaveText("테스트친구확정친구");
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).confirmedStartAt?.toISOString()).toBe(f.slot("09:30"));
  await page.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw new Error("denied");}}}));
  await page.getByRole("button",{name:"결과 링크 복사",exact:true}).click();
  await expect(page.getByLabel("결과 링크",{exact:true})).toHaveValue(`http://127.0.0.1:3100/p/${f.link.inviteToken}/result`);
  for(const width of [320,393,1280]){await page.setViewportSize({width,height:852});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/result-${width}.png`,fullPage:true,animations:"disabled"});}
});
test("결과는 인증 후 공개하며 새 기기 재로그인·복사 성공·참여자 화면을 지원한다",async({page,context,browser,request})=>{
  const f=await fixture(context);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"confirmed",confirmedStartAt:new Date(f.slot("09:00"))}});
  const resultPath=`/p/${f.link.inviteToken}/result`,statePath=`${resultPath}/state`;
  const denied=await request.get(statePath);expect(denied.status()).toBe(401);expect(await denied.text()).not.toContain("확정친구");
  const html=await request.get(resultPath);expect(await html.text()).not.toContain("확정친구");
  const other=await fixture(context);
  const otherCookie=(await context.cookies()).find(cookie=>cookie.name===sessionCookie(other.link.inviteToken,new Date(0)).name)!;
  expect((await request.get(statePath,{headers:{Cookie:`${sessionCookie(f.link.inviteToken,new Date(0)).name}=${otherCookie.value}`}})).status()).toBe(401);
  const fresh=await browser.newContext();
  try {
    const tab=await fresh.newPage();await tab.goto(`http://127.0.0.1:3100${resultPath}`);
    await expect(tab.getByRole("button",{name:"로그인하기",exact:true})).toBeVisible();
    await expect(tab.getByText("확정친구",{exact:true})).toHaveCount(0);
    await tab.getByLabel("닉네임",{exact:true}).fill("확정친구");await tab.getByLabel("PIN",{exact:true}).fill("1234");await tab.getByRole("button",{name:"로그인하기",exact:true}).click();
    await tab.getByRole("link",{name:"확정 결과 보기",exact:true}).click();
    await expect(tab.getByRole("heading",{name:"약속 확정",exact:true})).toBeVisible();
    const state=await tab.request.get(`http://127.0.0.1:3100${statePath}`);expect(state.status()).toBe(200);expect(state.headers()["cache-control"]).toBe("private, no-store");expect(state.headers().vary).toContain("Cookie");
    expect(JSON.stringify(await state.json())).not.toMatch(/passwordHash|sessionToken|availabilitySubmittedAt/);
    await tab.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async(text:string)=>{sessionStorage.setItem("copied",text);}}}));
    await tab.getByRole("button",{name:"결과 링크 복사",exact:true}).click();await expect(tab.getByText("결과 링크를 복사했어요.",{exact:true})).toBeVisible();
    expect(await tab.evaluate(()=>sessionStorage.getItem("copied"))).toBe(`http://127.0.0.1:3100${resultPath}`);
    await db.participantSession.updateMany({where:{participantId:f.friend.id},data:{expiresAt:new Date(Date.now()-1000)}});
    await tab.reload();await expect(tab.getByRole("button",{name:"로그인하기",exact:true})).toBeVisible();
  } finally {await fresh.close();}
  await page.goto(f.path);await expect(page).toHaveURL(resultPath);
});

test("확정 직전 무효 후보는 재조회하고 연결 실패는 재시도할 수 있다",async({page,context})=>{
  const f=await fixture(context);await page.goto(f.path);
  await page.getByRole("button",{name:"이 시간 선택",exact:true}).first().click();
  await db.participantAvailableSlot.deleteMany({where:{participantId:f.friend.id}});
  const dialog=page.getByRole("dialog",{name:"이 시간으로 확정할까요?",exact:true});
  await dialog.getByRole("button",{name:"확정하기",exact:true}).click();
  await expect(page.getByText("이 후보는 더 이상 확정할 수 없어요. 최신 후보에서 다시 선택해 주세요.",{exact:true})).toBeVisible();
  await expect(page.getByText("함께 가능한 시간이 없어요.",{exact:true})).toBeVisible();
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("closed");
  await db.participantAvailableSlot.createMany({data:["09:00","09:30"].map(time=>({participantId:f.friend.id,slotStartAt:new Date(f.slot(time))}))});
  await page.reload();await page.getByRole("button",{name:"이 시간 선택",exact:true}).first().click();
  await page.route(`**/p/${f.link.inviteToken}/candidates`,route=>route.request().method()==="POST"?route.abort():route.continue());
  await dialog.getByRole("button",{name:"확정하기",exact:true}).click();
  await expect(dialog.getByRole("alert")).toContainText("다시 시도");
  await page.unroute(`**/p/${f.link.inviteToken}/candidates`);
  let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{started=r;});
  await page.route(`**/p/${f.link.inviteToken}/candidates`,async route=>{if(route.request().method()!=="POST"){await route.continue();return;}started();await gate;await route.continue();},{times:1});
  await dialog.getByRole("button",{name:"확정하기",exact:true}).click();await ready;
  try {await expect(dialog.getByRole("button",{name:"확정 중…",exact:true})).toBeDisabled();await expect(dialog.getByRole("button",{name:"취소",exact:true})).toBeDisabled();} finally {release();}
  await expect(page).toHaveURL(`/p/${f.link.inviteToken}/result`);
});
test("결과 화면은 참석자 변동·취소를 갱신하고 연결 실패 시 재조회한다",async({page,context})=>{
  const f=await fixture(context);await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"confirmed",confirmedStartAt:new Date(f.slot("09:00"))}});
  await page.goto(`/p/${f.link.inviteToken}/result`);
  await db.participant.update({where:{id:f.friend.id},data:{status:"cancelled",cancelledAt:new Date()}});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("list",{name:"참석자",exact:true})).toHaveText("테스트친구");
  await expect(page.getByText("참석 가능한 인원이 2명 미만이에요. 재조율 또는 약속 취소를 검토해 주세요.",{exact:true})).toBeVisible();
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("confirmed");
  await page.route(`**/p/${f.link.inviteToken}/result/state`,route=>route.abort());await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("최신 결과를 확인하지 못했어요.",{exact:true})).toBeVisible();
  await page.unroute(`**/p/${f.link.inviteToken}/result/state`);await page.getByRole("button",{name:"다시 불러오기",exact:true}).click();
  await expect(page.getByText("최신 결과를 확인하지 못했어요.",{exact:true})).toHaveCount(0);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"cancelled",cancelledAt:new Date()}});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(page.getByRole("heading",{name:"취소된 약속입니다.",exact:true})).toBeVisible();
});
test("모바일 참여자는 확정 버튼이 없고 방장은 터치로 확정하며 다른 화면도 결과로 이동한다",async({browser})=>{
  const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:393,height:852}});
  try {
    const f=await fixture(context),page=await context.newPage(),other=await context.newPage();
    const url=`http://127.0.0.1:3100${f.path}`;
    await db.participant.update({where:{id:f.member.id},data:{role:"member"}});
    await page.goto(url);await expect(page.getByRole("list",{name:"시간 후보",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"이 시간 선택",exact:true})).toHaveCount(0);
    await db.participant.update({where:{id:f.member.id},data:{role:"host"}});
    await page.reload();await other.goto(url);await page.bringToFront();
    await page.getByRole("button",{name:"이 시간 선택",exact:true}).first().tap();
    const dialog=page.getByRole("dialog",{name:"이 시간으로 확정할까요?",exact:true});await expect(dialog).toBeVisible();await page.screenshot({path:"test-results/confirmation-dialog-393.png",fullPage:true});
    await dialog.getByRole("button",{name:"확정하기",exact:true}).tap();await expect(page.getByRole("heading",{name:"약속 확정",exact:true})).toBeVisible();
    await other.bringToFront();await other.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(other).toHaveURL(`http://127.0.0.1:3100/p/${f.link.inviteToken}/result`);
  } finally {await context.close();}
});
test("마감된 약속은 후보 화면으로 열리고 응답 시간표와 왕복한다",async({page,context})=>{
  const f=await fixture(context);await page.setViewportSize({width:393,height:852});
  await page.goto(f.path);
  await expect(page).toHaveURL(`/p/${f.link.inviteToken}/candidates`);
  const first=page.getByRole("button",{name:"이 시간 선택",exact:true}).first();await expect(first).toBeInViewport();
  await expect(page.getByLabel("주별 가능 시간",{exact:true})).toHaveCount(0);
  await page.getByRole("link",{name:"응답 시간표 보기",exact:true}).click();
  await expect(page).toHaveURL(`${f.path}?view=responses`);
  await expect(page.getByLabel("주별 가능 시간",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"제출 완료",exact:true})).toBeDisabled();
  const refreshed=page.waitForResponse(response=>response.url().endsWith("/availability/state"));
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await refreshed;
  await expect(page).toHaveURL(`${f.path}?view=responses`);
  await expect(page.getByRole("link",{name:"후보 보기",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"후보 보기",exact:true}).click();
  await expect(first).toBeInViewport();
});

test("후보 페이지는 모집 중·확정 상태를 안내하고 미인증 접근을 차단한다",async({page,context,request})=>{
  const f=await fixture(context),path=`/p/${f.link.inviteToken}/candidates`;
  const anonymous=await request.get(path);expect(new URL(anonymous.url()).pathname).toBe(`/p/${f.link.inviteToken}`);expect(await anonymous.text()).not.toContain("확정친구");
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"collecting",votingDeadlineAt:new Date(Date.now()+86400000)}});
  await page.goto(path);await expect(page).toHaveURL(f.path);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"closed"}});
  await page.goto(path);await expect(page.getByRole("list",{name:"시간 후보",exact:true})).toBeVisible();
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"confirmed",confirmedStartAt:new Date(f.slot("09:00"))}});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(page).toHaveURL(`/p/${f.link.inviteToken}/result`);
  await page.goto(path);await expect(page).toHaveURL(`/p/${f.link.inviteToken}/result`);
  await db.participantSession.deleteMany({where:{participantId:f.member.id}});
  await page.goto(path);await expect(page.getByRole("button",{name:"로그인하기",exact:true})).toBeVisible();
});
