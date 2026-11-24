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
  return { link, promise, host, friend, login, path: `/p/${link.inviteToken}/participants` };
}
test("방장 나가기 확인·자동 승계·마지막 방장 약속 취소를 모바일에서 완료한다", async ({ page, context, browser }) => {
  const f = await fixture(context), friendContext = await browser.newContext({ viewport: { width: 393, height: 852 } });
  try {
    await f.login(friendContext, f.friend.id);
    const friendPage = await friendContext.newPage(); await friendPage.goto(`http://127.0.0.1:3100${f.path}`);
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(`/p/${f.link.inviteToken}`);
    await page.getByRole("link", { name: "참여자 관리", exact: true }).click();
    await expect(page.getByRole("heading", { name: "참여자", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "약속 나가기", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "약속에서 나갈까요?", exact: true });
    await expect(dialog).toContainText("다음방장님이 방장을 이어받아요.");
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    expect((await db.participant.findUniqueOrThrow({ where: { id: f.host.id } })).status).toBe("active");
    await page.getByRole("button", { name: "약속 나가기", exact: true }).click();
    await dialog.getByRole("button", { name: "나가기", exact: true }).click();
    await expect(page.getByRole("heading", { name: "약속에서 나왔어요", exact: true })).toBeVisible();
    await expect(page.getByText("다음방장님이 방장을 이어받았어요.", { exact: true })).toBeVisible();
    await expect(friendPage.getByRole("status")).toContainText("방장이 되었어요", { timeout: 12000 });
    await friendPage.getByRole("button", { name: "약속 나가기", exact: true }).click();
    const last = friendPage.getByRole("dialog"); await expect(last).toContainText("마지막 참여자라 약속이 취소돼요.");
    await last.getByRole("button", { name: "약속 취소하고 나가기", exact: true }).click();
    await expect(friendPage.getByRole("heading", { name: "약속이 취소됐어요", exact: true })).toBeVisible();
    expect((await db.promiseRecord.findUniqueOrThrow({ where: { id: f.promise.id } })).status).toBe("cancelled");
    await page.goto(`/p/${f.link.inviteToken}`); await expect(page.getByRole("heading", { name: "취소된 약속입니다.", exact: true })).toBeVisible();
  } finally { await friendContext.close(); }
});
test("내보내기 취소·통신 재시도와 열린 기기의 접근 차단을 확인한다", async ({page,context,browser}) => {
  const f=await fixture(context),guestContext=await browser.newContext();
  try {
    await f.login(guestContext,f.friend.id);const guest=await guestContext.newPage();await guest.goto(`http://127.0.0.1:3100${f.path}`);
    await page.goto(f.path);await page.getByRole("button",{name:"다음방장 내보내기",exact:true}).click();
    const dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:"취소",exact:true}).click();
    expect((await db.participant.findUniqueOrThrow({where:{id:f.friend.id}})).status).toBe("active");
    await page.getByRole("button",{name:"다음방장 내보내기",exact:true}).click();
    await page.route(`**${f.path}`,route=>route.request().method()==="POST"?route.abort():route.continue());
    await dialog.getByRole("button",{name:"내보내기",exact:true}).click();
    await expect(dialog.getByRole("alert")).toContainText("다시 시도");
    await page.unroute(`**${f.path}`);
    let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
    await page.route(`**${f.path}`,async route=>{if(route.request().method()==="POST")await gate;await route.continue();});
    await dialog.getByRole("button",{name:"내보내기",exact:true}).click();
    await expect(dialog.getByRole("button",{name:"처리 중…",exact:true})).toBeDisabled();
    await page.keyboard.press("Escape");await expect(dialog).toBeVisible();release();
    await expect(page.getByRole("button",{name:"다음방장 내보내기",exact:true})).toHaveCount(0);
    await expect(guest).toHaveURL(new RegExp(`/p/${f.link.inviteToken}$`),{timeout:12000});
    expect((await guest.request.get(`${f.path}/state`)).status()).toBe(401);
    expect(await db.participantSession.count({where:{participantId:f.friend.id}})).toBe(1);
  }finally{await guestContext.close();}
});
test("참여자 화면은 인증 후 공개하고 마감 후 내보내기를 숨기며 모바일 규격을 유지한다",async({page,context,request})=>{
  const f=await fixture(context);
  const denied=await request.get(`${f.path}/state`);expect(denied.status()).toBe(401);expect(await denied.text()).not.toContain("다음방장");
  await page.goto(f.path);
  for(const width of [320,393,1280]) {
    await page.setViewportSize({width,height:852});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/participants-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:393,height:852});await page.getByRole("button",{name:"약속 나가기",exact:true}).click();
  await page.screenshot({path:"test-results/participants-leave-393.png",fullPage:true});
  await page.getByRole("dialog").getByRole("button",{name:"취소",exact:true}).click();
  await db.promiseRecord.update({where:{id:f.promise.id},data:{votingDeadlineAt:new Date(Date.now()-1000)}});
  await expect(page.getByText("응답 마감 후에는 참여자를 내보낼 수 없어요.",{exact:true})).toBeVisible({timeout:12000});
  await expect(page.getByRole("button",{name:"다음방장 내보내기",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"약속 나가기",exact:true})).toBeVisible();
});
test("나가기 확인 중 후임이 탈퇴하면 약속을 취소하지 않고 다시 확인한다",async({page,context,browser})=>{
  const f=await fixture(context),friendContext=await browser.newContext();
  try {
    await f.login(friendContext,f.friend.id);const friend=await friendContext.newPage();await friend.goto(`http://127.0.0.1:3100${f.path}`);
    await page.goto(f.path);
    // 오래된 확인 창을 유지해 폴링보다 서버의 최신 후임 대조를 직접 검증한다.
    const original=await (await page.request.get(`${f.path}/state`)).json();
    await page.route(`**${f.path}/state`,route=>route.fulfill({json:original}));
    await page.getByRole("button",{name:"약속 나가기",exact:true}).click();
    await expect(page.getByRole("dialog")).toContainText("다음방장님이 방장을 이어받아요.");
    await friend.getByRole("button",{name:"약속 나가기",exact:true}).click();
    await friend.getByRole("dialog").getByRole("button",{name:"나가기",exact:true}).click();
    await expect(friend.getByRole("heading",{name:"약속에서 나왔어요",exact:true})).toBeVisible();
    await page.getByRole("dialog").getByRole("button",{name:"나가기",exact:true}).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect((await db.promiseRecord.findUniqueOrThrow({where:{id:f.promise.id}})).status).toBe("collecting");
    await page.unroute(`**${f.path}/state`);await page.reload();
    await page.getByRole("button",{name:"약속 나가기",exact:true}).click();
    await expect(page.getByRole("dialog")).toContainText("마지막 참여자라 약속이 취소돼요.");
    await page.getByRole("dialog").getByRole("button",{name:"취소",exact:true}).click();
  }finally{await friendContext.close();}
});

