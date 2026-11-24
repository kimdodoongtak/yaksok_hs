import { calendarDay, selectDateRange, selectDeadline } from "./settings-calendar";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes } from "node:crypto";
import { verifyTestDatabase } from "../scripts/test-database.mjs";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }),
});
const links: string[] = [];
let verified = false;

test.beforeAll(async () => {
  await verifyTestDatabase(process.env.TEST_DATABASE_URL);
  verified = true;
});

test.afterAll(async () => {
  if (verified) {
    await db.participantSession.deleteMany({
      where: { participant: { promise: { promiseLinkId: { in: links } } } },
    });
    await db.participant.deleteMany({
      where: { promise: { promiseLinkId: { in: links } } },
    });
    await db.promiseRecord.deleteMany({
      where: { promiseLinkId: { in: links } },
    });
    await db.promiseLink.deleteMany({ where: { id: { in: links } } });
  }
  await db.$disconnect();
});

async function fixture() {
  const link = await db.promiseLink.create({
    data: { inviteToken: randomBytes(32).toString("base64url") },
  });
  links.push(link.id);
  return link;
}

test("시간 직접 입력은 숫자 키패드·화살표·단계 이동·저장을 함께 지원한다", async ({ page }) => {
  const link = await fixture();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("직접입력방장");
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  const start = page.getByRole("textbox", { name: "하루 시작", exact: true });
  const end = page.getByRole("textbox", { name: "하루 종료", exact: true });
  const hours = page.getByRole("textbox", { name: "최소 소요 시간 (시간)", exact: true });
  const minutes = page.getByRole("textbox", { name: "최소 소요 시간 (분)", exact: true });
  for (const field of [start, end, hours, minutes]) await expect(field).toHaveAttribute("inputmode", "numeric");
  await start.fill("930"); await start.press("Enter");
  await expect(start).toHaveValue("09:30");
  await expect(page.getByRole("button", { name: "다음", exact: true })).toBeVisible();
  await end.fill("18"); await end.blur();
  await expect(end).toHaveValue("18:00");
  await hours.fill("3"); await minutes.fill("30"); await minutes.blur();
  await expect(hours).toHaveValue("03");
  await expect(page.locator('[name="durationMinutes"]')).toHaveValue("210");
  await page.getByRole("button", { name: "최소 소요 시간 30분 늘리기" }).click();
  await expect(hours).toHaveValue("04"); await expect(minutes).toHaveValue("00");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/settings-direct-time-320.png", fullPage: true });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText(/매일 09:30–18:00 · 최소 4시간/)).toBeVisible();
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await expect(start).toHaveValue("09:30"); await expect(hours).toHaveValue("04");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "모집 시작", exact: true }).click();
  await expect.poll(async () => db.promiseRecord.findUnique({ where: { promiseLinkId: link.id }, select: { status: true, dailyStartMinute: true, dailyEndMinute: true, durationMinutes: true } })).toEqual({ status: "collecting", dailyStartMinute: 570, dailyEndMinute: 1080, durationMinutes: 240 });
});

test("모바일 시간 직접 입력은 숫자 칸 터치로 포커스하고 편집한다", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 393, height: 740 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage(), link = await fixture();
    await page.goto(`http://127.0.0.1:3100/p/${link.inviteToken}`);
    await page.getByLabel("닉네임").fill("터치입력방장"); await page.getByLabel("PIN").fill("1234");
    await page.getByRole("button", { name: "방장으로 시작하기" }).tap();
    const start = page.getByRole("textbox", { name: "하루 시작", exact: true });
    await start.tap(); await expect(start).toBeFocused();
    await start.fill("1030"); await start.press("Enter"); await expect(start).toHaveValue("10:30");
    const minutes = page.getByRole("textbox", { name: "최소 소요 시간 (분)", exact: true });
    await minutes.tap(); await expect(minutes).toBeFocused();
    await minutes.fill("30"); await minutes.press("Enter");
    await expect(page.locator('[name="durationMinutes"]')).toHaveValue("150");
    expect(await start.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
  } finally { await context.close(); }
});

