import { test, expect, type BrowserContext } from "@playwright/test";
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
  const undo=page.getByRole("button",{name:"되돌리기",exact:true}),redo=page.getByRole("button",{name:"복구하기",exact:true});
  await undo.click();await expect(redo).toBeEnabled();
  await db.$transaction(async tx=>{
    await tx.participantAvailableSlot.create({data:{participantId:f.member.id,slotStartAt:new Date(f.slot("09:30"))}});
    await tx.participant.update({where:{id:f.member.id},data:{availabilityVersion:1,availabilitySubmittedAt:new Date()}});
  });
  await expect(page.getByRole("status")).toContainText("다른 기기",{timeout:12000});
  await expect(first).toHaveAttribute("aria-pressed","false");await expect(second).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:"되돌리기",exact:true})).toBeDisabled();
  await expect(redo).toBeDisabled();
  await first.click();
  await undo.click();await expect(redo).toBeEnabled();
  await page.locator("footer").getByRole("button",{name:"초기화",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"선택한 시간을 초기화할까요?",exact:true});await expect(dialog).toBeVisible();
  await db.promiseRecord.update({where:{id:f.promise.id},data:{durationMinutes:150}});
  await expect(page.getByRole("status")).toContainText("약속 설정이 변경",{timeout:12000});
  await expect(redo).toBeDisabled();await expect(dialog).not.toBeVisible();
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
    const cell=page.getByRole("button",{name:`${f.start} 09:00`,exact:true});
    await cell.tap();await expect(cell).toHaveAttribute("aria-pressed","true");
    await cell.tap();await expect(cell).toHaveAttribute("aria-pressed","false");
    await cell.tap();await page.getByRole("button",{name:"선택 제출",exact:true}).tap();
    await expect(page.getByRole("status")).toContainText("제출했어요");
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
  await expect(page.getByRole("button",{name:"선택 제출",exact:true})).toBeDisabled({timeout:12000});
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
test("모바일 손가락 드래그로 연속 시간을 선택·해제하고 가장자리에서 스크롤한다",async({browser})=>{
  const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  try {
    const f=await fixture(context),page=await context.newPage();await page.goto(`http://127.0.0.1:3100${f.path}`);await page.getByRole("button",{name:"30분",exact:true}).click();
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
    const axisX=box.x+18,axisY=box.y+box.height-60;
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:axisX,y:axisY}]});
    for(let i=1;i<=6;i++)await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:axisX,y:axisY-i*24}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect.poll(()=>grid.evaluate(el=>el.scrollTop)).toBeGreaterThan(30);
    await expect(grid.locator('button[aria-pressed="true"]')).toHaveCount(0);
    await grid.evaluate(el=>{el.scrollTop=0;});
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:box.y+box.height-8}]});
    await expect.poll(()=>grid.evaluate(el=>el.scrollTop)).toBeGreaterThan(30);
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await page.getByRole("button",{name:"선택 제출",exact:true}).tap();
    await expect(page.getByRole("status")).toContainText("제출했어요");
  } finally {await context.close();}
});
test("모바일 사이드바를 닫으면 선택을 유지하며 PC에서는 정보를 펼쳐 둔다",async({page,context})=>{
  const f=await fixture(context);await page.setViewportSize({width:393,height:852});await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  const first=page.getByRole("button",{name:`${f.start} 09:00`,exact:true});await first.click();
  const menu=page.getByRole("button",{name:"약속 정보 열기",exact:true});
  await menu.click();const dialog=page.getByRole("dialog",{name:"약속 정보",exact:true});
  await expect(dialog).toBeVisible();await expect(dialog.getByRole("button",{name:"테스트친구",exact:true})).toBeVisible();
  await page.screenshot({path:"test-results/availability-sidebar-393.png",fullPage:true});
  await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(menu).toBeFocused();
  await menu.click();
  await dialog.getByRole("button",{name:"약속 정보 닫기",exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(first).toHaveAttribute("aria-pressed","true");
  await page.setViewportSize({width:1280,height:800});
  await expect(menu).not.toBeVisible();await expect(page.getByRole("complementary",{name:"약속 정보",exact:true})).toBeVisible();
  await page.screenshot({path:"test-results/availability-sidebar-1280.png",fullPage:true});
});
test("편집 화살표는 비활성 상태에도 마우스 설명을 보여주고 키보드로 닫는다",async({page,context})=>{
  const f=await fixture(context);await page.setViewportSize({width:1280,height:800});await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  const undo=page.getByRole("button",{name:"되돌리기",exact:true});
  await expect(undo).toBeDisabled();await undo.hover();
  await expect(page.getByRole("tooltip")).toHaveText("마지막 변경 되돌리기");
  await page.getByRole("heading",{name:"가능 시간 입력"}).hover();
  await expect(page.getByRole("tooltip")).not.toBeVisible();
  const redo=page.getByRole("button",{name:"복구하기",exact:true});
  await redo.hover();await expect(page.getByRole("tooltip")).toHaveText("되돌린 변경 복구하기");
  await page.getByRole("button",{name:`${f.start} 09:00`,exact:true}).click();
  await undo.focus();await expect(page.getByRole("tooltip")).toHaveText("마지막 변경 되돌리기");
  await page.keyboard.press("Escape");await expect(page.getByRole("tooltip")).not.toBeVisible();
  await page.setViewportSize({width:393,height:852});
  await expect(undo).toBeVisible();await expect(redo).toBeVisible();
});
test("되돌린 드래그를 복구하고 새 선택과 제출 후에는 복구 이력을 비운다",async({page,context})=>{
  const f=await fixture(context);await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  const cell=(time:string)=>page.getByRole("button",{name:`${f.start} ${time}`,exact:true});
  const undo=page.getByRole("button",{name:"되돌리기",exact:true});
  const redo=page.getByRole("button",{name:"복구하기",exact:true});
  await expect(redo).toBeDisabled();
  await cell("09:00").hover();await page.mouse.down();await cell("10:00").hover();await page.mouse.up();
  await undo.click();await redo.click();
  for(const time of ["09:00","09:30","10:00"])await expect(cell(time)).toHaveAttribute("aria-pressed","true");
  await expect(redo).toBeDisabled();
  await undo.click();await cell("11:00").click();await expect(redo).toBeDisabled();
  await expect(cell("09:00")).toHaveAttribute("aria-pressed","false");
  await undo.click();await expect(redo).toBeEnabled();
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("가능한 시간 없음");await expect(redo).toBeDisabled();
});
test("드래그 한 번을 통째로 되돌리고 제출 뒤에는 이전 기록을 복원하지 않는다",async({page,context})=>{
  const f=await fixture(context);await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  const cell=(time:string)=>page.getByRole("button",{name:`${f.start} ${time}`,exact:true});
  await cell("09:00").hover();await page.mouse.down();await cell("10:00").hover();await page.mouse.up();
  const undo=page.getByRole("button",{name:"되돌리기",exact:true});
  await undo.click();
  for(const time of ["09:00","09:30","10:00"])await expect(cell(time)).toHaveAttribute("aria-pressed","false");
  await expect(undo).toBeDisabled();
  await cell("09:00").focus();await page.keyboard.press("Space");await undo.click();
  await expect(cell("09:00")).toHaveAttribute("aria-pressed","false");
  await cell("09:30").click();await page.getByRole("button",{name:"선택 제출",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("제출했어요");await expect(undo).toBeDisabled();
});
test("이번 주 초기화는 다른 주를 보존하고 되돌릴 수 있다",async({page,context})=>{
  const f=await fixture(context);await page.setViewportSize({width:393,height:852});await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  const first=page.getByRole("button",{name:`${f.start} 09:00`,exact:true});await first.click();
  await page.getByRole("button",{name:"다음 주",exact:true}).click();
  const nextDay=new Date(new Date(f.start).getTime()+7*86400000).toISOString().slice(0,10);
  const second=page.getByRole("button",{name:`${nextDay} 09:00`,exact:true});await second.click();
  const clear=page.locator("footer").getByRole("button",{name:"초기화",exact:true});await expect(clear).toBeVisible();await clear.click();
  const dialog=page.getByRole("dialog",{name:"선택한 시간을 초기화할까요?",exact:true});
  await expect(dialog).toBeVisible();await expect(second).toHaveAttribute("aria-pressed","true");
  await page.screenshot({path:"test-results/availability-clear-dialog.png",fullPage:true});
  await dialog.getByRole("button",{name:"취소",exact:true}).click();await expect(dialog).not.toBeVisible();await expect(clear).toBeFocused();
  await expect(second).toHaveAttribute("aria-pressed","true");
  await clear.click();await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();
  await clear.click();await dialog.getByRole("button",{name:"이번 주 초기화",exact:true}).click();await expect(dialog).not.toBeVisible();
  await expect(second).toHaveAttribute("aria-pressed","false");
  await page.getByRole("button",{name:"이전 주",exact:true}).click();await expect(first).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"되돌리기",exact:true}).click();
  await page.getByRole("button",{name:"다음 주",exact:true}).click();await expect(second).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"복구하기",exact:true}).click();await expect(second).toHaveAttribute("aria-pressed","false");
  await page.getByRole("button",{name:"이전 주",exact:true}).click();await expect(first).toHaveAttribute("aria-pressed","true");
});
test("빈 주에서도 전체 초기화하고 모든 주를 되돌리거나 복구하며 제출 전 저장을 유지한다",async({page,context})=>{
  const f=await fixture(context);
  const secondDay=new Date(new Date(f.start).getTime()+7*86400000).toISOString().slice(0,10);
  await db.participantAvailableSlot.createMany({data:[f.slot("09:00"),f.slot("09:00",secondDay)].map(slot=>({participantId:f.member.id,slotStartAt:new Date(slot)}))});
  await page.setViewportSize({width:320,height:852});await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();
  await page.getByRole("button",{name:"다음 주",exact:true}).click();await page.getByRole("button",{name:"다음 주",exact:true}).click();
  const reset=page.locator("footer").getByRole("button",{name:/초기화$/});await expect(reset).toBeEnabled();await reset.click();
  const dialog=page.getByRole("dialog",{name:"선택한 시간을 초기화할까요?",exact:true});
  await expect(dialog.getByRole("button",{name:"이번 주 초기화",exact:true})).toBeDisabled();
  await page.screenshot({path:"test-results/availability-clear-all-320.png",fullPage:true});
  await dialog.getByRole("button",{name:"전체 초기화",exact:true}).click();await expect(reset).toBeDisabled();
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(2);
  await page.getByRole("button",{name:"되돌리기",exact:true}).click();
  await page.getByRole("button",{name:"이전 주",exact:true}).click();
  await expect(page.getByRole("button",{name:`${secondDay} 09:00`,exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"이전 주",exact:true}).click();
  await expect(page.getByRole("button",{name:`${f.start} 09:00`,exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"복구하기",exact:true}).click();await expect(reset).toBeDisabled();
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();await expect(page.getByRole("status")).toContainText("가능한 시간 없음");
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(0);
});
test("전체 초기화 후 제출해도 이미 지난 선택은 보존한다",async({page,context})=>{
  const f=await fixture(context);
  const pastDay=new Date(Date.now()+9*3600000-86400000).toISOString().slice(0,10),pastSlot=f.slot("09:00",pastDay);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{dateRangeStart:new Date(pastDay)}});
  await db.participantAvailableSlot.createMany({data:[pastSlot,f.slot("09:00")].map(slot=>({participantId:f.member.id,slotStartAt:new Date(slot)}))});
  await page.goto(f.path);await page.getByRole("button",{name:"30분",exact:true}).click();await page.locator("footer").getByRole("button",{name:/초기화$/}).click();
  await page.getByRole("dialog").getByRole("button",{name:"전체 초기화",exact:true}).click();
  await expect(page.locator("footer").getByRole("button",{name:/초기화$/})).toBeDisabled();
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();await expect(page.getByRole("status")).toContainText("제출했어요");
  expect((await db.participantAvailableSlot.findMany({where:{participantId:f.member.id}})).map(row=>row.slotStartAt.toISOString())).toEqual([pastSlot]);
});
test("축소해도 부분 선택을 보존하고 2시간 묶음·마지막 짧은 칸을 30분 슬롯으로 제출한다",async({page,context})=>{
  const f=await fixture(context);await db.promiseRecord.update({where:{id:f.promise.id},data:{dailyEndMinute:1440}});
  await page.setViewportSize({width:393,height:852});await page.goto(f.path);
  await expect(page.getByRole("button",{name:"1시간",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true})).toBeVisible();
  await page.screenshot({path:"test-results/availability-default-hour.png",fullPage:true});
  await page.getByRole("button",{name:"30분",exact:true}).click();
  await page.getByRole("button",{name:`${f.start} 09:00`,exact:true}).click();
  const hourly=page.getByRole("button",{name:"1시간",exact:true});await expect(hourly).toBeVisible();await hourly.click();
  await expect(page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true})).toHaveAttribute("aria-pressed","mixed");
  await page.getByRole("button",{name:"2시간",exact:true}).click();
  const group=page.getByRole("button",{name:`${f.start} 09:00–11:00`,exact:true});await expect(group).toHaveAttribute("aria-pressed","mixed");
  await page.getByRole("button",{name:"30분",exact:true}).click();
  await expect(page.getByRole("button",{name:`${f.start} 09:00`,exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:`${f.start} 09:30`,exact:true})).toHaveAttribute("aria-pressed","false");
  await page.getByRole("button",{name:"2시간",exact:true}).click();await group.focus();await page.keyboard.press("Space");
  await expect(group).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"되돌리기",exact:true}).click();await expect(group).toHaveAttribute("aria-pressed","mixed");
  await group.click();await page.getByRole("button",{name:`${f.start} 23:00–24:00`,exact:true}).click();
  for(const width of [320,393,1280]){await page.setViewportSize({width,height:width===1280?800:852});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/availability-zoom-${width}.png`,fullPage:true});}
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();await expect(page.getByRole("status")).toContainText("제출했어요");
  expect((await db.participantAvailableSlot.findMany({where:{participantId:f.member.id},orderBy:{slotStartAt:"asc"}})).map(row=>row.slotStartAt.toISOString())).toEqual(["09:00","09:30","10:00","10:30","23:00","23:30"].map(time=>f.slot(time)));
});

test("이번 주 반복은 미제출 시간을 복사하고 한 번에 되돌리며 명시적으로 제출한다",async({page,context})=>{
  const f=await fixture(context);
  await page.setViewportSize({width:393,height:852});
  await page.goto(f.path);
  const repeat=page.getByRole("button",{name:"이번 주 반복",exact:true});
  await expect(repeat).toBeDisabled();
  await page.getByRole("button",{name:"30분",exact:true}).click();
  await page.getByRole("button",{name:`${f.start} 09:30`,exact:true}).click();
  await page.getByRole("button",{name:`${f.start} 11:00`,exact:true}).click();
  await page.getByRole("button",{name:"1시간",exact:true}).click();
  await repeat.click();
  const dialog=page.getByRole("dialog",{name:"이번 주 반복",exact:true});
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
  await page.getByRole("button",{name:"되돌리기",exact:true}).click();
  await expect(target).toHaveAttribute("aria-pressed","false");
  await page.getByRole("button",{name:"복구하기",exact:true}).click();
  await expect(target).toHaveAttribute("aria-pressed","mixed");
  await repeat.click();
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(apply).toBeDisabled();await expect(dialog).toContainText("이미 선택된 시간이거나 추가할 미래 시간이 없어요");
  await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(repeat).toBeFocused();
  await page.getByRole("button",{name:"되돌리기",exact:true}).click();
  await expect(target).toHaveAttribute("aria-pressed","false");
  await page.getByRole("button",{name:"복구하기",exact:true}).click();
  await page.getByRole("button",{name:"선택 제출",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("제출했어요");
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(6);
  await page.reload();await page.getByRole("button",{name:"다음 주",exact:true}).click();
  await expect(target).toHaveAttribute("aria-pressed","mixed");
});

test("이번 주 반복 창은 서버 응답·설정 변경과 마감 때 닫혀 오래된 입력을 적용하지 않는다",async({page,context})=>{
  const f=await fixture(context);await page.goto(f.path);
  await page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true}).click();
  const repeat=page.getByRole("button",{name:"이번 주 반복",exact:true});
  const dialog=page.getByRole("dialog",{name:"이번 주 반복",exact:true});
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
  await expect(page.getByRole("status")).toContainText("응답이 마감");await expect(dialog).not.toBeVisible();
  await expect(repeat).toBeDisabled();
});

test("이번 주 반복은 모바일에서 보고 있는 주를 기준으로 삼고 취소하면 선택을 보존한다",async({browser})=>{
  const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  try {
    const f=await fixture(context),page=await context.newPage();
    const second=new Date(new Date(`${f.start}T00:00:00Z`).getTime()+7*86400000).toISOString().slice(0,10);
    await db.participantAvailableSlot.createMany({data:[{participantId:f.member.id,slotStartAt:new Date(f.slot("09:30"))},{participantId:f.member.id,slotStartAt:new Date(f.slot("13:30",second))}]});
    await db.participant.update({where:{id:f.member.id},data:{availabilityVersion:1,availabilitySubmittedAt:new Date()}});
    await page.goto(`http://127.0.0.1:3100${f.path}`);
    await page.getByRole("button",{name:"다음 주",exact:true}).tap();
    const repeat=page.getByRole("button",{name:"이번 주 반복",exact:true});await repeat.tap();
    const dialog=page.getByRole("dialog",{name:"이번 주 반복",exact:true});
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    await dialog.locator("summary").tap();
    await expect(dialog).toContainText("13:30 ~ 14:00");await expect(dialog).not.toContainText("09:30 ~ 10:00");
    await dialog.getByRole("radio",{name:"직접 선택",exact:true}).tap();
    await dialog.getByRole("checkbox").first().tap();
    await expect(dialog.getByRole("checkbox").first()).toBeChecked();
    await dialog.getByRole("radio",{name:"전체 선택",exact:true}).tap();
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    await dialog.getByRole("button",{name:"취소",exact:true}).tap();await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button",{name:"되돌리기",exact:true})).toBeDisabled();
    expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(2);
    await repeat.tap();await expect(dialog).toContainText("13:30 ~ 14:00");
    await expect(dialog.getByRole("radio",{name:"전체 선택",exact:true})).toBeChecked();
    await expect(dialog.getByRole("button",{name:"적용",exact:true})).toBeEnabled();
    await dialog.getByRole("button",{name:"이번 주 반복 닫기",exact:true}).tap();
    await expect(page.getByRole("button",{name:`${second} 13:00–14:00`,exact:true})).toHaveAttribute("aria-pressed","mixed");
  } finally {await context.close();}
});

test("이번 주 반복은 빈 주를 기준으로 삼지 않고 대상 주가 없으면 안내한다",async({page,context})=>{
  const f=await fixture(context);await page.goto(f.path);
  const source=page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true});await source.click();
  const repeat=page.getByRole("button",{name:"이번 주 반복",exact:true});await expect(repeat).toBeEnabled();
  await page.getByRole("button",{name:"다음 주",exact:true}).click();await expect(repeat).toBeDisabled();
  await page.getByRole("button",{name:"이전 주",exact:true}).click();await expect(repeat).toBeEnabled();
  await db.promiseRecord.update({where:{id:f.promise.id},data:{dateRangeEnd:new Date(f.start)}});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("status")).toContainText("약속 설정이 변경");
  await source.click();await repeat.click();
  const dialog=page.getByRole("dialog",{name:"이번 주 반복",exact:true});
  await expect(dialog).toContainText("반복할 다른 주가 없어요");
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(dialog.getByRole("button",{name:"전체 선택",exact:true})).toHaveCount(0);
  await expect(dialog.getByRole("button",{name:"적용",exact:true})).toBeDisabled();
});
