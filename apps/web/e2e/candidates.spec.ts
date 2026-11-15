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
test("방장과 참여자가 별도 브라우저에서 함께 제출해도 시간 정보와 집계를 불러온다",async({page,context,browser})=>{
  const f=await fixture(context);
  const friend=await db.participant.create({data:{promiseId:f.promise.id,nickname:"함께제출",normalizedNickname:"함께제출",role:"member",passwordHash:"unused"}});
  const sessionToken=newToken(),expiresAt=new Date(Date.now()+7*86400000);
  await db.participantSession.create({data:{participantId:friend.id,sessionTokenHash:tokenHash(sessionToken),expiresAt}});
  const friendContext=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
  try {
    const cookie=sessionCookie(f.link.inviteToken,expiresAt);
    await friendContext.addCookies([{name:cookie.name,value:sessionToken,domain:"127.0.0.1",path:cookie.path,httpOnly:true,sameSite:"Lax",expires:expiresAt.getTime()/1000}]);
    const friendPage=await friendContext.newPage();
    const failed:number[]=[], polls=[0,0];
    const pages=[page,friendPage];
    for(const [index,p] of pages.entries())p.on("response",response=>{
      const path=new URL(response.url()).pathname;
      if(path.endsWith("/overview") || path.endsWith("/availability/state")){
        if(response.status()!==200)failed.push(response.status());
        if(path.endsWith("/availability/state")&&response.status()===200)polls[index]++;
      }
    });
    await Promise.all(pages.map(p=>p.goto(`http://127.0.0.1:3100${f.path}`)));
    for(const p of pages){
      await p.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true}).click();
      await p.getByRole("button",{name:`${f.start} 10:00–11:00`,exact:true}).click();
    }
    await Promise.all(pages.map(p=>p.getByRole("button",{name:"선택 제출",exact:true}).click()));
    for(const p of pages){
      await expect(p.getByRole("button",{name:"제출 완료"})).toBeDisabled();
      await p.getByRole("button",{name:"전체 시간",exact:true}).click();
      await expect(p.getByLabel(`${f.start} 09:00 가능 2명 / 전체 2명`,{exact:true})).toBeVisible();
      await expect(p.getByText("시간 정보를 불러오지 못했어요.",{exact:false})).toHaveCount(0);
    }
    await expect.poll(()=>polls.every(count=>count>=2),{timeout:15000}).toBe(true);
    expect(failed).toEqual([]);
    await Promise.all(pages.map(p=>p.reload()));
    for(const p of pages)await expect(p.getByRole("button",{name:"제출 완료"})).toBeDisabled();
    expect(await db.participantAvailableSlot.count({where:{participant:{promiseId:f.promise.id}}})).toBe(8);
  } finally {await friendContext.close();}
});
test("전체 시간과 참여자 시간을 비교해도 내 미제출 선택과 현재 주를 보존한다",async({page,context,request})=>{
  const f=await fixture(context);
  const friend=await db.participant.create({data:{promiseId:f.promise.id,nickname:"친구하나",normalizedNickname:"친구하나",role:"member",passwordHash:"hidden",availabilitySubmittedAt:new Date()}});
  await db.participantAvailableSlot.create({data:{participantId:friend.id,slotStartAt:new Date(f.slot("09:30"))}});
  await page.setViewportSize({width:393,height:852});await page.goto(f.path);
  const own=page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true});await own.click();
  await page.getByRole("button",{name:"전체 시간",exact:true}).click();
  await expect(page.getByText("임시 집계 · 전체 2명",{exact:true})).toBeVisible();
  await expect(page.getByLabel(`${f.start} 09:30 가능 1명 / 전체 2명`,{exact:true})).toBeVisible();
  await expect(page.getByLabel(`${f.start} 09:00 가능 0명 / 전체 2명`,{exact:true})).toBeVisible();
  await expect(page.getByLabel(`${f.start} 09:00 가능 0명 / 전체 2명`,{exact:true})).toHaveText("");
  await expect(page.getByLabel(`${f.start} 09:30 가능 1명 / 전체 2명`,{exact:true})).toHaveText("");
  for(const name of ["30분","2시간","1시간"]){
    await page.getByRole("button",{name,exact:true}).click();
    await expect(page.getByLabel(`${f.start} 09:00 가능 0명 / 전체 2명`,{exact:true})).toHaveText("");
    await expect(page.getByLabel(`${f.start} 09:30 가능 1명 / 전체 2명`,{exact:true})).toHaveText("");
  }
  await page.screenshot({path:"test-results/heatmap-empty-393.png",fullPage:true});
  await page.getByRole("button",{name:"약속 정보 열기",exact:true}).click();
  await page.getByRole("dialog",{name:"약속 정보",exact:true}).getByRole("button",{name:"친구하나",exact:true}).click();
  await expect(page.getByText("친구하나 · 읽기 전용",{exact:true})).toBeVisible();
  await expect(page.getByLabel(`${f.start} 09:30 가능`,{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"내 시간",exact:true}).click();
  await expect(own).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:"되돌리기",exact:true})).toBeEnabled();
  expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(0);
  const url=`/p/${f.link.inviteToken}/overview`;
  expect((await request.get(url)).status()).toBe(401);
  const response=await page.request.get(url);expect(response.status()).toBe(200);expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(JSON.stringify(await response.json())).not.toMatch(/submitted|passwordHash|sessionToken|availabilityVersion/);
});
test("방장이 확인 후 마감하면 전체 기간 후보 5개와 더 보기를 제공한다",async({page,context})=>{
  const f=await fixture(context);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{durationMinutes:30}});
  const friend=await db.participant.create({data:{promiseId:f.promise.id,nickname:"친구둘",normalizedNickname:"친구둘",role:"member",passwordHash:"unused",availabilitySubmittedAt:new Date()}});
  const nextWeek=new Date(new Date(f.start).getTime()+7*86400000).toISOString().slice(0,10);
  const times=["09:00","09:30","10:00","10:30","11:00","11:30"];
  for(const member of [f.member,friend]){
    await db.participant.update({where:{id:member.id},data:{availabilitySubmittedAt:new Date()}});
    await db.participantAvailableSlot.createMany({data:times.map(time=>({participantId:member.id,slotStartAt:new Date(f.slot(time,nextWeek))}))});
  }
  await page.setViewportSize({width:393,height:700});await page.goto(f.path);
  const closeButton=page.getByRole("button",{name:"응답 마감",exact:true});
  const infoButton=page.getByRole("button",{name:"약속 정보 열기",exact:true});
  await expect(closeButton).toBeInViewport();
  await expect(infoButton).toBeInViewport();
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await expect(infoButton).toBeInViewport();
  expect((await infoButton.boundingBox())!.y).toBeLessThan(100);
  for(const width of [320,393,1280]){await page.setViewportSize({width,height:700});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/close-header-${width}.png`,fullPage:true});}
  await expect(closeButton).toBeInViewport();
  await expect(page.getByRole("heading",{name:"가능한 약속 시간",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"응답 마감",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"응답을 마감할까요?",exact:true});await expect(dialog).toBeVisible();
  await page.screenshot({path:"test-results/close-confirm-1280.png",fullPage:true});
  await page.setViewportSize({width:393,height:852});
  await page.screenshot({path:"test-results/close-confirm-393.png",fullPage:true});
  await dialog.getByRole("button",{name:"취소",exact:true}).click();
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("collecting");
  await page.getByRole("button",{name:"응답 마감",exact:true}).click();
  await dialog.getByRole("button",{name:"마감하기",exact:true}).click();
  await expect(page.getByRole("heading",{name:"가능한 약속 시간",exact:true})).toBeVisible();
  await expect(page).toHaveURL(`/p/${f.link.inviteToken}/candidates`);
  await expect(page.getByLabel("주별 가능 시간",{exact:true})).toHaveCount(0);
  const candidates=page.getByRole("list",{name:"시간 후보",exact:true});await expect(candidates.getByRole("listitem")).toHaveCount(5);
  await page.getByRole("button",{name:"후보 더 보기",exact:true}).click();
  await expect(candidates.getByRole("listitem")).toHaveCount(6);
  await expect(page.getByRole("button",{name:"후보 더 보기",exact:true})).toHaveCount(0);
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("closed");
  for(const width of [320,393,1280]){
    await page.setViewportSize({width,height:852});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/candidates-${width}.png`,fullPage:true});
  }
});
test("연결 실패·재시도와 후보 없음 상태를 표시하고 GET은 자동 마감 쓰기를 하지 않는다",async({page,context})=>{
  const f=await fixture(context);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{votingDeadlineAt:new Date(Date.now()-1000)}});
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  await page.route(`**/p/${f.link.inviteToken}/overview?*`,async route=>{await gate;await route.abort();});
  await page.goto(f.path);
  await expect(page.getByText("시간 정보 불러오는 중…",{exact:true})).toBeVisible();
  release();await expect(page.getByText("시간 정보를 불러오지 못했어요.",{exact:false})).toBeVisible();
  await expect(page.getByText("함께 가능한 시간이 없어요.",{exact:true})).toHaveCount(0);
  await page.unroute(`**/p/${f.link.inviteToken}/overview?*`);
  await page.getByRole("button",{name:"다시 불러오기",exact:true}).click();
  await expect(page.getByText("함께 가능한 시간이 없어요.",{exact:true})).toBeVisible();
  await expect(page).toHaveURL(`/p/${f.link.inviteToken}/candidates`);
  await expect(page.getByLabel("주별 가능 시간",{exact:true})).toHaveCount(0);
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("collecting");
});
test("주와 보기 전환은 스크롤·내 입력을 유지하고 늦은 이전 주 조회를 무시한다",async({page,context})=>{
  const f=await fixture(context);await page.setViewportSize({width:393,height:700});
  await db.promiseRecord.update({where:{id:f.promise.id},data:{dailyEndMinute:1440}});
  const friend=await db.participant.create({data:{promiseId:f.promise.id,nickname:"비교친구",normalizedNickname:"비교친구",role:"member",passwordHash:"unused",availabilitySubmittedAt:new Date()}});
  await db.participantAvailableSlot.create({data:{participantId:friend.id,slotStartAt:new Date(f.slot("09:00"))}});
  await page.goto(f.path);await page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true}).click();
  await page.evaluate(()=>window.scrollTo(0,150));
  const top=await page.evaluate(()=>window.scrollY);
  await page.getByRole("button",{name:"전체 시간",exact:true}).click();
  await expect(page.getByText("임시 집계 · 전체 2명",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>window.scrollY)).toBe(top);
  let release!:()=>void,received!:()=>void;const gate=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{received=r;});
  await page.route(`**/p/${f.link.inviteToken}/overview?*`,async route=>{const response=await route.fetch();received();await gate;await route.fulfill({response});},{times:1});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await ready;
  await page.getByRole("button",{name:"다음 주",exact:true}).click();
  const next=new Date(new Date(f.start).getTime()+7*86400000).toISOString().slice(0,10);
  try {await expect(page.getByLabel(`${next} 09:00 가능 0명 / 전체 2명`,{exact:true})).toBeAttached();} finally {release();}
  await expect(page.getByLabel(`${next} 09:00 가능 0명 / 전체 2명`,{exact:true})).toBeAttached();
  await page.getByRole("button",{name:"내 시간",exact:true}).click();
  await expect(page.getByRole("button",{name:`${next} 09:00–10:00`,exact:true})).toHaveAttribute("aria-pressed","false");
  expect(await page.evaluate(()=>window.scrollY)).toBe(top);
  await page.getByRole("button",{name:"이전 주",exact:true}).click();
  await expect(page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"전체 시간",exact:true}).click();
  for(const width of [320,393,1280]){await page.setViewportSize({width,height:852});await page.evaluate(()=>window.scrollTo(0,0));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/heatmap-${width}.png`,fullPage:true});}
});
for(const width of [393,1280]){
  test(`주 전환 조회·실패·재시도 중 시간표 위치를 유지한다 (${width}px)`,async({page,context})=>{
    const f=await fixture(context);await page.setViewportSize({width,height:852});
    await page.goto(f.path);await page.getByRole("button",{name:"전체 시간",exact:true}).click();
    await expect(page.getByText("임시 집계 · 전체 1명",{exact:true})).toBeVisible();
    await page.evaluate(()=>document.fonts.ready);
    const grid=page.getByLabel("주별 가능 시간",{exact:true});
    const nextButton=page.getByRole("button",{name:"다음 주",exact:true});
    await page.evaluate(()=>window.scrollTo(0,80));
    const gridY=(await grid.boundingBox())!.y,nextY=(await nextButton.boundingBox())!.y;
    const scrollTop=await page.evaluate(()=>window.scrollY);
    const stable=async()=>{
      expect((await grid.boundingBox())!.y).toBeCloseTo(gridY,0);
      expect((await nextButton.boundingBox())!.y).toBeCloseTo(nextY,0);
      expect(await page.evaluate(()=>window.scrollY)).toBe(scrollTop);
    };
    const pattern=`**/p/${f.link.inviteToken}/overview?*`;
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    await page.route(pattern,async route=>{await gate;await route.continue();},{times:1});
    await nextButton.click();
    try {
      await expect(page.getByText("시간 정보 불러오는 중…",{exact:true})).toBeVisible();
      await stable();
    } finally {release();}
    await expect(page.getByText("임시 집계 · 전체 1명",{exact:true})).toBeVisible();await stable();
    await page.route(pattern,route=>route.abort());
    await page.getByRole("button",{name:"이전 주",exact:true}).click();
    await expect(page.getByText("시간 정보를 불러오지 못했어요.",{exact:false})).toBeVisible();await stable();
    await page.unroute(pattern);
    await page.getByRole("button",{name:"다시 불러오기",exact:true}).click();
    await expect(page.getByText("임시 집계 · 전체 1명",{exact:true})).toBeVisible();await stable();
  });
}
test("타인의 갱신은 집계만 바꾸고 본인 미제출 시간과 되돌리기를 보존한다",async({page,context})=>{
  const f=await fixture(context);await page.goto(f.path);
  const own=page.getByRole("button",{name:`${f.start} 09:00–10:00`,exact:true});await own.click();
  await page.getByRole("button",{name:"전체 시간",exact:true}).click();
  await expect(page.getByText("임시 집계 · 전체 1명",{exact:true})).toBeVisible();
  const friend=await db.participant.create({data:{promiseId:f.promise.id,nickname:"새참여자",normalizedNickname:"새참여자",role:"member",passwordHash:"unused",availabilitySubmittedAt:new Date()}});
  await db.participantAvailableSlot.create({data:{participantId:friend.id,slotStartAt:new Date(f.slot("09:30"))}});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel(`${f.start} 09:30 가능 1명 / 전체 2명`,{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"내 시간",exact:true}).click();await expect(own).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"되돌리기",exact:true}).click();await expect(own).toHaveAttribute("aria-pressed","false");
});
test("히트맵은 소요시간과 보기 단위에 관계없이 연속 가능 구간을 한 번 표시한다",async({page,context})=>{
  const f=await fixture(context);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{durationMinutes:60}});
  const friend=await db.participant.create({data:{promiseId:f.promise.id,nickname:"후보친구",normalizedNickname:"후보친구",role:"member",passwordHash:"unused",availabilitySubmittedAt:new Date()}});
  await db.participant.update({where:{id:f.member.id},data:{availabilitySubmittedAt:new Date()}});
  for(const [id,times] of [[f.member.id,["09:00","11:00","11:30","12:00"]],[friend.id,["09:00","11:00","11:30","12:00"]]] as const){
    await db.participantAvailableSlot.createMany({data:times.map(time=>({participantId:id,slotStartAt:new Date(f.slot(time))}))});
  }
  await page.setViewportSize({width:393,height:852});await page.goto(f.path);
  await page.getByRole("button",{name:"전체 시간",exact:true}).click();
  await expect(page.getByLabel(`${f.start} 09:00 가능 2명 / 전체 2명`,{exact:true})).toHaveText("");
  await expect(page.getByRole("img",{name:`${f.start} 09:00–09:30 2명 · 가능 구간`,exact:true})).toBeVisible();
  const candidate=page.getByLabel(`${f.start} 11:00–12:30 2명 · 가능 구간`,{exact:true});
  await expect(candidate).toBeVisible();await expect(candidate).toContainText("2명");await expect(candidate).toContainText("11:00");
  const pressed=page.getByLabel(`${f.start} 11:30 가능 2명 / 전체 2명`,{exact:true});
  await pressed.hover();await page.mouse.down();
  const tooltip=page.getByRole("tooltip",{name:"선택한 참여자",exact:true});
  await expect(tooltip).toContainText("테스트친구");await expect(tooltip).toContainText("후보친구");
  await expect(tooltip).not.toContainText("11:30");
  await expect(tooltip).toHaveText("테스트친구후보친구");
  await page.mouse.up();await expect(tooltip).toHaveCount(0);
  await expect(page.getByRole("dialog",{name:"임시 시간 후보",exact:true})).toHaveCount(0);
  await pressed.focus();await page.keyboard.down("Space");await expect(tooltip).toBeVisible();await page.keyboard.up("Space");await expect(tooltip).toHaveCount(0);
  await page.keyboard.down("Enter");await expect(tooltip).toBeVisible();await page.keyboard.press("Escape");await expect(tooltip).toHaveCount(0);await page.keyboard.up("Enter");
  await page.getByRole("button",{name:"30분",exact:true}).click();
  await expect(candidate).toHaveCount(1);await expect(candidate).toBeVisible();
  await page.getByRole("button",{name:"2시간",exact:true}).click();
  await expect(candidate).toBeVisible();
  for(const width of [320,393,1280]){await page.setViewportSize({width,height:852});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/candidate-heatmap-${width}.png`,fullPage:true});}
});
test("2시간 보기에서도 연속 구간 글씨는 중복 없이 전체 중앙에 표시된다",async({page,context})=>{
  const f=await fixture(context);
  const friend=await db.participant.create({data:{promiseId:f.promise.id,nickname:"배치친구",normalizedNickname:"배치친구",role:"member",passwordHash:"unused",availabilitySubmittedAt:new Date()}});
  for(const member of [f.member,friend]){
    await db.participant.update({where:{id:member.id},data:{availabilitySubmittedAt:new Date()}});
    await db.participantAvailableSlot.createMany({data:["10:00","10:30","11:00","11:30","12:00","12:30"].map(time=>({participantId:member.id,slotStartAt:new Date(f.slot(time))}))});
  }
  await page.setViewportSize({width:393,height:852});await page.goto(f.path);
  await page.getByRole("button",{name:"전체 시간",exact:true}).click();
  await page.getByRole("button",{name:"2시간",exact:true}).click();
  for(const width of [393,320,1280]){
    await page.setViewportSize({width,height:852});await page.evaluate(()=>document.fonts.ready);
    for(const [start,end,last] of [["10:00","13:00","12:30"]]){
      const label=page.getByRole("img",{name:new RegExp(`${f.start} ${start}–${end} 2명 · 가능 구간`)}).locator(":scope > span");
      await expect(label).toHaveCount(1);await expect(label).toBeVisible();
      const box=(await label.boundingBox())!;
      const firstSlot=(await page.getByLabel(`${f.start} ${start} 가능 2명 / 전체 2명`,{exact:true}).boundingBox())!;
      const lastSlot=(await page.getByLabel(`${f.start} ${last} 가능 2명 / 전체 2명`,{exact:true}).boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(firstSlot.y);
      expect(box.y+box.height).toBeLessThanOrEqual(lastSlot.y+lastSlot.height);
      expect(Math.abs(box.y+box.height/2-(firstSlot.y+lastSlot.y+lastSlot.height)/2)).toBeLessThan(2);
      expect(box.x).toBeGreaterThanOrEqual(firstSlot.x);
      expect(box.x+box.width).toBeLessThanOrEqual(firstSlot.x+firstSlot.width);
    }
    await page.screenshot({path:`test-results/heatmap-mid-start-${width}.png`,fullPage:true});
  }
});
test("모바일 범례는 색상별 인원수이며 누르는 동안만 해당 30분의 선택자를 보여준다",async({browser})=>{
  const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  try {
    const f=await fixture(context),page=await context.newPage();
    await db.promiseRecord.update({where:{id:f.promise.id},data:{dailyEndMinute:1440}});
    await db.participant.update({where:{id:f.member.id},data:{availabilitySubmittedAt:new Date()}});
    await db.participantAvailableSlot.create({data:{participantId:f.member.id,slotStartAt:new Date(f.slot("09:00"))}});
    for(const [nickname,time,submitted] of [["선택친구","09:00",true],["다른시간","09:30",true],["미제출친구","09:00",false],["미선택친구",null,true]] as const){
      const person=await db.participant.create({data:{promiseId:f.promise.id,nickname,normalizedNickname:nickname,role:"member",passwordHash:"unused",availabilitySubmittedAt:submitted?new Date():null}});
      if(time)await db.participantAvailableSlot.create({data:{participantId:person.id,slotStartAt:new Date(f.slot(time))}});
    }
    await page.goto(`http://127.0.0.1:3100${f.path}`);await page.getByRole("button",{name:"전체 시간",exact:true}).tap();
    const legend=page.getByRole("group",{name:"색상별 가능 인원",exact:true});
    for(const label of ["0명","5명"])await expect(legend.getByText(label,{exact:true})).toBeVisible();
    for(const label of ["1명","2명","3명","4~5명"])await expect(legend.getByText(label,{exact:true})).toHaveCount(0);
    for(const width of [320,393,1280]){
      await page.setViewportSize({width,height:852});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:`test-results/heatmap-scale-${width}.png`,fullPage:true});
    }
    await page.setViewportSize({width:393,height:852});
    const first=page.getByLabel(`${f.start} 09:00 가능 2명 / 전체 5명`,{exact:true});
    const second=page.getByLabel(`${f.start} 09:30 가능 1명 / 전체 5명`,{exact:true});
    const tooltip=page.getByRole("tooltip",{name:"선택한 참여자",exact:true});
    const client=await context.newCDPSession(page);
    async function press(cell:typeof first){const box=await cell.boundingBox();if(!box)throw new Error("칸 없음");await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});}
    await press(first);await expect(tooltip).toContainText("테스트친구");await expect(tooltip).toContainText("선택친구");await expect(tooltip).not.toContainText("미제출친구");await expect(tooltip).not.toContainText("다른시간");
    await page.screenshot({path:"test-results/heatmap-hold-393.png",fullPage:true,animations:"disabled"});
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await expect(tooltip).toHaveCount(0);
    await press(second);await expect(tooltip).toContainText("다른시간");await expect(tooltip).not.toContainText("선택친구");
    await client.send("Input.dispatchTouchEvent",{type:"touchCancel",touchPoints:[]});await expect(tooltip).toHaveCount(0);
    await first.tap();await expect(tooltip).toHaveCount(0);
    const box=await first.boundingBox();if(!box)throw new Error("칸 없음");
    await press(first);await expect(tooltip).toBeVisible();
    for(let i=1;i<=8;i++)await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2-i*12}]});
    await expect(tooltip).toHaveCount(0);
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    expect(await page.evaluate(()=>window.scrollY)).toBeGreaterThan(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  } finally {await context.close();}
});
test("선택자 30명의 긴 이름도 좁은 화면 안에 표시하고 칸 이탈·창 전환 시 닫는다",async({page,context})=>{
  const f=await fixture(context);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{participantLimit:30}});
  for(let i=0;i<30;i++){
    const nickname=`친구이름열두글자확인${String(i).padStart(2,"0")}`;
    const person=i===0?await db.participant.update({where:{id:f.member.id},data:{nickname,normalizedNickname:nickname,availabilitySubmittedAt:new Date()}}):await db.participant.create({data:{promiseId:f.promise.id,nickname,normalizedNickname:nickname,role:"member",passwordHash:"unused",availabilitySubmittedAt:new Date()}});
    await db.participantAvailableSlot.create({data:{participantId:person.id,slotStartAt:new Date(f.slot("09:00"))}});
  }
  await page.setViewportSize({width:320,height:700});await page.goto(f.path);await page.getByRole("button",{name:"전체 시간",exact:true}).click();
  const cell=page.getByLabel(`${f.start} 09:00 가능 30명 / 전체 30명`,{exact:true}),tooltip=page.getByRole("tooltip",{name:"선택한 참여자",exact:true});
  await cell.hover();await page.mouse.down();await expect(tooltip.getByRole("listitem")).toHaveCount(30);
  expect(await tooltip.evaluate(element=>element.scrollHeight<=element.clientHeight)).toBe(true);
  const box=await tooltip.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(320);expect(box!.y+box!.height).toBeLessThanOrEqual(700);
  await page.screenshot({path:"test-results/heatmap-hold-30-320.png",fullPage:true,animations:"disabled"});
  await page.mouse.move(5,5);await expect(tooltip).toHaveCount(0);await page.mouse.up();
  await cell.hover();await page.mouse.down();await expect(tooltip).toBeVisible();await page.evaluate(()=>window.dispatchEvent(new Event("blur")));await expect(tooltip).toHaveCount(0);await page.mouse.up();
});

