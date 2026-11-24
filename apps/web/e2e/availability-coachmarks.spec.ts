import { writeFile } from "node:fs/promises";
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

for (const size of [{width:1366,height:768},{width:1440,height:900},{width:1024,height:600},{width:393,height:740},{width:320,height:640}]) {
  test(`안내 대상과 카드가 화면 안에 함께 보인다 ${size.width}`, async ({page,context}) => {
    await page.setViewportSize(size);
    const f=await fixture(context);
    await page.goto(f.path);
    await page.getByRole("button",{name:"사용법 보기",exact:true}).click();
    const targets=["mode","grid","unit","repeat","submit"];
    for (let index=0;index<targets.length;index++) {
      const dialog=page.getByRole("dialog");
      await expect(dialog).toContainText(`${index+1} / 5`);
      // Allow the intentional movement to finish before geometry is assessed.
      await page.waitForTimeout(240);
      await page.screenshot({path:`test-results/guide-${size.width}-${targets[index]}.png`});
      const layout=await page.evaluate((targetName)=>{
        const target=document.querySelector(`[data-coachmark="${targetName}"]`)!.getBoundingClientRect();
        const card=document.querySelector('dialog[open] [class*="card"]')!.getBoundingClientRect();
        const controls=document.querySelector('[data-calendar-controls]')!.getBoundingClientRect();
        const targetTop=targetName==="grid"?Math.max(target.top,controls.bottom):target.top;
        const targetBottom=targetName==="grid"?Math.min(target.bottom,targetTop+84):target.bottom;
        return {card:{top:card.top,bottom:card.bottom,left:card.left,right:card.right},target:{top:targetTop,bottom:targetBottom,left:target.left,right:target.right},height:innerHeight,width:innerWidth};
      },targets[index]);
      expect.soft(layout.target.top,`${targets[index]} 대상 위쪽`).toBeGreaterThanOrEqual(0);
      expect.soft(layout.target.bottom,`${targets[index]} 대상 아래쪽`).toBeLessThanOrEqual(size.height);
      expect.soft(layout.card.top).toBeGreaterThanOrEqual(0);
      expect.soft(layout.card.bottom).toBeLessThanOrEqual(size.height);
      expect.soft(layout.card.left).toBeGreaterThanOrEqual(0);
      expect.soft(layout.card.right).toBeLessThanOrEqual(size.width);
      const overlaps=layout.card.left<layout.target.right && layout.card.right>layout.target.left && layout.card.top<layout.target.bottom && layout.card.bottom>layout.target.top;
      expect.soft(overlaps,`${targets[index]} 안내가 대상을 덮지 않음`).toBe(false);
      await dialog.getByRole("button",{name:index===4?"시작하기":"다음",exact:true}).click();
    }
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(0);
    await page.getByRole("button",{name:"사용법",exact:true}).click();
    await expect(page.getByRole("dialog")).toContainText("1 / 5");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button",{name:"사용법",exact:true})).toBeFocused();
  });
}

test("노트북에서 시간표 여섯 행 이상을 처음부터 볼 수 있다",async({page,context})=>{
  await page.setViewportSize({width:1366,height:768});
  const f=await fixture(context);await page.goto(f.path);
  await page.getByRole("button",{name:"바로 시작하기",exact:true}).click();
  const geometry=await page.evaluate(()=>{
    const grid=document.querySelector('[data-coachmark="grid"]')!.getBoundingClientRect();
    const footer=document.querySelector('[data-coachmark="submit"]')!.closest('footer')!.getBoundingClientRect();
    const rowHeight=document.querySelector('[data-coachmark="grid"] button')!.getBoundingClientRect().height;
    return {top:grid.top,width:grid.width,visibleRows:Math.floor((Math.min(innerHeight,footer.top)-grid.top)/(rowHeight+6))};
  });
  await page.screenshot({path:"test-results/calendar-laptop.png"});
  expect.soft(geometry.top).toBeLessThanOrEqual(360);
  expect.soft(geometry.width).toBeGreaterThanOrEqual(850);
  expect.soft(geometry.visibleRows).toBeGreaterThanOrEqual(6);
});


