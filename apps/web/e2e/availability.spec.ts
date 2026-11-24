import { returningCalendarUser } from "./returning-calendar-user";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { newToken, tokenHash } from "../src/lib/invitation/security";
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
  const promise=await db.promiseRecord.create({data:{promiseLinkId:link.id,status:"collecting",participantLimit:5,dateRangeStart:new Date(start),dateRangeEnd:new Date(end),dailyStartMinute:540,dailyEndMinute:1080,durationMinutes:120,votingDeadlineAt:new Date(Date.now()+86400000)}});
  const member=await db.participant.create({data:{promiseId:promise.id,nickname:"테스트친구",normalizedNickname:"테스트친구",passwordHash:"unused",role:"host"}});
  const sessionToken=newToken(), expiresAt=new Date(Date.now()+7*86400000);
  await db.participantSession.create({data:{participantId:member.id,sessionTokenHash:tokenHash(sessionToken),expiresAt}});
  const cookie=sessionCookie(link.inviteToken,expiresAt);
  await context.addCookies([{name:cookie.name,value:sessionToken,domain:"127.0.0.1",path:cookie.path,httpOnly:true,sameSite:"Lax",expires:expiresAt.getTime()/1000}]);
  const slot=(time:string,dayValue=start)=>new Date(`${dayValue}T${time}:00+09:00`).toISOString();
  return {link,promise,member,start,end,slot,path:`/p/${link.inviteToken}/availability`};
}
async function collapseDevBadge(page:Page){
  const badge=page.getByRole("button",{name:"Collapse issues badge",exact:true});
  if(await badge.isVisible())await badge.click();
}
async function openReset(page:Page){
  await collapseDevBadge(page);
  await page.getByRole("button",{name:"주간 반복",exact:true}).click();
  await page.getByRole("dialog",{name:"주간 반복",exact:true}).getByRole("button",{name:"초기화",exact:true}).click();
  return page.getByRole("dialog",{name:"선택한 시간을 초기화할까요?",exact:true});
}
test("날짜 보기에서 하루를 채우고 시간 수정·월 이동·제출 후에도 선택을 유지한다",async({page,context})=>{
  const f=await fixture(context);await page.setViewportSize({width:393,height:740});await page.goto(f.path);
  await expect(page.getByRole("button",{name:"날짜",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"2시간",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"30분",exact:true}).click();
  await page.getByRole("button",{name:`${f.start} 09:00`,exact:true}).click();
  await page.getByRole("button",{name:"날짜",exact:true}).click();
  const card=page.getByRole("button",{name:`${f.start} 하루 선택`,exact:true});
  await expect(page.getByRole("button",{name:"다음 달",exact:true})).toBeVisible();
  await expect(page.getByLabel("주별 가능 시간",{exact:true})).toHaveCount(0);
  await expect(card).toHaveAttribute("aria-pressed","mixed");await expect(card).toContainText("일부 가능");
  await expect(page.getByText("날짜 선택 시 09:00~18:00 가능으로 표시돼요.",{exact:true})).toBeVisible();
  await card.click();await expect(card).toHaveAttribute("aria-pressed","true");
  if(f.start.slice(0,7)!==f.end.slice(0,7)){
    await page.getByRole("button",{name:"다음 달",exact:true}).click();await expect(card).toHaveCount(0);
    await page.getByRole("button",{name:"이전 달",exact:true}).click();await expect(card).toHaveAttribute("aria-pressed","true");
  }
  await page.getByRole("button",{name:"1시간",exact:true}).click();
  const first=page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true});await expect(first).toHaveAttribute("aria-pressed","true");
  await first.click();await page.getByRole("button",{name:"날짜",exact:true}).click();await expect(card).toHaveAttribute("aria-pressed","mixed");
  await card.click();await card.click();await expect(card).toHaveAttribute("aria-pressed","false");await card.click();
  const nextDay=new Date(new Date(f.start).getTime()+86400000).toISOString().slice(0,10);
  const crossesMonth=nextDay.slice(0,7)!==f.start.slice(0,7);
  if(crossesMonth)await page.getByRole("button",{name:"다음 달",exact:true}).click();
  await page.getByRole("button",{name:`${nextDay} 하루 선택`,exact:true}).click();
  await page.getByRole("button",{name:"전체 시간",exact:true}).click();
  await expect(page.getByRole("button",{name:`${nextDay} 하루 선택`,exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"내 시간",exact:true}).click();
  await expect(page.getByRole("button",{name:`${nextDay} 하루 선택`,exact:true})).toHaveAttribute("aria-pressed","true");
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(0);
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();await expect(page.getByRole("status")).toContainText("제출했어요");
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(36);
  await page.reload();await page.getByRole("button",{name:"날짜",exact:true}).click();await expect(card).toHaveAttribute("aria-pressed","true");
  await collapseDevBadge(page);
  for(const width of [320,393,1280]){
    await page.setViewportSize({width,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const boxes=await page.getByRole("group",{name:"월별 가능 날짜",exact:true}).getByRole("button").evaluateAll(elements=>elements.map(element=>{const b=element.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right};}));
    for(let i=1;i<boxes.length;i++)if(Math.abs(boxes[i].y-boxes[i-1].y)<1)expect(boxes[i-1].right).toBeLessThanOrEqual(boxes[i].x);
    await page.screenshot({path:`test-results/date-view-${width}.png`});
  }
});
test("월 경계 날짜를 선택한 뒤 시간 보기에서 돌아와도 같은 달을 유지한다",async({page,context})=>{
  const f=await fixture(context);
  const next=new Date(`${f.start.slice(0,7)}-01T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);
  const target=next.toISOString().slice(0,10);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{dateRangeEnd:new Date(target)}});
  await page.goto(f.path);await page.getByRole("button",{name:"날짜",exact:true}).click();await page.getByRole("button",{name:"다음 달",exact:true}).click();
  const card=page.getByRole("button",{name:`${target} 하루 선택`,exact:true});await card.click();
  await page.getByRole("button",{name:"1시간",exact:true}).click();
  await expect(page.getByRole("button",{name:`${target} 09:00–10:00`,exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"날짜",exact:true}).click();await expect(card).toBeVisible();await expect(card).toHaveAttribute("aria-pressed","true");
});
test("날짜 요약은 하루 공통 인원과 일부 인원을 구분하고 조회 실패를 알린다",async({page,context})=>{
  const f=await fixture(context);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{dailyEndMinute:600,durationMinutes:60,dateRangeEnd:new Date(new Date(f.start).getTime()+40*86400000)}});
  const friend=await db.participant.create({data:{promiseId:f.promise.id,nickname:"날짜친구",normalizedNickname:"날짜친구",passwordHash:"unused",role:"member",availabilitySubmittedAt:new Date()}});
  await db.participant.update({where:{id:f.member.id},data:{availabilitySubmittedAt:new Date()}});
  await db.participantAvailableSlot.createMany({data:[{participantId:f.member.id,slotStartAt:new Date(f.slot("09:00"))},{participantId:friend.id,slotStartAt:new Date(f.slot("09:30"))}]});
  await page.setViewportSize({width:393,height:740});await page.goto(f.path);
  await page.getByRole("button",{name:"날짜",exact:true}).click();await page.getByRole("button",{name:"전체 시간",exact:true}).click();
  const summary=page.getByRole("group",{name:`${f.start} 가능 요약`,exact:true});
  await expect(summary).toContainText("전체 가능 0명");await expect(summary).toContainText("일부 가능 2명");
  await db.participantAvailableSlot.create({data:{participantId:friend.id,slotStartAt:new Date(f.slot("09:00"))}});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(summary).toContainText("전체 가능 1명");await expect(summary).toContainText("일부 가능 1명");
  await page.getByRole("button",{name:"약속 정보 열기",exact:true}).click();
  await page.getByRole("dialog",{name:"약속 정보",exact:true}).getByRole("button",{name:"날짜친구",exact:true}).click();
  await expect(summary).toContainText("전체 가능");await expect(summary.getByRole("button")).toHaveCount(0);
  await page.route("**/overview?**",route=>route.abort());
  await page.getByRole("button",{name:"다음 달",exact:true}).click();
  await expect(page.getByText("시간 정보를 불러오지 못했어요.",{exact:false})).toBeVisible();
  await expect(page.getByRole("group",{name:"월별 가능 날짜",exact:true})).toContainText("조회 못함");
  await page.unroute("**/overview?**");await page.getByRole("button",{name:"다시 불러오기",exact:true}).click();
  await expect(page.getByRole("group",{name:"월별 가능 날짜",exact:true})).not.toContainText("조회 못함");
});
test("모바일 날짜 탭과 스와이프를 구분하고 시간표 스크롤 뒤에도 날짜를 바로 보여준다",async({browser})=>{
  const context=await browser.newContext({viewport:{width:320,height:640},hasTouch:true,isMobile:true});
  try{
    const f=await fixture(context),page=await context.newPage();await page.goto(`http://127.0.0.1:3100${f.path}`);
    await page.evaluate(()=>window.scrollTo(0,500));
    await page.getByRole("button",{name:"날짜",exact:true}).tap();await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
    await expect(page.getByRole("group",{name:"터치 조작",exact:true})).toHaveCount(0);
    const cards=page.getByRole("group",{name:"월별 가능 날짜",exact:true}).locator("button:not(:disabled)");
    await cards.first().tap();await expect(cards.first()).toHaveAttribute("aria-pressed","true");
    const client=await context.newCDPSession(page),box=(await cards.nth(2).boundingBox())!;
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
    for(let n=1;n<=6;n++)await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:y-15*n}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect(cards.nth(2)).toHaveAttribute("aria-pressed","false");await expect(cards.first()).toHaveAttribute("aria-pressed","true");
    await page.evaluate(()=>new Promise<void>(resolve=>{
      let timer:ReturnType<typeof setTimeout>;
      const done=()=>{window.removeEventListener("scroll",settle);resolve();};
      const settle=()=>{clearTimeout(timer);timer=setTimeout(done,200);};
      window.addEventListener("scroll",settle);settle();
    }));
    await page.evaluate(()=>window.scrollTo(0,0));
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);await collapseDevBadge(page);
    await page.screenshot({path:"test-results/date-touch-320.png"});
    await page.getByRole("button",{name:"1시간",exact:true}).tap();await expect(page.getByRole("button",{name:"스크롤",exact:true})).toHaveAttribute("aria-pressed","true");
  }finally{await context.close();}
});
test("날짜 선택은 제출 실패·초기화 취소를 보존하고 마감 뒤에는 읽기 전용이다",async({page,context})=>{
  const f=await fixture(context);await page.goto(f.path);await page.getByRole("button",{name:"날짜",exact:true}).click();
  const card=page.getByRole("button",{name:`${f.start} 하루 선택`,exact:true});await card.focus();await page.keyboard.press("Space");
  await expect(card).toHaveAttribute("aria-pressed","true");
  await page.route(`**${f.path}`,route=>route.request().method()==="POST"?route.abort():route.continue());
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();await expect(page.getByRole("status")).toContainText("제출하지 못했어요");
  await expect(card).toHaveAttribute("aria-pressed","true");await page.unroute(`**${f.path}`);
  await openReset(page);await page.keyboard.press("Escape");await expect(card).toHaveAttribute("aria-pressed","true");
  const clear=await openReset(page);await clear.getByRole("button",{name:"이번 주 초기화",exact:true}).click();await expect(card).toHaveAttribute("aria-pressed","false");
  await card.click();await page.getByRole("button",{name:"선택 제출",exact:true}).click();await expect(page.getByRole("status")).toContainText("제출했어요");
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"closed"}});
  await page.goto(f.path+"?view=responses");await page.getByRole("button",{name:"날짜",exact:true}).click();
  await expect(card).toBeDisabled();await expect(card).toHaveAttribute("aria-pressed","true");
});
test("주간 반복 안에서 빈 주의 전체 초기화에 접근하고 제출 전 저장을 보존한다",async({page,context})=>{
  const f=await fixture(context);
  await db.participantAvailableSlot.create({data:{participantId:f.member.id,slotStartAt:new Date(f.slot("09:00"))}});
  await page.setViewportSize({width:320,height:740});await page.goto(f.path);
  await page.getByRole("button",{name:"다음 주",exact:true}).click();
  await expect(page.locator("footer").getByRole("button",{name:"초기화",exact:true})).toHaveCount(0);
  const repeat=page.getByRole("button",{name:"주간 반복",exact:true});await collapseDevBadge(page);await repeat.click();
  const weekly=page.getByRole("dialog",{name:"주간 반복",exact:true});
  await expect(weekly).toContainText("이번 주에 선택한 시간이 없어요");
  await expect(weekly.getByRole("button",{name:"적용",exact:true})).toBeDisabled();
  await weekly.getByRole("button",{name:"초기화",exact:true}).click();
  await expect(weekly).not.toBeVisible();
  const clear=page.getByRole("dialog",{name:"선택한 시간을 초기화할까요?",exact:true});
  await expect(clear.getByRole("button",{name:"이번 주 초기화",exact:true})).toBeDisabled();
  await clear.getByRole("button",{name:"전체 초기화",exact:true}).click();
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(1);
  await page.getByRole("button",{name:"이전 주",exact:true}).click();
  await expect(page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true})).toHaveAttribute("aria-pressed","false");
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("가능한 시간 없음");
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(0);
});
for(const width of [320,393])test(`모바일 ${width}px 기본 스크롤에서 시간 칸을 탭하거나 밀어도 선택되지 않는다`,async({browser})=>{
  const context=await browser.newContext({viewport:{width,height:640},hasTouch:true,isMobile:true});
  try {
    const f=await fixture(context),page=await context.newPage();
    await page.goto(`http://127.0.0.1:3100${f.path}`);
    const grid=page.getByLabel("주별 가능 시간");
    const cell=grid.locator(`button[data-day="${f.start}"][data-minute="540"]`);
    await cell.tap();
    await expect(cell).toHaveAttribute("aria-pressed","false");
    const client=await context.newCDPSession(page);
    const box=(await cell.boundingBox())!;
    const x=box.x+box.width/2,y=box.y+box.height/2+100;
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
    for(let i=1;i<=8;i++)await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:y-i*15}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(30);
    await expect(grid.locator('button[aria-pressed="true"]')).toHaveCount(0);
    await expect(page.getByRole("button",{name:"되돌리기",exact:true})).toHaveCount(0);
  } finally {await context.close();}
});
test("모바일 선택 전환으로 편집하고 스크롤 복귀 후 선택을 보존한다",async({browser})=>{
  const context=await browser.newContext({viewport:{width:393,height:640},hasTouch:true,isMobile:true});
  try {
    const f=await fixture(context),page=await context.newPage();
    await page.goto(`http://127.0.0.1:3100${f.path}`);
    const modes=page.getByRole("group",{name:"터치 조작",exact:true});
    const scroll=modes.getByRole("button",{name:"스크롤",exact:true});
    const select=modes.getByRole("button",{name:"선택",exact:true});
    await expect(scroll).toHaveAttribute("aria-pressed","true");
    await select.tap();await expect(select).toHaveAttribute("aria-pressed","true");
    const grid=page.getByLabel("주별 가능 시간");
    const cell=grid.locator(`button[data-day="${f.start}"][data-minute="540"]`);
    await cell.tap();await expect(cell).toHaveAttribute("aria-pressed","true");
    await scroll.tap();await cell.tap();await expect(cell).toHaveAttribute("aria-pressed","true");
    for(const width of [320,393]){
      await page.setViewportSize({width,height:640});
      await page.evaluate(()=>window.scrollTo(0,0));
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const fourth=(await grid.locator(`button[data-day="${f.start}"][data-minute="720"]`).boundingBox())!;
      const footer=(await page.locator("footer").boundingBox())!;
      expect(fourth.y+fourth.height).toBeLessThanOrEqual(footer.y);
      await collapseDevBadge(page);
      await page.screenshot({path:`test-results/calendar-mode-scroll-${width}.png`});
      await select.tap();
      await page.screenshot({path:`test-results/calendar-mode-select-${width}.png`});
      await scroll.tap();
    }
    await page.evaluate(()=>window.scrollTo(0,300));
    await expect(scroll).toBeInViewport();await select.tap();
    await page.getByRole("button",{name:"전체 시간",exact:true}).tap();
    await expect(modes).not.toBeVisible();
    await page.getByRole("button",{name:"내 시간",exact:true}).tap();
    await expect(scroll).toHaveAttribute("aria-pressed","true");
  } finally {await context.close();}
});
test("가능 시간을 선택하고 주를 이동한 뒤 제출·재제출·빈 제출한다",async({page,context})=>{
  const f=await fixture(context);
  await page.setViewportSize({width:393,height:852});
  await page.goto(`/p/${f.link.inviteToken}`);
  await page.getByRole("link",{name:"가능 시간 입력",exact:true}).click();
  await expect(page.getByRole("heading",{name:"가능 시간 입력",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"30분",exact:true}).click();
  const first=page.getByRole("button",{name:`${f.start} 09:00`,exact:true});
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"다음 주",exact:true}).click();
  await page.getByRole("button",{name:"이전 주",exact:true}).click();
  await expect(first).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("제출했어요");
  await page.reload();await page.getByRole("button",{name:"30분",exact:true}).click();
  await expect(first).toHaveAttribute("aria-pressed","true");
  await first.focus();await page.keyboard.press("Space");
  await expect(first).toHaveAttribute("aria-pressed","false");
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("가능한 시간 없음으로 제출했어요");
  expect((await db.participant.findUniqueOrThrow({where:{id:f.member.id}})).availabilityVersion).toBe(2);
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(0);
});
test("다른 기기의 응답·설정 변경은 미제출 선택을 지우고 최신 값으로 갱신한다",async({page,context})=>{
  const f=await fixture(context);await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  const first=page.getByRole("button",{name:`${f.start} 09:00`,exact:true}),second=page.getByRole("button",{name:`${f.start} 09:30`,exact:true});
  await first.click();
  await db.$transaction(async tx=>{
    await tx.participantAvailableSlot.create({data:{participantId:f.member.id,slotStartAt:new Date(f.slot("09:30"))}});
    await tx.participant.update({where:{id:f.member.id},data:{availabilityVersion:1,availabilitySubmittedAt:new Date()}});
  });
  await expect(page.getByRole("status")).toContainText("다른 기기",{timeout:12000});
  await expect(first).toHaveAttribute("aria-pressed","false");await expect(second).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:"되돌리기",exact:true})).toHaveCount(0);
  await first.click();
  await openReset(page);
  const dialog=page.getByRole("dialog",{name:"선택한 시간을 초기화할까요?",exact:true});await expect(dialog).toBeVisible();
  await db.promiseRecord.update({where:{id:f.promise.id},data:{durationMinutes:150}});
  await expect(page.getByRole("status")).toContainText("약속 설정이 변경",{timeout:12000});
  await expect(dialog).not.toBeVisible();
  await expect(first).toHaveAttribute("aria-pressed","false");await expect(page.getByRole("complementary",{name:"약속 정보",exact:true}).getByText("2시간 30분",{exact:true})).toBeVisible();
});
test("마우스 드래그·키보드 이동과 좁은 화면의 선택 상태를 확인한다",async({page,context})=>{
  const f=await fixture(context);await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  const cell=(time:string)=>page.getByRole("button",{name:`${f.start} ${time}`,exact:true});
  await cell("09:00").hover();await page.mouse.down();await cell("10:00").hover();await page.mouse.up();
  for(const time of ["09:00","09:30","10:00"])await expect(cell(time)).toHaveAttribute("aria-pressed","true");
  await cell("10:00").focus();await page.keyboard.press("ArrowDown");
  await expect(cell("10:30")).toBeFocused();await page.keyboard.press("Enter");
  await expect(cell("10:30")).toHaveAttribute("aria-pressed","true");
  for(const width of [320,393,1280]){
    await page.setViewportSize({width,height:width===1280?800:852});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/availability-${width}.png`,fullPage:true});
  }
});
test("모바일 터치로 선택·해제하고 제출한다",async({browser})=>{
  const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  try {
    const f=await fixture(context),page=await context.newPage();await page.goto(`http://127.0.0.1:3100${f.path}`);await page.getByRole("button",{name:"30분",exact:true}).click();
    await page.getByRole("button",{name:"선택",exact:true}).tap();
    const cell=page.getByRole("button",{name:`${f.start} 09:00`,exact:true});
    await cell.tap();await expect(cell).toHaveAttribute("aria-pressed","true");
    await cell.tap();await expect(cell).toHaveAttribute("aria-pressed","false");
    await cell.tap();await page.getByRole("button",{name:"선택 제출",exact:true}).tap();
    await expect(page.getByRole("status")).toContainText("제출했어요");
    await expect(page.getByRole("button",{name:"스크롤",exact:true})).toHaveAttribute("aria-pressed","true");
    await cell.tap();await expect(cell).toHaveAttribute("aria-pressed","true");
    await page.reload();
    await expect(page.getByRole("button",{name:"스크롤",exact:true})).toHaveAttribute("aria-pressed","true");
  } finally {await context.close();}
});
test("제출 응답이 유실돼도 선택을 유지하고 재시도 때 중복 저장하지 않는다",async({page,context})=>{
  const f=await fixture(context);await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  const cell=page.getByRole("button",{name:`${f.start} 09:00`,exact:true});await cell.click();
  await page.route(`**${f.path}/state`,route=>route.abort());
  await page.route(`**${f.path}`,async route=>{
    if(route.request().method()!=="POST")return route.continue();
    await route.fetch();await route.abort();
  });
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("다시 시도");
  await expect(cell).toHaveAttribute("aria-pressed","true");
  expect((await db.participant.findUniqueOrThrow({where:{id:f.member.id}})).availabilityVersion).toBe(1);
  await page.unroute(`**${f.path}`);
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("제출했어요");
  expect((await db.participant.findUniqueOrThrow({where:{id:f.member.id}})).availabilityVersion).toBe(1);
});
test("HTTP 충돌은 409이며 외부 출처·타인 지정·미인증 변경을 허용하지 않는다",async({page,context,request})=>{
  const f=await fixture(context);await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  const url=`${f.path}/state`,origin="http://127.0.0.1:3100";
  const body={baseVersion:0,slots:[f.slot("09:00")]};
  expect((await page.request.post(url,{headers:{origin:"https://external.example"},data:body})).status()).toBe(403);
  expect((await page.request.post(url,{data:body})).status()).toBe(403);
  expect((await request.post(url,{headers:{origin},data:body})).status()).toBe(401);
  const other=await db.participant.create({data:{promiseId:f.promise.id,nickname:"다른친구",normalizedNickname:"다른친구",passwordHash:"unused",role:"member"}});
  const saved=await page.request.post(url,{headers:{origin},data:{...body,participantId:other.id}});
  expect(saved.status()).toBe(200);
  expect((await db.participant.findUniqueOrThrow({where:{id:other.id}})).availabilityVersion).toBe(0);
  const conflict=await page.request.post(url,{headers:{origin},data:{baseVersion:0,slots:[]}});
  expect(conflict.status()).toBe(409);expect(await conflict.json()).toMatchObject({code:"AVAILABILITY_VERSION_CONFLICT",snapshot:{version:1,slots:body.slots}});
  expect((await page.request.get(url)).headers()["cache-control"]).toBe("private, no-store");
});
test("마감 뒤 조회는 읽기 전용이고 취소·세션 만료 시 약속 안내로 이동한다",async({page,context})=>{
  const f=await fixture(context);await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  await page.getByRole("button",{name:`${f.start} 09:00`,exact:true}).click();
  await db.promiseRecord.update({where:{id:f.promise.id},data:{votingDeadlineAt:new Date(Date.now()-1000)}});
  await expect(page).toHaveURL(`/p/${f.link.inviteToken}/candidates`,{timeout:12000});
  await page.getByRole("link",{name:"응답 시간표 보기",exact:true}).click();
  await expect(page.getByRole("button",{name:"선택 제출",exact:true})).toBeDisabled();
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("collecting");
  await db.participantSession.deleteMany({where:{participantId:f.member.id}});
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"cancelled",cancelledAt:new Date()}});
  await expect(page.getByRole("heading",{name:"취소된 약속입니다."})).toBeVisible({timeout:12000});
});
test("타인의 제출과 늦게 도착한 조회가 본인 선택·제출 결과를 덮어쓰지 않는다",async({page,context})=>{
  const f=await fixture(context);await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  const cell=page.getByRole("button",{name:`${f.start} 09:00`,exact:true});await cell.click();
  const other=await db.participant.create({data:{promiseId:f.promise.id,nickname:"다른참여자",normalizedNickname:"다른참여자",passwordHash:"unused",role:"member",availabilityVersion:1,availabilitySubmittedAt:new Date()}});
  await db.participantAvailableSlot.create({data:{participantId:other.id,slotStartAt:new Date(f.slot("09:30"))}});
  const polled=page.waitForResponse(response=>response.url().endsWith(`${f.path}/state`));
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await polled;
  await expect(cell).toHaveAttribute("aria-pressed","true");
  let release!:()=>void,received!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<void>(resolve=>{received=resolve;});
  await page.route(`**${f.path}/state`,async route=>{const old=await route.fetch();received();await held;await route.fulfill({response:old});},{times:1});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await ready;
  try {
    await page.getByRole("button",{name:"선택 제출",exact:true}).click();
    await expect(page.getByRole("status")).toContainText("제출했어요");
  } finally {release();}
  await expect(cell).toHaveAttribute("aria-pressed","true");
  await page.reload();await page.getByRole("button",{name:"30분",exact:true}).click();await expect(cell).toHaveAttribute("aria-pressed","true");
  expect((await db.participant.findUniqueOrThrow({where:{id:f.member.id}})).availabilityVersion).toBe(1);
});
test("로그인 주체가 바뀌면 이전 편집 화면을 닫고 새 참여 정보를 보여 준다",async({page,context})=>{
  const f=await fixture(context);await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  await page.getByRole("button",{name:`${f.start} 09:00`,exact:true}).click();
  const other=await db.participant.create({data:{promiseId:f.promise.id,nickname:"새로그인",normalizedNickname:"새로그인",passwordHash:"unused",role:"member"}});
  const token=newToken(),expiresAt=new Date(Date.now()+86400000);
  await db.participantSession.create({data:{participantId:other.id,sessionTokenHash:tokenHash(token),expiresAt}});
  const cookie=sessionCookie(f.link.inviteToken,expiresAt);
  await context.addCookies([{name:cookie.name,value:token,domain:"127.0.0.1",path:cookie.path,httpOnly:true,sameSite:"Lax",expires:expiresAt.getTime()/1000}]);
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading",{name:"참여 정보",exact:true})).toBeVisible({timeout:12000});
  await expect(page.getByText("새로그인",{exact:true})).toBeVisible();
  expect((await db.participant.findUniqueOrThrow({where:{id:other.id}})).availabilityVersion).toBe(0);
});
for(const gap of ["가로","세로"] as const)test(`선택 모드의 ${gap} 칸 사이 여백에서 드래그해도 페이지 스크롤 대신 선택한다`,async({browser})=>{
  const context=await browser.newContext({viewport:{width:393,height:740},hasTouch:true,isMobile:true});
  try{
    const f=await fixture(context),page=await context.newPage();await page.goto(`http://127.0.0.1:3100${f.path}`);
    await page.getByRole("button",{name:"다음 주",exact:true}).tap();await page.getByRole("button",{name:"선택",exact:true}).tap();
    const grid=page.getByLabel("주별 가능 시간",{exact:true});
    const first=grid.locator('button[data-minute="660"]:not(:disabled)').first();
    const a=(await first.boundingBox())!;
    const b=(await (gap==="가로"?grid.locator('button[data-minute="660"]:not(:disabled)').nth(1):grid.locator('button[data-minute="720"]:not(:disabled)').first()).boundingBox())!;
    const x=gap==="가로"?(a.x+a.width+b.x)/2:a.x+a.width/2,y=gap==="가로"?a.y+a.height/2:(a.y+a.height+b.y)/2;
    const client=await context.newCDPSession(page);
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
    for(let n=1;n<=6;n++)await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:y-15*n}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect.poll(()=>grid.locator('button[aria-pressed="true"]').count()).toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(()=>window.scrollY)).toBe(0);
  }finally{await context.close();}
});
test("모바일 손가락 드래그로 연속 시간을 선택·해제하고 시간축에서 스크롤한다",async({browser})=>{
  const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  try {
    const f=await fixture(context),page=await context.newPage();await page.goto(`http://127.0.0.1:3100${f.path}`);await page.getByRole("button",{name:"30분",exact:true}).click();
    await page.getByRole("button",{name:"선택",exact:true}).tap();
    const cell=(time:string)=>page.getByRole("button",{name:`${f.start} ${time}`,exact:true});
    const client=await context.newCDPSession(page);
    const start=await cell("09:00").boundingBox(),end=await cell("10:30").boundingBox();
    if(!start || !end)throw new Error("시간 셀 없음");
    const x=start.x+start.width/2,y=start.y+start.height/2,endY=end.y+end.height/2;
    async function swipe(){
      await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
      for(let i=1;i<=6;i++)await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:y+(endY-y)*i/6}]});
      await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    }
    await swipe();
    for(const time of ["09:00","09:30","10:00","10:30"])await expect(cell(time)).toHaveAttribute("aria-pressed","true");
    await swipe();
    for(const time of ["09:00","09:30","10:00","10:30"])await expect(cell(time)).toHaveAttribute("aria-pressed","false");
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:endY}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchCancel",touchPoints:[]});
    for(const time of ["09:00","09:30","10:00","10:30"])await expect(cell(time)).toHaveAttribute("aria-pressed","false");
    const grid=page.getByLabel("주별 가능 시간"),box=await grid.boundingBox();if(!box)throw new Error("시간표 없음");
    const footer=await page.locator("footer").boundingBox();
    const visibleBottom=Math.min(box.y+box.height,page.viewportSize()!.height,footer!.y);
    const axisX=box.x+18,axisY=visibleBottom-60;
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:axisX,y:axisY}]});
    for(let i=1;i<=6;i++)await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:axisX,y:axisY-i*24}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(30);
    await expect(grid.locator('button[aria-pressed="true"]')).toHaveCount(0);
  } finally {await context.close();}
});
test("모바일 드래그 중 가장자리 자동 스크롤과 제출을 유지한다",async({browser})=>{
  const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  try {
    const f=await fixture(context),page=await context.newPage();
    await page.goto(`http://127.0.0.1:3100${f.path}`);await page.getByRole("button",{name:"30분",exact:true}).click();
    await page.getByRole("button",{name:"선택",exact:true}).tap();
    const start=await page.getByRole("button",{name:`${f.start} 09:00`,exact:true}).boundingBox();
    const grid=await page.getByLabel("주별 가능 시간").boundingBox(),footer=await page.locator("footer").boundingBox();
    if(!start||!grid||!footer)throw new Error("시간표 없음");
    const x=start.x+start.width/2,y=start.y+start.height/2;
    const visibleBottom=Math.min(grid.y+grid.height,page.viewportSize()!.height,footer.y);
    const client=await context.newCDPSession(page);
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:visibleBottom-8}]});
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(30);
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await page.getByRole("button",{name:"선택 제출",exact:true}).tap();
    await expect(page.getByRole("status")).toContainText("제출했어요");
  } finally {await context.close();}
});
for(const width of [320,393])test(`모바일 ${width}px 오른쪽 하단을 밀면 선택을 유지하며 페이지를 스크롤한다`,async({browser})=>{
  const context=await browser.newContext({viewport:{width,height:852},hasTouch:true,isMobile:true});
  try {
    const f=await fixture(context),page=await context.newPage();
    await page.goto(`http://127.0.0.1:3100${f.path}`);
    await page.getByRole("button",{name:"30분",exact:true}).click();
    await page.getByRole("button",{name:"선택",exact:true}).tap();
    const grid=page.getByLabel("주별 가능 시간");
    const lastDay=grid.locator('button[data-minute="540"]').last();
    await lastDay.tap();
    await expect(lastDay).toHaveAttribute("aria-pressed","true");
    const selected=()=>grid.locator('button[aria-pressed="true"]').evaluateAll(cells=>cells.map(cell=>cell.getAttribute("aria-label")));
    const before=await selected();
    const client=await context.newCDPSession(page);
    const footer=await page.locator("footer").boundingBox();
    if(!footer)throw new Error("하단 버튼 없음");
    const x=width-30,y=footer.y-70;
    const initialScroll=await page.evaluate(()=>window.scrollY);
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
    for(let i=1;i<=8;i++)await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:y-i*20}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect.poll(selected).toEqual(before);
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(initialScroll+30);
    const heading=await page.locator("[data-day-heading]").last().boundingBox();
    const cell=await lastDay.boundingBox();
    expect(Math.abs((heading!.x+heading!.width/2)-(cell!.x+cell!.width/2))).toBeLessThan(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  } finally {await context.close();}
});
test("모바일 상단 정보를 접어도 방장 마감은 밖에서 열고 선택을 보존한다",async({page,context})=>{
  const f=await fixture(context);
  await page.setViewportSize({width:393,height:640});await page.goto(f.path);
  const menu=page.getByRole("button",{name:"약속 정보 열기",exact:true});
  await expect(menu).toHaveAccessibleName("약속 정보 열기");await expect(menu).toHaveText("");
  await expect(menu).toHaveAttribute("aria-expanded","false");
  const closeButton=page.getByRole("button",{name:"응답 마감",exact:true});
  await expect(closeButton).toBeInViewport();
  const first=page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true});
  await first.click();
  await page.evaluate(()=>window.scrollTo(0,120));
  const before=await page.evaluate(()=>window.scrollY);
  await menu.click();
  const dialog=page.getByRole("dialog",{name:"약속 정보",exact:true});
  await expect(dialog).toBeVisible();await expect(menu).toHaveAttribute("aria-expanded","true");
  await expect(dialog.getByRole("heading",{name:"약속 일정",exact:true})).toBeVisible();
  await expect(dialog.getByRole("link",{name:"초대 링크 · 참여 정보",exact:true})).toHaveAttribute("href",`/p/${f.link.inviteToken}`);
  await expect(dialog.getByText("내 참여 정보",{exact:true})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(closeButton).toBeInViewport();await closeButton.click();
  const confirm=page.getByRole("dialog",{name:"응답을 마감할까요?"});
  await expect(confirm).toBeVisible();await confirm.getByRole("button",{name:"취소",exact:true}).click();
  await expect(first).toHaveAttribute("aria-pressed","true");
  expect(await page.evaluate(()=>window.scrollY)).toBe(before);
  await db.participant.update({where:{id:f.member.id},data:{role:"member"}});
  await page.reload();
  await expect(page.getByRole("button",{name:"응답 마감",exact:true})).toHaveCount(0);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"closed"}});
  await page.goto(`${f.path}?view=responses`);
  await page.screenshot({path:"test-results/availability-closed-393.png"});
  await page.getByRole("link",{name:"후보 보기",exact:true}).click();
  await expect(page).toHaveURL(`/p/${f.link.inviteToken}/candidates`);
});
for(const width of [320,393])test(`짧은 모바일 ${width}px에서 시간표 중앙과 첫 화면 네 행을 확보한다`,async({page,context})=>{
  const f=await fixture(context);
  await page.setViewportSize({width,height:640});await page.goto(f.path);
  await page.evaluate(()=>document.fonts.ready);
  const headings=page.locator("[data-day-heading]");
  const first=(await headings.first().boundingBox())!,last=(await headings.last().boundingBox())!;
  const view=(await page.getByRole("group",{name:"시간 보기",exact:true}).boundingBox())!;
  const grid=(await page.getByLabel("주별 가능 시간").boundingBox())!;
  expect(Math.abs(last.x+last.width-(grid.x+grid.width))).toBeLessThan(1);
  expect(Math.abs(grid.x+grid.width/2-width/2)).toBeLessThan(1);
  // The deadline action has its own wider column; tabs stay between it and the menu.
  const menu=(await page.getByRole("button",{name:"약속 정보 열기",exact:true}).boundingBox())!;
  const close=(await page.getByRole("button",{name:"응답 마감",exact:true}).boundingBox())!;
  expect(menu.x+menu.width).toBeLessThanOrEqual(view.x);
  expect(view.x+view.width).toBeLessThanOrEqual(close.x);
  expect(Math.abs(close.y+close.height/2-(menu.y+menu.height/2))).toBeLessThan(1);
  const footer=(await page.locator("footer").boundingBox())!;
  const slots=page.getByLabel("주별 가능 시간").locator(`button[data-day="${f.start}"]`);
  const visibleRows=await slots.evaluateAll((cells,{top,bottom})=>cells.filter(cell=>{const box=cell.getBoundingClientRect();return box.top>=top&&box.bottom<=bottom&&box.height>=36;}).length,{top:first.y+first.height,bottom:footer.y});
  expect(visibleRows).toBeGreaterThanOrEqual(4);
  expect(await page.evaluate(()=>window.scrollY)).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole("button",{name:"약속 정보 열기",exact:true})).toBeInViewport();
  await expect(page.getByRole("button",{name:"선택 제출",exact:true})).toBeInViewport();
  await collapseDevBadge(page);
  await page.screenshot({path:`test-results/availability-compact-${width}.png`});
});
test("모바일 사이드바를 닫으면 선택을 유지하며 PC에서는 정보를 펼쳐 둔다",async({page,context})=>{
  const f=await fixture(context);await page.setViewportSize({width:393,height:852});await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  const first=page.getByRole("button",{name:`${f.start} 09:00`,exact:true});await first.click();
  const menu=page.getByRole("button",{name:"약속 정보 열기",exact:true});
  await menu.click();const dialog=page.getByRole("dialog",{name:"약속 정보",exact:true});
  await expect(dialog).toBeVisible();await expect(dialog.getByRole("button",{name:"테스트친구",exact:true})).toBeVisible();
  expect((await dialog.boundingBox())!.x).toBe(0);
  await page.screenshot({path:"test-results/availability-sidebar-393.png",fullPage:true});
  await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(menu).toBeFocused();
  await menu.click();
  await dialog.getByRole("button",{name:"약속 정보 닫기",exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(first).toHaveAttribute("aria-pressed","true");
  await menu.click();await dialog.getByRole("button",{name:"전체 일정",exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button",{name:"전체 시간",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"내 시간",exact:true}).click();await expect(first).toHaveAttribute("aria-pressed","true");
  await page.setViewportSize({width:1280,height:800});
  await expect(menu).not.toBeVisible();await expect(page.getByRole("complementary",{name:"약속 정보",exact:true})).toBeVisible();
  await page.screenshot({path:"test-results/availability-sidebar-1280.png",fullPage:true});
});
test("주간 반복의 이번 주 초기화는 취소와 다른 주 선택을 보존한다",async({page,context})=>{
  const f=await fixture(context);await page.setViewportSize({width:393,height:852});await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  const first=page.getByRole("button",{name:`${f.start} 09:00`,exact:true});await first.click();
  await page.getByRole("button",{name:"다음 주",exact:true}).click();
  const nextDay=new Date(new Date(f.start).getTime()+7*86400000).toISOString().slice(0,10);
  const second=page.getByRole("button",{name:`${nextDay} 09:00`,exact:true});await second.click();
  const dialog=await openReset(page);await expect(dialog).toBeVisible();
  await page.screenshot({path:"test-results/availability-clear-dialog.png",fullPage:true});
  await dialog.getByRole("button",{name:"취소",exact:true}).click();await expect(dialog).not.toBeVisible();
  await expect(second).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:"주간 반복",exact:true})).toBeFocused();
  await openReset(page);await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();
  await expect(second).toHaveAttribute("aria-pressed","true");
  await openReset(page);await dialog.getByRole("button",{name:"이번 주 초기화",exact:true}).click();
  await expect(second).toHaveAttribute("aria-pressed","false");
  await page.getByRole("button",{name:"이전 주",exact:true}).click();await expect(first).toHaveAttribute("aria-pressed","true");
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(0);
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("제출했어요");
  expect((await db.participantAvailableSlot.findMany({where:{participantId:f.member.id}})).map(row=>row.slotStartAt.toISOString())).toEqual([f.slot("09:00")]);
});
test("빈 주에서 전체 초기화해도 제출 전에는 기존 저장을 유지한다",async({page,context})=>{
  const f=await fixture(context);
  const secondDay=new Date(new Date(f.start).getTime()+7*86400000).toISOString().slice(0,10);
  await db.participantAvailableSlot.createMany({data:[f.slot("09:00"),f.slot("09:00",secondDay)].map(slot=>({participantId:f.member.id,slotStartAt:new Date(slot)}))});
  await page.setViewportSize({width:320,height:852});await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  await page.getByRole("button",{name:"다음 주",exact:true}).click();await page.getByRole("button",{name:"다음 주",exact:true}).click();
  const dialog=await openReset(page);
  await expect(dialog.getByRole("button",{name:"이번 주 초기화",exact:true})).toBeDisabled();
  await page.screenshot({path:"test-results/availability-clear-all-320.png",fullPage:true});
  await dialog.getByRole("button",{name:"전체 초기화",exact:true}).click();
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(2);
  await page.getByRole("button",{name:"이전 주",exact:true}).click();
  await expect(page.getByRole("button",{name:`${secondDay} 09:00`,exact:true})).toHaveAttribute("aria-pressed","false");
  await page.getByRole("button",{name:"이전 주",exact:true}).click();
  await expect(page.getByRole("button",{name:`${f.start} 09:00`,exact:true})).toHaveAttribute("aria-pressed","false");
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();await expect(page.getByRole("status")).toContainText("가능한 시간 없음");
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(0);
});
test("전체 초기화 후 제출해도 이미 지난 선택은 보존한다",async({page,context})=>{
  const f=await fixture(context);
  const pastDay=new Date(Date.now()+9*3600000-86400000).toISOString().slice(0,10),pastSlot=f.slot("09:00",pastDay);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{dateRangeStart:new Date(pastDay)}});
  await db.participantAvailableSlot.createMany({data:[pastSlot,f.slot("09:00")].map(slot=>({participantId:f.member.id,slotStartAt:new Date(slot)}))});
  await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();await openReset(page);
  await page.getByRole("dialog").getByRole("button",{name:"전체 초기화",exact:true}).click();
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();await expect(page.getByRole("status")).toContainText("제출했어요");
  expect((await db.participantAvailableSlot.findMany({where:{participantId:f.member.id}})).map(row=>row.slotStartAt.toISOString())).toEqual([pastSlot]);
});
test("축소해도 부분 선택을 보존하고 1시간 묶음·마지막 짧은 칸을 30분 슬롯으로 제출한다",async({page,context})=>{
  const f=await fixture(context);await db.promiseRecord.update({where:{id:f.promise.id},data:{dailyEndMinute:1410}});
  await page.setViewportSize({width:393,height:852});await page.goto(f.path);
  await expect(page.getByRole("button",{name:"1시간",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true})).toBeVisible();
  await page.screenshot({path:"test-results/availability-default-hour.png",fullPage:true});
  await page.getByRole("button",{name:"30분",exact:true}).click();
  await page.getByRole("button",{name:`${f.start} 09:00`,exact:true}).click();
  const hourly=page.getByRole("button",{name:"1시간",exact:true});await expect(hourly).toBeVisible();await hourly.click();
  await expect(page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true})).toHaveAttribute("aria-pressed","mixed");
  await page.getByRole("button",{name:"1시간",exact:true}).click();
  const group=page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true});await expect(group).toHaveAttribute("aria-pressed","mixed");
  await page.getByRole("button",{name:"30분",exact:true}).click();
  await expect(page.getByRole("button",{name:`${f.start} 09:00`,exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:`${f.start} 09:30`,exact:true})).toHaveAttribute("aria-pressed","false");
  await page.getByRole("button",{name:"1시간",exact:true}).click();await group.focus();await page.keyboard.press("Space");
  await expect(group).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:`${f.start} 23:00–23:30`,exact:true}).click();
  for(const width of [320,393,1280]){await page.setViewportSize({width,height:width===1280?800:852});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/availability-zoom-${width}.png`,fullPage:true});}
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();await expect(page.getByRole("status")).toContainText("제출했어요");
  expect((await db.participantAvailableSlot.findMany({where:{participantId:f.member.id},orderBy:{slotStartAt:"asc"}})).map(row=>row.slotStartAt.toISOString())).toEqual(["09:00","09:30","23:00"].map(time=>f.slot(time)));
});

for (const width of [320, 1280]) test(`내 시간의 30분 선택은 실제 위아래 반 칸으로 표시한다 ${width}`, async ({page, context}) => {
  const f = await fixture(context);
  await db.participantAvailableSlot.createMany({data:["09:00", "10:30"].map(time => ({participantId:f.member.id, slotStartAt:new Date(f.slot(time))}))});
  await page.setViewportSize({width, height:852});
  await page.goto(f.path);
  const first = page.getByRole("button", {name:`${f.start} 09:00–10:00`, exact:true});
  const second = page.getByRole("button", {name:`${f.start} 10:00–11:00`, exact:true});
  for (const [cell, start, end, selectedIndex] of [[first, "09:00", "09:30", 0], [second, "10:30", "11:00", 1]] as const) {
    await expect(cell).toHaveAttribute("aria-pressed", "mixed");
    await expect(cell).not.toContainText("일부");
    await expect(cell).toHaveAccessibleDescription(`${start}–${end} 선택됨`);
    const halves = cell.locator('[data-selected]');
    await expect(halves).toHaveCount(2);
    await expect(halves.nth(selectedIndex)).toHaveAttribute("data-selected", "true");
    await expect(halves.nth(1-selectedIndex)).toHaveAttribute("data-selected", "false");
    const top = (await halves.nth(0).boundingBox())!, bottom = (await halves.nth(1).boundingBox())!;
    expect(top.height).toBeCloseTo(bottom.height, 1);
    expect(bottom.y - (top.y + top.height)).toBeCloseTo(0, 1);
    const colors = await halves.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor));
    expect(colors[0]).not.toBe(colors[1]);
  }
  await page.screenshot({path:`test-results/my-half-slots-${width}.png`});
  await page.getByRole("button", {name:"30분", exact:true}).click();
  for (const [time, selected] of [["09:00", true], ["09:30", false], ["10:00", false], ["10:30", true]] as const)
    await expect(page.getByRole("button", {name:`${f.start} ${time}`, exact:true})).toHaveAttribute("aria-pressed", String(selected));
  await page.getByRole("button", {name:"1시간", exact:true}).click();
  await first.focus(); await page.keyboard.press("Space");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(first.locator('[data-selected]')).toHaveCount(0);
  await page.getByRole("button", {name:"선택 제출", exact:true}).click();
  await expect(page.getByRole("status")).toContainText("제출했어요");
  expect((await db.participantAvailableSlot.findMany({where:{participantId:f.member.id}, orderBy:{slotStartAt:"asc"}})).map(row => row.slotStartAt.toISOString())).toEqual(["09:00", "09:30", "10:30"].map(time => f.slot(time)));
});

test("내 시간은 1시간 보기에서도 인접한 반 칸·전체 칸을 연결하고 빈 30분에서 끊는다", async ({page, context}) => {
  const f = await fixture(context);
  await db.participantAvailableSlot.createMany({data:["09:30","10:00","10:30","11:00","12:30","13:00","14:00"].map(time=>({participantId:f.member.id,slotStartAt:new Date(f.slot(time))}))});
  await page.setViewportSize({width:393,height:852}); await page.goto(f.path);
  const cell = (start:string,end:string) => page.getByRole("button",{name:`${f.start} ${start}–${end}`,exact:true});
  const first=cell("09:00","10:00"),middle=cell("10:00","11:00"),last=cell("11:00","12:00");
  await expect(first).toHaveAttribute("data-connected-after","true");
  await expect(middle).toHaveAttribute("data-block-start","false");
  await expect(middle).toHaveAttribute("data-block-end","false");
  await expect(last).toHaveAttribute("data-connected-before","true");
  const fills=[first.locator('[data-selected="true"]'),middle,last.locator('[data-selected="true"]')];
  for(let i=1;i<fills.length;i++) {
    const before=(await fills[i-1].boundingBox())!,after=(await fills[i].boundingBox())!;
    expect(after.y).toBeLessThanOrEqual(before.y+before.height);
  }
  await expect(last).toHaveAttribute("data-connected-after","false");
  await expect(cell("12:00","13:00")).toHaveAttribute("data-connected-before","false");
  await expect(cell("12:00","13:00")).toHaveAttribute("data-connected-after","true");
  await expect(cell("13:00","14:00")).toHaveAttribute("data-connected-before","true");
  await expect(cell("13:00","14:00")).toHaveAttribute("data-connected-after","false");
  await expect(cell("14:00","15:00")).toHaveAttribute("data-connected-before","false");
  await page.screenshot({path:"test-results/my-half-connected-393.png"});
});

for (const mode of ["내 시간", "전체 시간"]) test(`반 칸은 내 시간에서 한 외곽선을 공유하고 전체 시간에서는 구간 모서리를 유지한다: ${mode}`, async ({page, context}) => {
  const f = await fixture(context);
  await db.participant.update({where:{id:f.member.id}, data:{availabilitySubmittedAt:new Date(), availabilityVersion:1}});
  await db.participantAvailableSlot.create({data:{participantId:f.member.id, slotStartAt:new Date(f.slot("09:30"))}});
  await page.setViewportSize({width:393, height:852}); await page.goto(f.path);
  if (mode === "전체 시간") await page.getByRole("button", {name:mode, exact:true}).click();
  const parts = mode === "내 시간"
    ? page.getByRole("button", {name:`${f.start} 09:00–10:00`, exact:true}).locator('[data-selected]')
    : page.locator(`[aria-label="${f.start} 09:00 가능 0명 / 전체 1명"], [aria-label="${f.start} 09:30 가능 1명 / 전체 1명"]`);
  await expect(parts).toHaveCount(2);
  for (const [index, part] of (await parts.all()).entries()) {
    const corners = await part.evaluate(node => {const style=getComputedStyle(node); return [style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomLeftRadius,style.borderBottomRightRadius].map(parseFloat);});
    if (mode === "내 시간") expect(corners).toEqual(index === 0 ? [8,8,0,0] : [0,0,8,8]);
    else expect(corners.every(radius => radius >= 8)).toBe(true);
  }
  const top = (await parts.nth(0).boundingBox())!, bottom = (await parts.nth(1).boundingBox())!;
  if (mode === "내 시간") {
    expect(bottom.y - (top.y + top.height)).toBeCloseTo(0, 1);
    const cell = parts.first().locator("..");
    await expect(cell).toHaveCSS("overflow", "visible");
    await expect(cell).toHaveCSS("border-top-width", "1px");
    await expect(cell).toHaveCSS("border-top-left-radius", "9px");
  } else expect(bottom.y).toBeGreaterThan(top.y + top.height);
  await page.screenshot({path:`test-results/rounded-half-${mode === "내 시간" ? "mine" : "all"}.png`});
});

test("주간 반복은 미제출 시간을 복사하고 명시적으로 제출한다",async({page,context})=>{
  const f=await fixture(context);
  await page.setViewportSize({width:393,height:852});
  await page.goto(f.path);
  const repeat=page.getByRole("button",{name:"주간 반복",exact:true});
  await expect(repeat).toBeEnabled();
  await page.getByRole("button",{name:"30분",exact:true}).click();
  await page.getByRole("button",{name:`${f.start} 09:30`,exact:true}).click();
  await page.getByRole("button",{name:`${f.start} 11:00`,exact:true}).click();
  await page.getByRole("button",{name:"1시간",exact:true}).click();
  // 개발 도구 배지가 하단 제품 버튼을 가릴 때 실제 닫기 버튼으로 접는다.
  const devBadge=page.getByRole("button",{name:"Collapse issues badge",exact:true});
  if(await devBadge.isVisible()) await devBadge.click();
  await repeat.click();
  const dialog=page.getByRole("dialog",{name:"주간 반복",exact:true});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("09:30 ~ 10:00, 11:00 ~ 11:30",{exact:true})).not.toBeVisible();
  await dialog.locator("summary").focus();await page.keyboard.press("Enter");
  await expect(dialog.getByText("09:30 ~ 10:00, 11:00 ~ 11:30",{exact:true})).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(dialog.getByText("09:30 ~ 10:00, 11:00 ~ 11:30",{exact:true})).not.toBeVisible();
  const apply=dialog.getByRole("button",{name:"적용",exact:true});
  const all=dialog.getByRole("radio",{name:"전체 선택",exact:true});
  const custom=dialog.getByRole("radio",{name:"직접 선택",exact:true});
  await expect(all).toBeChecked();await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(apply).toBeEnabled();
  await custom.check();await expect(apply).toBeDisabled();
  await dialog.getByRole("checkbox").first().check();
  await expect(dialog).toContainText("1개 주에 1시간 추가");
  await all.check();await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(dialog).toContainText("2개 주에 2시간 추가");
  await custom.check();await expect(dialog.getByRole("checkbox").first()).toBeChecked();
  await dialog.getByRole("checkbox").first().uncheck();await expect(apply).toBeDisabled();
  await all.focus();await page.keyboard.press("Space");
  await expect(dialog).toContainText("09:30 ~ 10:00");
  await expect(dialog).toContainText("11:00 ~ 11:30");
  await expect(dialog).toContainText("2개 주에 2시간 추가");
  for(const width of [320,393,1280]){
    await page.setViewportSize({width,height:width===1280?800:852});
    const box=await dialog.boundingBox();expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);
    await expect(apply).toBeInViewport();
    await page.screenshot({path:`test-results/availability-repeat-${width}.png`,fullPage:true});
  }
  await apply.click();await expect(dialog).not.toBeVisible();
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(0);
  const nextDay=new Date(new Date(`${f.start}T00:00:00Z`).getTime()+7*86400000).toISOString().slice(0,10);
  await page.getByRole("button",{name:"다음 주",exact:true}).click();
  const target=page.getByRole("button",{name:`${nextDay} 09:00–10:00`,exact:true});
  await expect(target).toHaveAttribute("aria-pressed","mixed");
  await expect(target).toHaveAttribute("aria-pressed","mixed");
  await repeat.click();
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(apply).toBeDisabled();await expect(dialog).toContainText("이미 선택된 시간이거나 추가할 미래 시간이 없어요");
  await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(repeat).toBeFocused();
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("제출했어요");
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(6);
  await page.reload();await page.getByRole("button",{name:"다음 주",exact:true}).click();
  await expect(target).toHaveAttribute("aria-pressed","mixed");
});

test("주간 반복 창은 서버 응답·설정 변경과 마감 때 닫혀 오래된 입력을 적용하지 않는다",async({page,context})=>{
  const f=await fixture(context);await page.goto(f.path);
  await page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true}).click();
  const repeat=page.getByRole("button",{name:"주간 반복",exact:true});
  const dialog=page.getByRole("dialog",{name:"주간 반복",exact:true});
  await repeat.click();await expect(dialog).toBeVisible();
  await db.$transaction(async tx=>{
    await tx.participantAvailableSlot.create({data:{participantId:f.member.id,slotStartAt:new Date(f.slot("09:30"))}});
    await tx.participant.update({where:{id:f.member.id},data:{availabilityVersion:1,availabilitySubmittedAt:new Date()}});
  });
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("status")).toContainText("다른 기기");await expect(dialog).not.toBeVisible();
  await repeat.click();await expect(dialog).toBeVisible();
  await db.promiseRecord.update({where:{id:f.promise.id},data:{durationMinutes:150}});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("status")).toContainText("약속 설정이 변경");await expect(dialog).not.toBeVisible();
  await repeat.click();await expect(dialog).toBeVisible();
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"closed"}});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(`/p/${f.link.inviteToken}/candidates`);await expect(dialog).not.toBeVisible();
  await page.getByRole("link",{name:"응답 시간표 보기",exact:true}).click();
  await expect(repeat).toBeDisabled();
});

test("주간 반복은 모바일에서 보고 있는 주를 기준으로 삼고 취소하면 선택을 보존한다",async({browser})=>{
  const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  try {
    const f=await fixture(context),page=await context.newPage();
    const second=new Date(new Date(`${f.start}T00:00:00Z`).getTime()+7*86400000).toISOString().slice(0,10);
    await db.participantAvailableSlot.createMany({data:[{participantId:f.member.id,slotStartAt:new Date(f.slot("09:30"))},{participantId:f.member.id,slotStartAt:new Date(f.slot("13:30",second))}]});
    await db.participant.update({where:{id:f.member.id},data:{availabilityVersion:1,availabilitySubmittedAt:new Date()}});
    await page.goto(`http://127.0.0.1:3100${f.path}`);
    await page.getByRole("button",{name:"다음 주",exact:true}).tap();
    const devBadge=page.getByRole("button",{name:"Collapse issues badge",exact:true});
    if(await devBadge.isVisible()) await devBadge.tap();
    const repeat=page.getByRole("button",{name:"주간 반복",exact:true});await repeat.tap();
    const dialog=page.getByRole("dialog",{name:"주간 반복",exact:true});
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    await dialog.locator("summary").tap();
    await expect(dialog).toContainText("13:30 ~ 14:00");await expect(dialog).not.toContainText("09:30 ~ 10:00");
    await dialog.getByRole("radio",{name:"직접 선택",exact:true}).tap();
    await dialog.getByRole("checkbox").first().tap();
    await expect(dialog.getByRole("checkbox").first()).toBeChecked();
    await dialog.getByRole("radio",{name:"전체 선택",exact:true}).tap();
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    await dialog.getByRole("button",{name:"취소",exact:true}).tap();await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button",{name:"되돌리기",exact:true})).toHaveCount(0);
    expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(2);
    await repeat.tap();await expect(dialog).toContainText("13:30 ~ 14:00");
    await expect(dialog.getByRole("radio",{name:"전체 선택",exact:true})).toBeChecked();
    await expect(dialog.getByRole("button",{name:"적용",exact:true})).toBeEnabled();
    await dialog.getByRole("button",{name:"주간 반복 닫기",exact:true}).tap();
    await expect(page.getByRole("button",{name:`${second} 13:00–14:00`,exact:true})).toHaveAttribute("aria-pressed","mixed");
  } finally {await context.close();}
});