test("시간 직접 입력 오류는 값을 보존하고 다음 단계를 막으며 화살표로 복구된다", async ({ page }) => {
  const link = await fixture(); await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("입력오류방장"); await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  const start = page.getByRole("textbox", { name: "하루 시작", exact: true });
  const end = page.getByRole("textbox", { name: "하루 종료", exact: true });
  const hours = page.getByRole("textbox", { name: "최소 소요 시간 (시간)", exact: true });
  const minutes = page.getByRole("textbox", { name: "최소 소요 시간 (분)", exact: true });
  await start.fill("915"); await start.blur();
  await expect(start).toHaveAttribute("aria-invalid", "true"); await expect(start).toHaveValue("915");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(start).toBeVisible();
  await page.getByRole("button", { name: "하루 시작 30분 늘리기" }).click();
  await expect(start).toHaveValue("09:30");
  await end.fill("0"); await end.blur(); await expect(end).toHaveAttribute("aria-invalid", "true");
  await end.fill("2400"); await end.blur(); await expect(end).toHaveValue("24:00");
  await hours.fill("24"); await minutes.fill("30"); await minutes.blur();
  await expect(minutes).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator('[name="durationMinutes"]')).toHaveValue("");
  await hours.fill(""); await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(hours).toBeVisible(); await expect(hours).toHaveValue("");
  await hours.fill("0"); await minutes.fill("30"); await minutes.blur();
  await expect(page.locator('[name="durationMinutes"]')).toHaveValue("30");
  await minutes.fill("15"); await minutes.blur();
  await page.getByRole("button", { name: "최소 소요 시간 30분 늘리기" }).click();
  await expect(hours).toHaveValue("01"); await expect(minutes).toHaveValue("00");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("button", { name: "모집 시작", exact: true })).toBeVisible();
});

function kstDate(daysFromToday: number) {
  const date = new Date(Date.now() + 9 * 60 * 60 * 1000);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function addCalendarMonth(dateText: string) {
  const [year, month, day] = dateText.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return [
    year + Math.floor(month / 12),
    String((month % 12) + 1).padStart(2, "0"),
    String(Math.min(day, lastDay)).padStart(2, "0"),
  ].join("-");
}

test("시작일을 바꿔도 기본 마감은 오늘부터 7일 뒤이고 직접 선택한 마감은 유지한다", async ({ page }) => {
  const link = await fixture();
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("마감방장");
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  await selectDateRange(page, kstDate(14), kstDate(40));
  await page.getByRole("button", { name: "다음", exact: true }).click();
  const deadline = page.locator('input[name="votingDeadline"]');
  await expect(deadline).toHaveValue(`${kstDate(7)}T23:59`);

  await page.getByRole("button", { name: "이전", exact: true }).click();
  await selectDateRange(page, kstDate(15), kstDate(40));
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(deadline).toHaveValue(`${kstDate(7)}T23:59`);

  const customDeadline = `${kstDate(3)}T23:59`;
  await selectDeadline(page, customDeadline);
  const limit = page.getByRole("spinbutton", { name: "정원", exact: true });
  await limit.dblclick();
  await limit.fill("1");
  await page.getByRole("button", { name: "모집 시작", exact: true }).click();
  await expect(page.getByText("정원은 방장을 포함해 2~30명으로 입력해 주세요.")).toBeVisible();
  await expect(deadline).toHaveValue(customDeadline);
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await selectDateRange(page, kstDate(16), kstDate(40));
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(deadline).toHaveValue(customDeadline);
  await limit.dblclick();
  await limit.fill("5");
  await page.getByRole("button", { name: "모집 시작", exact: true }).click();
  await expect(page.getByRole("heading", { name: "약속이 준비됐어요" })).toBeVisible();
  const saved = await db.promiseRecord.findUniqueOrThrow({ where: { promiseLinkId: link.id } });
  expect(saved.votingDeadlineAt!.toISOString()).toBe(`${kstDate(3)}T14:59:00.000Z`);
});

test("단계별 오류를 복구하고 수정한 입력을 유지한다", async ({ page }) => {
  const link = await fixture();
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("단계방장");
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  // 달력에서 차단한 과거 날짜도 변조된 폼 값으로 전달되면 검증해야 한다.
  await page.locator('[name="dateRangeStart"]').evaluate((element, value) => {
    (element as HTMLInputElement).value = value;
  }, kstDate(-1));
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("시작일은 KST 기준 오늘 이후 날짜로 선택해 주세요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "약속 날짜 선택", exact: true })).toBeVisible();
  await selectDateRange(page, kstDate(0), kstDate(7));
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "정원 늘리기" }).click();
  const deadline = `${kstDate(1)}T23:59`;
  await selectDeadline(page, deadline);
  const draft = await db.promiseRecord.findUniqueOrThrow({ where: { promiseLinkId: link.id } });
  expect(draft.status).toBe("draft");

  // 2단계에서 숨겨진 1단계 값을 변조해 서버 검증 실패의 복구 경로를 확인한다.
  await page.locator('[name="durationMinutes"]').evaluate((element) => {
    (element as HTMLInputElement).value = "0";
  });
  await page.getByRole("button", { name: "모집 시작", exact: true }).click();
  await expect(page.getByRole("heading", { name: "날짜와 시간" })).toBeFocused();
  await expect(page.getByText("소요 시간은 하루 시간 범위 안에서 30분 단위로 입력해 주세요.")).toBeVisible();
  await page.getByRole("button", { name: "최소 소요 시간 30분 늘리기" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "정원", exact: true })).toHaveValue("6");
  await expect(page.locator('input[name="votingDeadline"]')).toHaveValue(deadline);
  await expect(page.getByText("입력한 내용을 확인해 주세요.")).not.toBeVisible();
});

