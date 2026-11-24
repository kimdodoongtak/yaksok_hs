import { returningCalendarUser } from "./returning-calendar-user";
import { test, expect, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { newToken, tokenHash } from "../src/lib/invitation/security";
import { sessionCookie } from "../src/lib/invitation/cookie";
import { verifyTestDatabase } from "../scripts/test-database.mjs";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
const links: string[] = []; let verified = false;
test.beforeAll(async () => { await verifyTestDatabase(process.env.TEST_DATABASE_URL); verified = true; });
test.afterAll(async () => {
  if (verified) {
    const where = { participant: { promise: { promiseLinkId: { in: links } } } };
    await db.participantAvailableSlot.deleteMany({ where }); await db.participantSession.deleteMany({ where });
    await db.participant.deleteMany({ where: { promise: { promiseLinkId: { in: links } } } });
    await db.promiseRecord.deleteMany({ where: { promiseLinkId: { in: links } } }); await db.promiseLink.deleteMany({ where: { id: { in: links } } });
  }
  await db.$disconnect();
});
async function fixture(context: BrowserContext) {
  await returningCalendarUser(context);
  const link = await db.promiseLink.create({ data: { inviteToken: newToken() } }); links.push(link.id);
  const start = new Date(Date.now()+86400000).toISOString().slice(0,10);
  const promise = await db.promiseRecord.create({ data: { promiseLinkId: link.id, status: "collecting", participantLimit: 5, dateRangeStart: new Date(start), dateRangeEnd: new Date(Date.now()+7*86400000), dailyStartMinute:540,dailyEndMinute:1080,durationMinutes:60,votingDeadlineAt:new Date(Date.now()+3600000) } });
  const host = await db.participant.create({ data: { promiseId: promise.id, nickname: "기존방장", normalizedNickname: "기존방장", passwordHash: "hidden", role: "host" } });
  const friend = await db.participant.create({ data: { promiseId: promise.id, nickname: "다음방장", normalizedNickname: "다음방장", passwordHash: "hidden", role: "member" } });
  async function login(target: BrowserContext, id: string) {
    await returningCalendarUser(target);
    const token = newToken(), expiresAt = new Date(Date.now()+7*86400000);
    await db.participantSession.create({ data: { participantId: id, sessionTokenHash: tokenHash(token), expiresAt } });
    const cookie = sessionCookie(link.inviteToken, expiresAt);
    await target.addCookies([{ name: cookie.name, value: token, domain: "127.0.0.1", path: cookie.path, httpOnly:true,sameSite:"Lax",expires:expiresAt.getTime()/1000 }]);
  }
  await login(context, host.id);
  return { link, promise, host, friend, login, path: `/p/${link.inviteToken}` };
}
test("취소된 상세 HTTP API는 인증보다 취소 409를 우선하고 정보는 공개하지 않는다",async({context,request})=>{
  const f=await fixture(context);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"cancelled",cancelledAt:new Date()}});
  await db.participantSession.updateMany({where:{participant:{promiseId:f.promise.id}},data:{expiresAt:new Date(0)}});
  for (const client of [context.request,request]) {
    for (const suffix of ["availability/state","overview","result/state","participants/state"]) {
      const response=await client.get(`${f.path}/${suffix}`);
      expect(response.status()).toBe(409);
      expect(await response.json()).toEqual({ok:false,code:"PROMISE_CANCELLED"});
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
    const write=await client.post(`${f.path}/availability/state`,{headers:{origin:"http://127.0.0.1:3100"},data:{baseVersion:0,slots:[]}});
    expect(write.status()).toBe(409);expect(await write.json()).toEqual({ok:false,code:"PROMISE_CANCELLED"});
    expect(await (await client.get(`${f.path}/state`)).json()).toEqual({state:"cancelled"});
  }
  await db.promiseLink.update({where:{id:f.link.id},data:{createdAt:new Date(Date.now()-100*86400000)}});
  expect(await (await request.get(`${f.path}/state`)).json()).toEqual({state:"expired"});
  expect(await (await request.get(`${f.path}/participants/state`)).json()).toEqual({ok:false,code:"LINK_EXPIRED"});
});

