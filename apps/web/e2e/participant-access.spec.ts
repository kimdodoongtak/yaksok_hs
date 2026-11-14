import { test, expect } from "@playwright/test";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPin, newToken, tokenHash } from "../src/lib/invitation/security";
import { verifyTestDatabase } from "../scripts/test-database.mjs";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
const links: string[] = [];
let verified = false;
test.beforeAll(async () => { await verifyTestDatabase(process.env.TEST_DATABASE_URL); verified = true; });
test.afterAll(async () => {
  if (verified) {
    await db.participantSession.deleteMany({ where: { participant: { promise: { promiseLinkId: { in: links } } } } });
    await db.participant.deleteMany({ where: { promise: { promiseLinkId: { in: links } } } });
    await db.promiseRecord.deleteMany({ where: { promiseLinkId: { in: links } } });
    await db.promiseLink.deleteMany({ where: { id: { in: links } } });
    await db.authAttempt.deleteMany({ where: { keyHash: tokenHash(JSON.stringify(["ip", "unknown"])) } });
  }
  await db.$disconnect();
});
async function fixture(limit = 5) {
  const link = await db.promiseLink.create({ data: { inviteToken: newToken() } });
  links.push(link.id);
  const start = new Date(Date.now() + 86400000);
  const end = new Date(Date.now() + 7 * 86400000);
  const promise = await db.promiseRecord.create({ data: {
    promiseLinkId: link.id, status: "collecting", participantLimit: limit,
    dateRangeStart: start, dateRangeEnd: end, dailyStartMinute: 540, dailyEndMinute: 1080, durationMinutes: 120,
    votingDeadlineAt: start,
  } });
  await db.participant.create({ data: { promiseId: promise.id, nickname: "방장", normalizedNickname: "방장", passwordHash: await hashPin("1234"), role: "host" } });
  return { link, promise };
}
test("친구 참여 → 로그아웃 → 재로그인 → PIN 변경 → 새 PIN 로그인", async ({ page, context }) => {
  const { link } = await fixture();
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(`/p/${link.inviteToken}`);
  await expect(page.getByRole("heading", { name: "약속 참여" })).toBeVisible();
  for (const width of [320, 393, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/participant-access-entry-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "다시 로그인", exact: true }).click();
    await page.screenshot({ path: `test-results/participant-access-login-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "처음 참여", exact: true }).click();
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByLabel("닉네임", { exact: true }).fill("친구😀");
  await page.getByLabel("PIN", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "약속에 참여하기", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("이모지 없이");
  await page.getByLabel("닉네임", { exact: true }).fill("아이리스");
  await page.getByLabel("PIN", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "약속에 참여하기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "참여 정보" })).toBeVisible();
  await page.screenshot({ path: "test-results/participant-access-member-393.png", fullPage: true });
  const cookie = (await context.cookies()).find(c => c.name.startsWith("promise_"));
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: `/p/${link.inviteToken}` });
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.getByRole("button", { name: "다시 로그인", exact: true }).click();
  await page.getByLabel("닉네임", { exact: true }).fill("아이리스");
  await page.getByLabel("PIN", { exact: true }).fill("0000");
  await page.getByRole("button", { name: "로그인하기", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("닉네임과 PIN을 확인");
  await expect(page.getByLabel("닉네임", { exact: true })).toHaveValue("아이리스");
  await page.getByLabel("PIN", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "로그인하기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "참여 정보" })).toBeVisible();
  await page.getByRole("button", { name: "PIN 변경", exact: true }).click();
  await page.screenshot({ path: "test-results/participant-access-pin-393.png", fullPage: true });
  await page.getByLabel("현재 PIN", { exact: true }).fill("1234");
  await page.getByLabel("새 PIN", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "PIN 변경하기", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("현재 PIN과 다른 PIN을 입력해 주세요.");
  await expect(page.getByRole("heading", { name: "참여 정보" })).toBeVisible();
  await page.getByLabel("현재 PIN", { exact: true }).fill("1234");
  await page.getByLabel("새 PIN", { exact: true }).fill("5678");
  await page.getByRole("button", { name: "PIN 변경하기", exact: true }).click();
  await expect(page.getByText("PIN을 변경했어요. 새 PIN으로 다시 로그인해 주세요.")).toBeVisible();
  await page.getByLabel("닉네임", { exact: true }).fill("아이리스");
  await page.getByLabel("PIN", { exact: true }).fill("5678");
  await page.getByRole("button", { name: "로그인하기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "참여 정보" })).toBeVisible();
});
test("정원 마감 안내·PIN 차단과 취소·링크 만료의 공개 범위를 확인한다", async ({ page }) => {
  const { link, promise } = await fixture(2);
  await db.participant.create({ data: { promiseId: promise.id, nickname: "마지막친구", normalizedNickname: "마지막친구", passwordHash: await hashPin("5678"), role: "member" } });
  await page.goto(`/p/${link.inviteToken}`);
  await expect(page.getByText("정원이 가득 찼어요. 기존 참여자는 로그인할 수 있어요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "처음 참여", exact: true })).toHaveCount(0);
  await page.getByLabel("닉네임", { exact: true }).fill("방장");
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("PIN", { exact: true }).fill("0000");
    await page.getByRole("button", { name: "로그인하기", exact: true }).click();
    await expect(page.getByRole("button", { name: "로그인하기", exact: true })).toBeEnabled();
    await expect(page.getByLabel("PIN", { exact: true })).toHaveValue("");
  }
  await expect(page.getByRole("main").getByRole("alert")).toContainText("10분 후");
  await expect(page.getByRole("main").getByRole("alert").locator("time")).toBeVisible();
  const until = await page.getByRole("main").getByRole("alert").locator("time").getAttribute("datetime");
  await page.getByLabel("PIN", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "로그인하기", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert").locator("time")).toHaveAttribute("datetime", until!);
  await db.promiseRecord.update({ where: { id: promise.id }, data: { status: "closed" } });
  await page.reload();
  await expect(page.getByText("참여 모집이 마감됐어요. 기존 참여자는 로그인할 수 있어요.")).toBeVisible();
  await db.promiseRecord.update({ where: { id: promise.id }, data: { status: "cancelled", cancelledAt: new Date() } });
  await page.reload();
  await expect(page.getByRole("heading", { name: "취소된 약속입니다." })).toBeVisible();
  await expect(page.getByLabel("닉네임", { exact: true })).toHaveCount(0);
  expect(await (await page.request.get(`/p/${link.inviteToken}/state`)).json()).toEqual({ state: "cancelled" });
  await db.promiseLink.update({ where: { id: link.id }, data: { createdAt: new Date(Date.now() - 100 * 86400000) } });
  await page.reload();
  await expect(page.getByRole("heading", { name: "만료된 약속입니다" })).toBeVisible();
  expect(await (await page.request.get(`/p/${link.inviteToken}/state`)).json()).toEqual({ state: "expired" });
});
for (const reason of ["정원 도달", "응답 마감"] as const) {
  test(`참여 화면을 열어 둔 사이 ${reason} 시 로그인 탭과 폼이 함께 전환된다`, async ({ page }) => {
    const { link, promise } = await fixture(2);
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(`/p/${link.inviteToken}`);
    await expect(page.getByRole("button", { name: "처음 참여", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "약속에 참여하기", exact: true })).toBeVisible();

    if (reason === "정원 도달") {
      await db.participant.create({ data: { promiseId: promise.id, nickname: "마지막친구", normalizedNickname: "마지막친구", passwordHash: await hashPin("5678"), role: "member" } });
    } else {
      await db.promiseRecord.update({ where: { id: promise.id }, data: { votingDeadlineAt: new Date(Date.now() - 1000) } });
    }

    // 새로고침 없이 실제 상태 조회를 통해 전환되는 화면을 검증한다.
    await expect(page.getByRole("button", { name: "로그인하기", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "처음 참여", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다시 로그인", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: `test-results/participant-access-transition-${reason === "정원 도달" ? "full" : "closed"}.png`, fullPage: true });
    await page.getByLabel("닉네임", { exact: true }).fill("방장");
    await page.getByLabel("PIN", { exact: true }).fill("1234");
    await page.getByRole("button", { name: "로그인하기", exact: true }).click();
    await expect(page.getByRole("button", { name: "로그아웃", exact: true })).toBeVisible();
    expect(await db.participant.count({ where: { promiseId: promise.id } })).toBe(reason === "정원 도달" ? 2 : 1);
  });
}

test("외부 출처와 Origin 없는 변경 요청은 등록을 만들지 않는다", async ({ page }) => {
  const { link, promise } = await fixture();
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임", { exact: true }).fill("출처친구");
  await page.getByLabel("PIN", { exact: true }).fill("1234");
  let actionHeaders: Record<string, string> = {};
  let body: Buffer | null = null;
  await page.route(`**/p/${link.inviteToken}`, async route => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    actionHeaders = await request.allHeaders();
    body = request.postDataBuffer();
    await route.fulfill({ status: 400, body: "blocked for origin replay" });
  });
  await page.getByRole("button", { name: "약속에 참여하기", exact: true }).click();
  await expect.poll(() => Boolean(body)).toBe(true);
  await page.unroute(`**/p/${link.inviteToken}`);
  const replayHeaders: Record<string, string> = { ...actionHeaders, origin: "https://external.example" };
  delete replayHeaders["content-length"];
  const outside = await page.request.post(`/p/${link.inviteToken}`, { headers: replayHeaders, data: body! });
  expect(outside.status()).toBeGreaterThanOrEqual(400);
  const missing = { ...replayHeaders };
  delete missing.origin;
  const noOrigin = await page.request.post(`/p/${link.inviteToken}`, { headers: missing, data: body! });
  expect(await noOrigin.text()).toContain("요청 출처를 확인할 수 없어요");
  expect(await db.participant.count({ where: { promiseId: promise.id } })).toBe(1);
});