test("주간 반복은 빈 주를 기준으로 삼지 않고 대상 주가 없으면 안내한다",async({page,context})=>{
  const f=await fixture(context);await page.goto(f.path);
  const source=page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true});await source.click();
  const repeat=page.getByRole("button",{name:"주간 반복",exact:true});await expect(repeat).toBeEnabled();
  await page.getByRole("button",{name:"다음 주",exact:true}).click();await repeat.click();
  await expect(page.getByRole("dialog",{name:"주간 반복",exact:true})).toContainText("이번 주에 선택한 시간이 없어요");
  await expect(page.getByRole("dialog").getByRole("button",{name:"적용",exact:true})).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"이전 주",exact:true}).click();await expect(repeat).toBeEnabled();
  await db.promiseRecord.update({where:{id:f.promise.id},data:{dateRangeEnd:new Date(f.start)}});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("status")).toContainText("약속 설정이 변경");
  await source.click();await repeat.click();
  const dialog=page.getByRole("dialog",{name:"주간 반복",exact:true});
  await expect(dialog).toContainText("반복할 다른 주가 없어요");
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(dialog.getByRole("button",{name:"전체 선택",exact:true})).toHaveCount(0);
  await expect(dialog.getByRole("button",{name:"적용",exact:true})).toBeDisabled();
});