test("방장 취소 확인·실패 재시도·중복 방지 후 다른 열린 화면도 취소 안내로 바뀐다",async({page,context,browser})=>{
  const f=await fixture(context),guestContext=await browser.newContext({viewport:{width:393,height:852}});
  try {
    await f.login(guestContext,f.friend.id);
    const guest=await guestContext.newPage();await guest.goto(`http://127.0.0.1:3100${f.path}/availability`);
    const editing=await context.newPage();await editing.goto(`${f.path}/settings/edit`);
    await page.setViewportSize({width:393,height:852});await page.goto(`${f.path}/participants`);
    await page.getByRole("button",{name:"약속 취소",exact:true}).click();
    const dialog=page.getByRole("dialog",{name:"약속을 취소할까요?",exact:true});
    await expect(dialog).toContainText("모든 참여자가 더 이상 접근할 수 없어요");
    await dialog.getByRole("button",{name:"돌아가기",exact:true}).click();
    expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("collecting");
    await page.getByRole("button",{name:"약속 취소",exact:true}).click();
    await page.route(`**${f.path}/participants`,route=>route.request().method()==="POST"?route.abort():route.continue());
    await dialog.getByRole("button",{name:"약속 취소하기",exact:true}).click();
    await expect(dialog.getByRole("alert")).toContainText("다시 시도");
    await page.unroute(`**${f.path}/participants`);
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    await page.route(`**${f.path}/participants`,async route=>{if(route.request().method()==="POST")await gate;await route.continue();});
    await dialog.getByRole("button",{name:"약속 취소하기",exact:true}).click();
    await expect(dialog.getByRole("button",{name:"처리 중…",exact:true})).toBeDisabled();
    await page.keyboard.press("Escape");await expect(dialog).toBeVisible();release();
    for(const target of [page,guest,editing]) {
      await expect(target.getByRole("heading",{name:"취소된 약속입니다.",exact:true})).toBeVisible({timeout:12000});
      await expect(target.getByText("기존방장",{exact:true})).toHaveCount(0);
      await expect(target.locator("main").getByRole("button")).toHaveCount(0);
    }
    expect(await db.participant.count({where:{promiseId:f.promise.id,status:"active"}})).toBe(2);
    expect(await db.participantSession.count({where:{participant:{promiseId:f.promise.id},expiresAt:{gt:new Date()}}})).toBe(0);
  }finally{await guestContext.close();}
});