test("동물은 첫 10명까지 다르고 11번째부터 반복하며 선택자·관리 목록에서도 일치한다",async({page,context})=>{
  const f=await fixture(context);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{participantLimit:30}});
  await db.participant.update({where:{id:f.member.id},data:{createdAt:new Date("2026-01-01T00:00:00Z")}});
  for(let i=1;i<=10;i++){
    const person=await db.participant.create({data:{promiseId:f.promise.id,nickname:`동물친구${i}`,normalizedNickname:`동물친구${i}`,role:"member",passwordHash:"unused",createdAt:new Date(Date.UTC(2026,0,1,0,0,i)),availabilitySubmittedAt:new Date()}});
    if(i===1||i===5||i===10)await db.participantAvailableSlot.create({data:{participantId:person.id,slotStartAt:new Date(f.slot("09:00"))}});
  }
  await page.setViewportSize({width:393,height:852});await page.goto(f.path);
  await page.getByRole("button",{name:"약속 정보 열기",exact:true}).click();
  const drawer=page.getByRole("dialog",{name:"약속 정보",exact:true});
  await expect(drawer.locator(".animal-avatar")).toHaveCount(11);
  const avatars=await drawer.locator(".animal-avatar").evaluateAll(nodes=>nodes.map(node=>node.innerHTML));
  expect(new Set(avatars.slice(0,10)).size).toBe(10);
  expect(avatars[10]).toBe(avatars[0]);
  await drawer.getByRole("button",{name:"전체 일정",exact:true}).click();
  const cell=page.getByLabel(`${f.start} 09:00 가능 3명 / 전체 11명`,{exact:true});
  await cell.hover();await page.mouse.down();
  const tooltip=page.getByRole("tooltip",{name:"선택한 참여자",exact:true});
  await expect(tooltip.getByRole("listitem")).toHaveCount(3);
  expect(await tooltip.locator(".animal-avatar").evaluateAll(nodes=>nodes.map(node=>node.innerHTML))).toEqual([avatars[1],avatars[5],avatars[10]]);
  await page.mouse.up();
  await page.goto(`/p/${f.link.inviteToken}/participants`);
  await expect(page.locator(".animal-avatar")).toHaveCount(11);
  expect(await page.locator(".animal-avatar").evaluateAll(nodes=>nodes.map(node=>node.innerHTML))).toEqual(avatars);
  await page.screenshot({path:"test-results/animal-avatars-11-393.png",fullPage:true});
});