test("제출 완료 표시는 변경 전까지 유지하고 수정·선택 해제·실패·재제출 상태를 구분한다",async({page,context})=>{
  const f=await fixture(context);await page.setViewportSize({width:393,height:852});await page.goto(f.path);
  const submit=page.getByRole("button",{name:"선택 제출",exact:true}),complete=page.getByRole("button",{name:"제출 완료",exact:true});
  // 처음에는 선택이 없어도 '가능한 시간 없음'을 제출할 수 있다.
  await expect(submit).toBeEnabled();await submit.click();
  await expect(page.getByRole("status")).toContainText("가능한 시간 없음으로 제출했어요");
  await expect(complete).toBeDisabled();
  await page.getByRole("button",{name:"다음 주",exact:true}).click();await expect(complete).toBeDisabled();
  await page.getByRole("button",{name:"이전 주",exact:true}).click();
  await page.getByRole("button",{name:"30분",exact:true}).click();await expect(complete).toBeDisabled();
  const cell=page.getByRole("button",{name:`${f.start} 09:00`,exact:true});
  await cell.click();await expect(submit).toBeEnabled();
  await cell.click();await expect(complete).toBeDisabled();
  await cell.click();await expect(submit).toBeEnabled();
  await submit.click();await expect(complete).toBeDisabled();
  await page.reload();await expect(complete).toBeDisabled();
  await page.screenshot({path:"test-results/availability-submitted-393.png",fullPage:true});
  await page.getByRole("button",{name:"30분",exact:true}).click();await cell.click();
  await page.route(`**${f.path}`,route=>route.request().method()==="POST"?route.abort():route.continue());
  await submit.click();await expect(page.getByRole("status")).toContainText("제출하지 못했어요");
  await expect(submit).toBeEnabled();await expect(complete).toHaveCount(0);
  await page.unroute(`**${f.path}`);await submit.click();await expect(complete).toBeDisabled();
  // 재조율 등으로 응답이 무효화되면 선택이 같아도 다시 제출할 수 있어야 한다.
  await db.participant.update({where:{id:f.member.id},data:{availabilitySubmittedAt:null,availabilityVersion:{increment:1}}});
  await page.evaluate(()=>document.dispatchEvent(new Event("visibilitychange")));
  await expect(submit).toBeEnabled({timeout:12000});
});