test("초안 취소는 초안 나가기와 구분하고 기록·링크를 보존한다",async({page,context,request})=>{
  const f=await fixture(context);
  await db.participant.delete({where:{id:f.friend.id}});
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"draft",participantLimit:null,dateRangeStart:null,dateRangeEnd:null,dailyStartMinute:null,dailyEndMinute:null,durationMinutes:null,votingDeadlineAt:null}});
  await page.goto(`${f.path}/settings`);
  await page.getByRole("button",{name:"약속 취소",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"약속을 취소할까요?",exact:true});
  await expect(dialog).toContainText("초안 나가기와 달리 이 링크로 다시 시작할 수 없어요");
  for (const width of [320,393,1280]) {
    await page.setViewportSize({width,height:852});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/cancellation-${width}.png`,fullPage:true});
  }
  await dialog.getByRole("button",{name:"약속 취소하기",exact:true}).click();
  await expect(page.getByRole("heading",{name:"취소된 약속입니다.",exact:true})).toBeVisible();
  expect(await db.participant.count({where:{promiseId:f.promise.id,role:"host",status:"active"}})).toBe(1);
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("cancelled");
  expect(await (await request.get(`${f.path}/state`)).json()).toEqual({state:"cancelled"});
  await page.reload();await expect(page.getByRole("heading",{name:"취소된 약속입니다.",exact:true})).toBeVisible();
});

test("초안 취소 후 늦은 이전 조회가 설정 화면을 다시 노출하지 않는다",async({page,context})=>{
  const f=await fixture(context);
  await db.participant.delete({where:{id:f.friend.id}});
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"draft"}});
  await page.goto(f.path);
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  let captured=false;
  await page.route(`**${f.path}/state`,async route=>{
    const response=await route.fetch();captured=true;
    await gate;await route.fulfill({response});
  });
  await page.evaluate(()=>document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(()=>captured).toBe(true);
  await page.getByRole("button",{name:"약속 취소",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"약속 취소하기",exact:true}).click();
  await expect(page.getByRole("heading",{name:"취소된 약속입니다.",exact:true})).toBeVisible();
  const late=page.waitForResponse(r=>r.url().endsWith(`${f.path}/state`));release();await (await late).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.getByRole("heading",{name:"약속 설정",exact:true})).toBeHidden({timeout:500});
  await expect(page.getByRole("heading",{name:"취소된 약속입니다.",exact:true})).toBeVisible();
});
for (const status of ["closed","confirmed"]) test(`${status} 약속도 방장이 취소하고 열린 후보·결과 화면의 상세를 닫는다`,async({page,context,browser})=>{
  const f=await fixture(context),guestContext=await browser.newContext();
  try {
    const start=new Date(f.promise.dateRangeStart!);
    await db.promiseRecord.update({where:{id:f.promise.id},data:{status,confirmedStartAt:status==="confirmed"?start:null}});
    await db.participant.updateMany({where:{promiseId:f.promise.id},data:{availabilitySubmittedAt:new Date()}});
    await db.participantAvailableSlot.createMany({data:[f.host.id,f.friend.id].flatMap(participantId=>[0,30].map(minutes=>({participantId,slotStartAt:new Date(start.getTime()+minutes*60000)})))});
    await f.login(guestContext,f.friend.id);const guest=await guestContext.newPage();
    await guest.goto(`http://127.0.0.1:3100${f.path}/participants`);
    await expect(guest.getByRole("button",{name:"약속 취소",exact:true})).toHaveCount(0);
    await guest.goto(`http://127.0.0.1:3100${f.path}/${status==="confirmed"?"result":"candidates"}`);
    await page.goto(`${f.path}/participants`);
    await page.getByRole("button",{name:"약속 취소",exact:true}).click();
    await page.getByRole("dialog").getByRole("button",{name:"약속 취소하기",exact:true}).click();
    await expect(guest.getByRole("heading",{name:"취소된 약속입니다.",exact:true})).toBeVisible({timeout:12000});
    await expect(guest.getByText("다음방장",{exact:true})).toHaveCount(0);
    expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).confirmedStartAt).toEqual(status==="confirmed"?start:null);
    expect(await db.participantAvailableSlot.count({where:{participant:{promiseId:f.promise.id}}})).toBe(4);
  }finally{await guestContext.close();}
});
test("취소 성공 응답이 유실돼도 재시도는 취소 안내로 끝나고 기록을 다시 바꾸지 않는다",async({page,context})=>{
  const f=await fixture(context);await page.goto(`${f.path}/participants`);
  const original=await (await page.request.get(`${f.path}/participants/state`)).json();
  await page.route(`**${f.path}/participants/state`,route=>route.fulfill({json:original}));
  await page.route(`**${f.path}/participants`,async route=>{
    if(route.request().method()!=="POST")return route.continue();
    await route.fetch();await route.abort();
  });
  await page.getByRole("button",{name:"약속 취소",exact:true}).click();
  const dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:"약속 취소하기",exact:true}).click();
  await expect(dialog.getByRole("alert")).toContainText("다시 시도");
  const before=await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}});expect(before.status).toBe("cancelled");
  await page.unroute(`**${f.path}/participants`);
  await dialog.getByRole("button",{name:"약속 취소하기",exact:true}).click();
  await expect(page.getByRole("heading",{name:"취소된 약속입니다.",exact:true})).toBeVisible();
  expect(await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).toEqual(before);
});
test("취소 Server Action은 외부 Origin과 Origin 누락 요청을 거절한다",async({page,context})=>{
  const f=await fixture(context);await page.goto(`${f.path}/participants`);
  let headers:Record<string,string>={},body:Buffer|null=null;
  await page.route(`**${f.path}/participants`,async route=>{
    if(route.request().method()!=="POST")return route.continue();
    headers=await route.request().allHeaders();body=route.request().postDataBuffer();await route.abort();
  });
  await page.getByRole("button",{name:"약속 취소",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"약속 취소하기",exact:true}).click();
  await expect.poll(()=>Boolean(body)).toBe(true);
  delete headers["content-length"];
  const outside=await page.request.post(`${f.path}/participants`,{headers:{...headers,origin:"https://external.example"},data:body!});
  expect(outside.status()).toBeGreaterThanOrEqual(400);
  delete headers.origin;
  const missing=await page.request.post(`${f.path}/participants`,{headers,data:body!});
  expect(await missing.text()).toContain("FORBIDDEN");
  expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("collecting");
});

test("취소 완료 화면도 이후 링크 만료를 반영하고 늦은 상세 응답은 숨긴다", async ({ page, context, request }) => {
  const f = await fixture(context);
  await page.goto(`${f.path}/participants`);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let captured = false;
  await page.route(`**${f.path}/participants/state`, async route => {
    const response = await route.fetch();
    captured = true;
    await gate;
    await route.fulfill({ response });
  });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => captured).toBe(true);
  await page.getByRole("button", { name: "약속 취소", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "약속 취소하기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "취소된 약속입니다.", exact: true })).toBeVisible();
  const late = page.waitForResponse(response => response.url().endsWith(`${f.path}/participants/state`));
  release(); await (await late).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByRole("heading", { name: "취소된 약속입니다.", exact: true })).toBeVisible();
  await expect(page.getByText("기존방장", { exact: true })).toHaveCount(0);
  await expect(page.locator("main").getByRole("button")).toHaveCount(0);
  await db.promiseLink.update({ where: { id: f.link.id }, data: { createdAt: new Date(Date.now() - 100 * 86400000) } });
  expect(await (await request.get(`${f.path}/state`)).json()).toEqual({ state: "expired" });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("heading", { name: "만료된 약속입니다", exact: true })).toBeVisible({ timeout: 7000 });
  await expect(page.getByRole("heading", { name: "취소된 약속입니다.", exact: true })).toHaveCount(0);
});