test("안내 위치가 바뀌어도 화면 네 모서리의 배경을 덮는다",async({page,context})=>{
  await page.setViewportSize({width:1024,height:900});
  const f=await fixture(context);await page.goto(f.path);
  await page.getByRole("button",{name:"사용법 보기",exact:true}).click();
  const corners=[{x:0,y:0},{x:1020,y:0},{x:0,y:896},{x:1020,y:896}];
  const before=[];
  for(const corner of corners) before.push(await page.screenshot({clip:{...corner,width:4,height:4}}));
  for(let index=0;index<4;index++) {
    await page.getByRole("dialog").getByRole("button",{name:"다음",exact:true}).click();
    // Sample during movement too: the backdrop must not travel with the card.
    for(let c=0;c<corners.length;c++) {
      const current=await page.screenshot({clip:{...corners[c],width:4,height:4}});
      expect(current.equals(before[c]),`단계 ${index+2}, 모서리 ${c}`).toBe(true);
    }
  }
  await page.screenshot({path:"test-results/guide-backdrop-1024.png"});
});

test("모바일 스크롤·넓은 터치·안내 재실행이 선택을 보존한다",async({browser})=>{
  const context=await browser.newContext({viewport:{width:393,height:740},hasTouch:true,isMobile:true});
  try {
    const f=await fixture(context),page=await context.newPage();
    await page.goto(`http://127.0.0.1:3100${f.path}`);
    await page.getByRole("button",{name:"바로 시작하기",exact:true}).tap();
    const cell=page.locator('[data-coachmark="grid"] button:not(:disabled)').first();
    const client=await context.newCDPSession(page);
    let box=(await cell.boundingBox())!;
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y,radiusX:12,radiusY:12}]});
    for(let n=1;n<=6;n++) await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:y-20*n,radiusX:12,radiusY:12}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
    await expect(page.locator('[data-coachmark="grid"] [aria-pressed="true"]')).toHaveCount(0);
    await page.evaluate(()=>new Promise<void>(resolve=>{
      let timer:ReturnType<typeof setTimeout>;
      const done=()=>{window.removeEventListener("scroll",settle);resolve();};
      const settle=()=>{clearTimeout(timer);timer=setTimeout(done,200);};
      window.addEventListener("scroll",settle);settle();
    }));
    await page.evaluate(()=>window.scrollTo(0,0));
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
    await page.getByRole("button",{name:"선택",exact:true}).tap();
    await expect(page.getByRole("button",{name:"선택",exact:true})).toHaveAttribute("aria-pressed","true");
    box=(await cell.boundingBox())!;
    const touch={x:box.x+3,y:box.y+box.height/2,radiusX:12,radiusY:12};
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[touch]});
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await page.screenshot({path:"test-results/guide-touch-selected.png"});
    await expect(cell).toHaveAttribute("aria-pressed","true");
    await page.getByRole("button",{name:"사용법",exact:true}).tap();
    await expect(page.getByRole("dialog")).toContainText("1 / 5");
    box=(await cell.boundingBox())!;
    await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    await expect(cell).toHaveAttribute("aria-pressed","true");
    await page.getByRole("dialog").getByRole("button",{name:"건너뛰기",exact:true}).tap();
    await expect(cell).toHaveAttribute("aria-pressed","true");
    await page.getByRole("button",{name:"선택 제출",exact:true}).tap();
    await expect(page.getByRole("status")).toContainText("제출했어요");
    expect(await db.participantAvailableSlot.count({where:{participantId:f.member.id}})).toBe(2);
    await page.reload();
    await page.getByRole("button",{name:"전체 시간",exact:true}).tap();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  } finally { await context.close(); }
});


test("첫 안내 버튼은 간격을 둔 세로 배치이며 화면 안에 들어온다",async({page,context})=>{
  const f=await fixture(context);
  for(const width of [1024,1366,393,320]) {
    await page.setViewportSize({width,height:640});
    await page.goto(f.path);
    const primary=page.getByRole("button",{name:"사용법 보기",exact:true});
    const secondary=page.getByRole("button",{name:"바로 시작하기",exact:true});
    await expect(primary).toBeVisible();
    const a=(await primary.boundingBox())!, b=(await secondary.boundingBox())!;
    expect(a.height).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.y-a.y-a.height).toBeGreaterThanOrEqual(8);
    expect(Math.abs(a.width-b.width)).toBeLessThan(1);
    expect(b.y+b.height).toBeLessThanOrEqual(624);
    await page.screenshot({path:`test-results/welcome-${width}.png`});
    if(width===1366) await writeFile("test-results/welcome-probe.html",await page.locator("body").innerHTML());
  }
});