test("모바일에서 상단 정보를 접어도 긴 시간표의 정보·날짜·제출은 접근 가능하다",async({page,context})=>{
  const f=await fixture(context);await db.promiseRecord.update({where:{id:f.promise.id},data:{dailyEndMinute:1440}});
  await page.setViewportSize({width:393,height:852});await page.goto(f.path);
  const grid=page.getByLabel("주별 가능 시간",{exact:true});
  await page.evaluate(()=>document.fonts.ready);
  expect((await grid.boundingBox())!.height).toBeGreaterThan(500);
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await expect(page.getByRole("link",{name:"약속 잡기",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"약속 정보 열기",exact:true})).toBeInViewport();
  await expect(page.getByRole("button",{name:"선택 제출",exact:true})).toBeInViewport();
  await expect(page.locator("[data-day-heading]").first()).toBeInViewport();
  expect(await grid.evaluate(el=>el.scrollHeight<=el.clientHeight)).toBe(true);
  const cell=page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true});
  await cell.click();await expect(cell).toHaveAttribute("aria-pressed","true");
  await page.screenshot({path:"test-results/availability-tall-393.png",fullPage:false});
});

for(const width of [393,1280]){
  test(`시간표 가운데와 바깥에서 휠을 굴려도 페이지 하나만 스크롤된다 (${width}px)`,async({page,context})=>{
    const f=await fixture(context);await db.promiseRecord.update({where:{id:f.promise.id},data:{dailyEndMinute:1440}});
    await page.setViewportSize({width,height:852});await page.goto(f.path);
    const grid=page.getByLabel("주별 가능 시간",{exact:true});
    await page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true}).hover();
    await page.mouse.wheel(0,240);
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(150);
    expect(await grid.evaluate(el=>el.scrollTop)).toBe(0);
    expect(await grid.evaluate(el=>el.scrollHeight<=el.clientHeight)).toBe(true);
    const scrolled=await page.evaluate(()=>window.scrollY);
    await page.mouse.move(4,500);await page.mouse.wheel(0,200);
    const maxScroll=await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight);
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThanOrEqual(Math.min(scrolled+100,maxScroll)-1);
    await expect(page.getByRole("button",{name:"다음 주",exact:true})).toBeInViewport();
    await expect(page.getByRole("button",{name:width<900?"약속 정보 열기":"응답 마감",exact:true})).toBeInViewport();
    await expect(page.getByRole("button",{name:"선택 제출",exact:true})).toBeInViewport();
    // 날짜 헤더는 새 배치에서도 스크롤 중 화면에 남아 있어야 한다.
    await expect(page.locator("[data-day-heading]").first()).toBeInViewport();
    await page.screenshot({path:`test-results/availability-page-scroll-${width}.png`});
  });
}