test("방장이 모바일 설정을 완료하면 세션이 연장되고 초대 링크를 복사할 수 있다", async ({
  page,
  context,
}) => {
  const link = await fixture();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("설정방장");
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();

  await expect(page.getByRole("heading", { name: "약속 설정" })).toBeVisible();
  await expect(page.getByRole("button", { name: "약속 날짜 선택", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "모집 시작", exact: true })).toHaveCount(0);
  await expect(page.getByRole("grid", { name: "날짜 범위 달력" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "최소 소요 시간 30분 늘리기" })).toBeVisible();
  await page.screenshot({ path: "test-results/promise-settings-step-1-393.png", fullPage: true });
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/promise-settings-step-1-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("heading", { name: "모집 설정" })).toBeFocused();
  const participantLimit = page.getByRole("spinbutton", {
    name: "정원",
    exact: true,
  });
  await expect(participantLimit).toHaveValue("5");
  await expect(participantLimit).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "정원 늘리기" }).click();
  await expect(participantLimit).toHaveValue("6");
  await page.getByRole("button", { name: "정원 줄이기" }).click();
  await expect(participantLimit).toHaveValue("5");
  await participantLimit.dblclick();
  await expect(participantLimit).not.toHaveAttribute("readonly", "");
  await participantLimit.fill("5");
  await expect(page.getByText("최대 30명")).toBeVisible();
  await expect(page.locator('input[name="votingDeadline"]')).toHaveValue(`${kstDate(7)}T23:59`);
  await page.getByRole("heading", { name: "모집 설정" }).focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  const submitBounds = await page.getByRole("button", { name: "모집 시작", exact: true }).boundingBox();
  expect(submitBounds!.y + submitBounds!.height).toBeLessThanOrEqual(852);
  await page.screenshot({ path: "test-results/promise-settings-step-2-393.png", fullPage: true });
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/promise-settings-step-2-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await expect(page.locator('input[name="dateRangeStart"]')).toHaveValue(kstDate(0));
  await expect(page.locator('input[name="dateRangeEnd"]')).toHaveValue(addCalendarMonth(kstDate(0)));
  const dailyStart = page.locator('[name="dailyStart"]');
  const dailyEnd = page.locator('[name="dailyEnd"]');
  await expect(dailyStart).toHaveValue("09:00");
  await expect(dailyEnd).toHaveValue("24:00");
  const startUp = page.getByRole("button", { name: "하루 시작 30분 늘리기" });
  const startDown = page.getByRole("button", { name: "하루 시작 30분 줄이기" });
  const endUp = page.getByRole("button", { name: "하루 종료 30분 늘리기" });
  const endDown = page.getByRole("button", { name: "하루 종료 30분 줄이기" });
  await expect(startUp).toBeVisible();
  await expect(page.getByRole("group", { name: "하루 시간 선택" })).toHaveCount(0);
  await startUp.press("Enter");
  await expect(dailyStart).toHaveValue("09:30");
  await startUp.click();
  await expect(dailyStart).toHaveValue("10:00");
  await startDown.click();
  await expect(dailyStart).toHaveValue("09:30");
  for (let slot = 0; slot < 19; slot++) await startDown.click();
  await expect(dailyStart).toHaveValue("00:00");
  await expect(startDown).toBeDisabled();
  for (let slot = 0; slot < 19; slot++) await startUp.click();
  await expect(dailyStart).toHaveValue("09:30");
  await expect(endUp).toBeDisabled();
  await endDown.click();
  await expect(dailyEnd).toHaveValue("23:30");
  await endUp.click();
  await expect(dailyEnd).toHaveValue("24:00");

  const durationPicker = page.getByRole("group", { name: "최소 소요 시간" });
  await expect(durationPicker.getByRole("button")).toHaveCount(2);
  const durationValue = page.locator('input[name="durationMinutes"]');
  const durationLabel = durationPicker.getByRole("status");
  const durationUp = durationPicker.getByRole("button", { name: "최소 소요 시간 30분 늘리기" });
  const durationDown = durationPicker.getByRole("button", { name: "최소 소요 시간 30분 줄이기" });
  await expect(durationLabel).toHaveAccessibleName("2시간");
  await durationUp.click();
  await expect(durationLabel).toHaveAccessibleName("2시간 30분");
  await expect(durationValue).toHaveValue("150");
  await durationUp.click();
  await expect(durationLabel).toHaveAccessibleName("3시간");
  await expect(durationValue).toHaveValue("180");
  for (let slot = 0; slot < 5; slot++) await durationDown.click();
  await expect(durationLabel).toHaveAccessibleName("30분");
  await expect(durationDown).toBeDisabled();
  for (let slot = 0; slot < 3; slot++) await durationUp.click();
  await expect(durationValue).toHaveValue("120");
  await expect(page.getByText("한국 시간(KST) 기준이에요.")).toHaveCount(0);
  await page.getByRole("button", { name: "약속 날짜 선택", exact: true }).click();
  const calendar = page.getByRole("grid", { name: "날짜 범위 달력" });
  await expect(calendar).toBeVisible();
  await expect(calendar.locator('[aria-current="date"]')).toHaveCount(1);
  expect(await calendar.locator("button:disabled").count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: "test-results/promise-settings-form-mobile-393.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: "test-results/promise-settings-form-desktop-1280.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: "test-results/promise-settings-form-mobile-320.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 393, height: 852 });
  await (await calendarDay(page, kstDate(1))).click();
  await (await calendarDay(page, kstDate(2))).click();
  await page.getByRole("button", { name: "선택 완료", exact: true }).click();
  await expect(page.locator('input[name="dateRangeStart"]')).toHaveValue(kstDate(1));
  await expect(page.locator('input[name="dateRangeEnd"]')).toHaveValue(kstDate(2));
  await page.screenshot({
    path: "test-results/promise-settings-range-mobile-393.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await participantLimit.dblclick();
  await participantLimit.fill("1");
  await selectDeadline(page, `${kstDate(0)}T23:59`);
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await expect(page.locator('input[name="dateRangeStart"]')).toHaveValue(kstDate(1));
  await expect(dailyStart).toHaveValue("09:30");
  await expect(durationValue).toHaveValue("120");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(participantLimit).toHaveValue("1");
  await page.getByRole("button", { name: "모집 시작" }).click();
  await expect(
    page.getByText("정원은 방장을 포함해 2~30명으로 입력해 주세요."),
  ).toBeVisible();
  await expect(dailyStart).toHaveValue("09:30");
  await expect(dailyEnd).toHaveValue("24:00");

  await participantLimit.dblclick();
  await participantLimit.fill("10");
  const savedResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().includes(`/p/${link.inviteToken}`),
  );
  await page.getByRole("button", { name: "모집 시작" }).click();
  const savedHeaders = await (await savedResponse).headersArray();
  await expect(page.getByRole("heading", { name: "약속이 준비됐어요" })).toBeVisible();
  const ticket = page.getByRole("region", { name: "초대 티켓" });
  await expect(ticket).toBeVisible();
  await expect(ticket.locator(`time[datetime="${kstDate(1)}"]`)).toBeVisible();
  await expect(ticket.locator(`time[datetime="${kstDate(2)}"]`)).toBeVisible();
  await expect(ticket.getByText("09:30–24:00")).toBeVisible();
  await expect(ticket.getByText("2시간", { exact: true })).toBeVisible();
  const stamp = ticket.getByText("초대 준비 완료", { exact: true });
  await expect(stamp).toBeVisible();
  await expect(stamp).not.toHaveCSS("animation-name", "none");
  await stamp.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await expect(page.getByRole("button", { name: "초대 링크 복사" })).toBeVisible();
  await page.getByRole("button", { name: "초대 링크 복사" }).click();
  await expect(page.getByRole("button", { name: "복사했어요" })).toBeVisible();
  expect(await stamp.evaluate((element) => element.getAnimations().some((animation) => animation.playState === "running"))).toBe(false);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${new URL(page.url()).origin}/p/${link.inviteToken}`,
  );

  const promise = await db.promiseRecord.findUniqueOrThrow({
    where: { promiseLinkId: link.id },
    include: { participants: { include: { sessions: true } } },
  });
  expect(promise).toMatchObject({
    status: "collecting",
    participantLimit: 10,
    dailyStartMinute: 570,
    dailyEndMinute: 1440,
    durationMinutes: 120,
  });
  expect(promise.participants[0].sessions[0].expiresAt.getTime()).toBe(
    promise.votingDeadlineAt!.getTime() + 7 * 86_400_000,
  );
  const cookie = (await context.cookies()).find((item) =>
    item.name.startsWith("promise_"),
  );
  expect(cookie).toBeDefined();
  // 브라우저가 보정한 만료값 대신 서버가 실제 전송한 Expires 계약을 검증한다.
  const sessionHeader = savedHeaders.find((header) =>
    header.name.toLowerCase() === "set-cookie" && header.value.startsWith(`${cookie!.name}=`),
  );
  const expires = sessionHeader?.value.match(/(?:^|;)\s*expires=([^;]+)/i)?.[1];
  expect(expires).toBeDefined();
  expect(Date.parse(expires!)).toBe(promise.participants[0].sessions[0].expiresAt.getTime());
  expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: "test-results/promise-settings-mobile-393.png",
    fullPage: true,
  });
  await page.reload();
  await expect(ticket).toBeVisible();
  await expect(stamp).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/p/${link.inviteToken}/settings?invitation=ready`);
  await expect(stamp).toHaveCSS("animation-name", "none");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/promise-invitation-320.png", fullPage: true });
  await context.clearCookies();
  await page.reload();
  await expect(ticket).toHaveCount(0);
});