for(const size of [{width:900,height:600},{width:1024,height:600},{width:1366,height:768}]) {
  test(`노트북 정보와 달력 시작선·전체 높이·문서 스크롤 ${size.width}`,async({page,context})=>{
    await page.setViewportSize(size);
    const f=await fixture(context);
    await db.promiseRecord.update({where:{id:f.promise.id},data:{dailyEndMinute:1440}});
    await page.goto(f.path);
    await page.getByRole("button",{name:"바로 시작하기",exact:true}).click();
    const geometry=await page.evaluate(()=>{
      const panel=document.querySelector('section[aria-label="가능 시간 선택"]')!;
      const info=document.querySelector('aside[aria-label="약속 정보"]')!;
      const grid=document.querySelector('[data-coachmark="grid"]')!;
      const footer=panel.querySelector('footer')!.getBoundingClientRect();
      const ancestors=[];let node:Element|null=grid;
      while(node&&node!==document.body){ancestors.push(node);node=node.parentElement;}
      return {panelTop:panel.getBoundingClientRect().top,infoTop:info.getBoundingClientRect().top,panelHeight:panel.getBoundingClientRect().height,rows:Math.floor((footer.top-grid.getBoundingClientRect().top)/42),nestedScroll:ancestors.some(el=>/auto|scroll/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+1)};
    });
    expect.soft(Math.abs(geometry.panelTop-geometry.infoTop)).toBeLessThanOrEqual(1);
    expect.soft(geometry.panelHeight).toBeGreaterThanOrEqual(size.height-geometry.panelTop);
    expect.soft(geometry.rows).toBeGreaterThanOrEqual(6);
    expect.soft(geometry.nestedScroll).toBe(false);
    await page.screenshot({path:`test-results/aligned-calendar-${size.width}.png`});
    const first=page.locator('[data-coachmark="grid"] button').first();
    const before=(await first.boundingBox())!.y;
    await page.mouse.move(size.width-180,size.height-140);
    await page.mouse.wheel(0,300);
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
    expect((await first.boundingBox())!.y).toBeLessThan(before);
    await expect(page.getByRole("button",{name:"선택 제출",exact:true})).toBeInViewport();
  });
}

for (const exit of ["바로 시작하기", "건너뛰기", "완료", "Escape"]) {
  test(`안내를 닫은 뒤 새로고침·다른 약속에서도 자동 반복하지 않는다: ${exit}`,async({page,context})=>{
    const f=await fixture(context);await page.goto(f.path);
    await expect(page.getByRole("button",{name:"사용법 보기",exact:true})).toBeVisible();
    if(exit==="바로 시작하기") await page.getByRole("button",{name:exit,exact:true}).click();
    else if(exit==="Escape") await page.keyboard.press("Escape");
    else {
      await page.getByRole("button",{name:"사용법 보기",exact:true}).click();
      if(exit==="건너뛰기") await page.getByRole("button",{name:exit,exact:true}).click();
      else {
        for(let step=0;step<4;step++) await page.getByRole("button",{name:"다음",exact:true}).click();
        await page.getByRole("button",{name:"시작하기",exact:true}).click();
      }
    }
    await page.reload();
    await page.waitForFunction(()=>Boolean(document.querySelector('[data-calendar-controls]')?.parentElement?.style.getPropertyValue('--calendar-controls-height')));
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await expect(page.getByRole("dialog")).not.toBeVisible();
    const other=await fixture(context);await page.goto(other.path);
    await page.getByRole("button",{name:"전체 시간",exact:true}).click();
    await page.getByRole("button",{name:"내 시간",exact:true}).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button",{name:"사용법",exact:true}).click();
    await expect(page.getByRole("dialog")).toContainText("1 / 5");
  });
}