for (const role of ["host", "member"] as const) {
  test(`${role} 시간 입력에 남은 마감 시간을 표시하고 스크롤해도 유지한다`, async ({ page, context }) => {
    const f = await fixture(context);
    await db.participant.update({ where: { id: f.member.id }, data: { role } });
    await db.promiseRecord.update({ where: { id: f.promise.id }, data: { votingDeadlineAt: new Date(Date.now() + (2 * 24 + 3.5) * 3600000) } });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(f.path);
    const timer = page.getByRole("timer", { name: "응답 마감까지 남은 시간" });
    await expect(timer).toContainText("2일 3시간");
    const besideSubmit=async()=>{
      const box=(await timer.boundingBox())!;
      const submit=(await page.getByRole("button",{name:"선택 제출",exact:true}).boundingBox())!;
      expect(box.x+box.width).toBeLessThanOrEqual(submit.x);
      expect(Math.abs((box.y+box.height/2)-(submit.y+submit.height/2))).toBeLessThan(50);
      await expect(timer).toBeInViewport();
      if(role==="host"){
        const close=page.getByRole("button",{name:"응답 마감",exact:true});
        await expect(close).toBeInViewport();
        const tabs=(await page.getByRole("group",{name:"시간 보기",exact:true}).boundingBox())!;
        const action=(await close.boundingBox())!;
        expect(action.x).toBeGreaterThanOrEqual(tabs.x+tabs.width);
        expect(Math.abs(action.y+action.height/2-(tabs.y+tabs.height/2))).toBeLessThan(1);
      }else await expect(page.getByRole("button",{name:"응답 마감",exact:true})).toHaveCount(0);
    };
    for(const width of [320,393,1280]){
      await page.setViewportSize({width,height:740});await page.evaluate(()=>document.fonts.ready);await besideSubmit();
    }
    await page.setViewportSize({width:320,height:740});
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect(timer).toBeInViewport();
    await besideSubmit();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/deadline-remaining-${role}-320.png` });
    await page.setViewportSize({ width: 393, height: 852 });
    await page.screenshot({ path: `test-results/deadline-remaining-${role}-393.png` });
    // 조기 마감 후 읽기 전용 시간표는 미래 기한이 남아도 마감으로 표시한다.
    await db.promiseRecord.update({ where: { id: f.promise.id }, data: { status: "closed" } });
    await page.goto(`${f.path}?view=responses`);
    await expect(timer).toHaveText("응답 마감");
    for(const width of [320,393,1280]){
      await page.setViewportSize({width,height:740});
      await expect(timer).toBeInViewport();
      await expect(page.getByRole("link",{name:"후보 보기",exact:true})).toBeInViewport();
    }
  });
}

test("조회 실패 중에도 남은 마감 시간이 흐르고 새 마감을 받으면 갱신한다", async ({ page, context }) => {
  const f = await fixture(context);
  await db.promiseRecord.update({ where: { id: f.promise.id }, data: { votingDeadlineAt: new Date(Date.now() + 90000) } });
  await page.clock.install();
  await page.route("**/availability/state", route => route.abort());
  await page.goto(f.path);
  // SSR 문구만 보이는 시점이 아니라 클라이언트 입력이 연결된 뒤 시간을 진행한다.
  await page.getByRole("button", { name: "30분", exact: true }).click();
  await expect(page.getByRole("button", { name: "30분", exact: true })).toHaveAttribute("aria-pressed", "true");
  const timer = page.getByRole("timer", { name: "응답 마감까지 남은 시간" });
  await expect(timer).toContainText("1분");
  await page.clock.fastForward(40000);
  await expect(timer).toContainText("1분 미만");
  await page.clock.fastForward(60000);
  await expect(timer).toHaveText("응답 마감");
  await db.promiseRecord.update({ where: { id: f.promise.id }, data: { votingDeadlineAt: new Date(Date.now() + 3 * 86400000 + 3600000) } });
  await page.unroute("**/availability/state");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(timer).toContainText("3일");
});