test("설정 단계를 바꾸면 스크롤을 맨 위로 옮기고 입력값과 제목 포커스를 유지한다", async ({ page }) => {
  const link = await fixture();
  await page.setViewportSize({ width: 320, height: 500 });
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("스크롤방장");
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  await page.getByRole("button", { name: "최소 소요 시간 30분 늘리기" }).click();
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByRole("heading", { name: "모집 설정", exact: true })).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole("heading", { name: "약속 설정", exact: true })).toBeInViewport();
    await expect(page.getByText(/매일 .*최소 2시간 30분/)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "이전", exact: true }).click();
    await expect(page.getByRole("heading", { name: "날짜와 시간", exact: true })).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator('input[name="durationMinutes"]')).toHaveValue("150");
  }
  await page.screenshot({ path: "test-results/settings-step-scroll-320.png" });
});

test("설정 진입 시 날짜·시간·소요 시간과 다음 버튼이 첫 화면에 보인다", async ({ page }) => {
  const link = await fixture();
  await page.setViewportSize({ width: 393, height: 700 });
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("화면방장");
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  await expect(page.getByRole("button", { name: "약속 날짜 선택", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  for (const control of [
    page.getByRole("button", { name: "약속 날짜 선택", exact: true }),
    page.getByRole("button", { name: "하루 시작 30분 늘리기" }),
    page.getByRole("button", { name: "하루 종료 30분 늘리기" }),
    page.getByRole("button", { name: "최소 소요 시간 30분 늘리기" }),
    page.getByRole("button", { name: "다음", exact: true }),
  ]) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(700);
  }
  await page.screenshot({ path: "test-results/settings-first-viewport-393x700.png", fullPage: true });
  const calendarButton = page.getByRole("button", { name: "약속 날짜 선택", exact: true });
  await calendarButton.click();
  await expect(page.getByRole("dialog", { name: "날짜 범위 선택" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(calendarButton).toBeFocused();
});

test("날짜 입력칸 대신 달력에서 기간을 선택하고 취소·하루·90일 경계를 처리한다",async({page})=>{
  const link=await fixture();await page.setViewportSize({width:393,height:852});await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("달력방장");await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button",{name:"방장으로 시작하기"}).click();
  await expect(page.getByRole("heading",{name:"약속 설정",exact:true})).toBeVisible();
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
  const trigger=page.getByRole("button",{name:"약속 날짜 선택",exact:true});
  const start=page.locator('input[name="dateRangeStart"]'),end=page.locator('input[name="dateRangeEnd"]');
  await expect(trigger).toContainText(kstDate(0).replaceAll("-","."));
  await trigger.click();await (await calendarDay(page,kstDate(1))).click();
  await expect(page.getByRole("button",{name:"선택 완료",exact:true})).toBeDisabled();
  await page.keyboard.press("Escape");await expect(trigger).toBeFocused();
  await expect(start).toHaveValue(kstDate(0));await expect(end).toHaveValue(addCalendarMonth(kstDate(0)));
  await selectDateRange(page,kstDate(14),kstDate(40));
  await expect(start).toHaveValue(kstDate(14));await expect(end).toHaveValue(kstDate(40));
  await expect(trigger).toContainText(kstDate(40).replaceAll("-","."));
  await selectDateRange(page,kstDate(20),kstDate(20));
  await expect(start).toHaveValue(kstDate(20));await expect(end).toHaveValue(kstDate(20));
  await trigger.click();await (await calendarDay(page,kstDate(0))).click();
  await expect(await calendarDay(page,kstDate(90))).toBeDisabled();
  await (await calendarDay(page,kstDate(89))).click();
  await page.screenshot({path:"test-results/settings-calendar-range-393.png"});
  await page.getByRole("button",{name:"선택 완료",exact:true}).click();
  await expect(start).toHaveValue(kstDate(0));await expect(end).toHaveValue(kstDate(89));
  await page.screenshot({path:"test-results/settings-date-trigger-393.png"});
  await page.getByRole("button",{name:"다음",exact:true}).click();
  await expect(page.getByText(`${kstDate(0).replaceAll("-",".")} → ${kstDate(89).replaceAll("-",".")}`,{exact:true}).filter({ visible: true })).toBeVisible();
});

test("응답 마감은 1주·2주·직접 선택으로 정하고 시간은 23:59로 고정한다", async ({ page }) => {
  const link = await fixture();
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("마감달력");
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  const deadline = page.locator('input[name="votingDeadline"]');
  const week = page.getByRole("button", { name: "1주 뒤", exact: true });
  const fortnight = page.getByRole("button", { name: "2주 뒤", exact: true });
  const custom = page.getByRole("button", { name: "직접 선택", exact: true });
  await expect(week).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("마감 시", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("마감 분", { exact: true })).toHaveCount(0);
  await expect(deadline).toHaveValue(`${kstDate(7)}T23:59`);
  await fortnight.click();
  await expect(deadline).toHaveValue(`${kstDate(14)}T23:59`);
  await custom.click();
  await (await calendarDay(page, kstDate(3), "응답 마감 달력")).click();
  await page.keyboard.press("Escape");
  await expect(custom).toBeFocused();
  await expect(deadline).toHaveValue(`${kstDate(14)}T23:59`);
  await selectDeadline(page, kstDate(3));
  await expect(custom).toHaveAttribute("aria-pressed", "true");
  await expect(deadline).toHaveValue(`${kstDate(3)}T23:59`);
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(deadline).toHaveValue(`${kstDate(3)}T23:59`);
  await week.click();
  for (const width of [320, 393, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/deadline-presets-${width}.png`, fullPage: true });
  }
});

test("짧은 약속은 빠른 마감을 비활성화하고 가능한 직접 선택 날짜를 안내한다", async ({ page }) => {
  const link = await fixture();
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("짧은약속");
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  await selectDateRange(page, kstDate(0), kstDate(3));
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("button", { name: "1주 뒤", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "2주 뒤", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "직접 선택", exact: true }).click();
  await expect(await calendarDay(page, kstDate(3), "응답 마감 달력")).toBeDisabled();
  await (await calendarDay(page, kstDate(2), "응답 마감 달력")).click();
  await page.getByRole("button", { name: "선택 완료", exact: true }).click();
  await expect(page.locator('input[name="votingDeadline"]')).toHaveValue(`${kstDate(2)}T23:59`);
  // 잘못된 폼을 전달해도 최종 서버 검증은 유지한다.
  await page.locator('input[name="votingDeadline"]').evaluate((element, value) => {
    (element as HTMLInputElement).value = value;
  }, `${kstDate(3)}T23:59`);
  await page.getByRole("button", { name: "모집 시작", exact: true }).click();
  await expect(page.getByText("마감 뒤에 약속 시간 전체가 들어가는 시작 시각이 최소 하나 남아야 합니다.")).toBeVisible();
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await selectDateRange(page, kstDate(0), kstDate(0));
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("button", { name: "직접 선택", exact: true })).toBeDisabled();
  await expect(page.getByText("선택할 수 있는 마감일이 없어요. 약속 종료일을 내일 이후로 변경해 주세요.")).toBeVisible();
});