test("조회 복구 시 실패 안내를 지우고 기존 상태 변경 안내는 유지한다", async ({page,context}) => {
  const f=await fixture(context);
  await page.goto(f.path);
  const failure=page.getByText("최신 정보를 불러오지 못했어요. 잠시 후 다시 확인할게요.",{exact:true});
  const changed=page.getByText("참여자 또는 약속 상태가 변경됐어요. 최신 내용을 확인해 주세요.",{exact:true});
  const refresh=()=>page.evaluate(()=>document.dispatchEvent(new Event("visibilitychange")));
  async function recover() {
    await page.unroute(`**${f.path}/state`);
    const response=page.waitForResponse(r=>r.url().endsWith(`${f.path}/state`)&&r.status()===200);
    await refresh();
    expect((await (await response).json()).ok).toBe(true);
    await expect(failure).toBeHidden();
  }
  await page.route(`**${f.path}/state`,route=>route.abort());
  await refresh();
  await expect(failure).toBeVisible();
  await recover();
  await db.promiseRecord.update({where:{id:f.promise.id},data:{votingDeadlineAt:new Date(Date.now()-1000)}});
  await refresh();
  await expect(changed).toBeVisible();
  await page.route(`**${f.path}/state`,route=>route.fulfill({status:503,json:{ok:false,code:"UNAVAILABLE"}}));
  await refresh();
  await expect(failure).toBeVisible();
  await recover();
  await expect(changed).toBeVisible();
});

test("참여자 관리에서 내보내기·새로고침 후에도 들어온 화면으로 돌아간다",async({page,context})=>{
  const f=await fixture(context),invite=`/p/${f.link.inviteToken}`,availability=`${invite}/availability`;
  await page.setViewportSize({width:393,height:852});await page.goto(availability);
  await page.getByRole("button",{name:"약속 정보 열기",exact:true}).click();
  await page.getByRole("dialog",{name:"약속 정보",exact:true}).getByRole("link",{name:"참여자 관리",exact:true}).click();
  const back=page.getByRole("link",{name:"이전 화면으로",exact:true});
  await expect(back).toBeVisible();await expect(back).toHaveAttribute("href",availability);
  await page.getByRole("button",{name:"다음방장 내보내기",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"내보내기",exact:true}).click();
  await expect(page.getByRole("button",{name:"다음방장 내보내기",exact:true})).toHaveCount(0);
  await page.reload();await back.click();await expect(page).toHaveURL(availability);
  await expect(page.getByRole("heading",{name:"가능 시간 입력",exact:true})).toBeVisible();
  await page.goto(invite);await page.getByRole("link",{name:"참여자 관리",exact:true}).click();
  await back.click();await expect(page).toHaveURL(invite);
  await db.promiseRecord.update({where:{id:f.promise.id},data:{status:"confirmed",confirmedStartAt:new Date(Date.now()+86400000)}});
  await page.goto(`${invite}/result`);await page.getByRole("link",{name:"참여자 · 나가기",exact:true}).click();
  await back.click();await expect(page).toHaveURL(`${invite}/result`);
  await expect(page.getByRole("heading",{name:"약속 확정",exact:true})).toBeVisible();
  for(const suffix of ["","?from=https%3A%2F%2Fexample.com"]){
    await page.goto(`${f.path}${suffix}`);await expect(back).toHaveAttribute("href",invite);
  }
  await page.screenshot({path:"test-results/participants-back-393.png",fullPage:true});
});
