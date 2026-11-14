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

function kstDateTime(hoursFromNow: number) {
  return new Date(Date.now() + (9 + hoursFromNow) * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}

test("시작일을 바꾸면 기본 마감이 따라가고 직접 편집한 마감은 오류 뒤에도 유지한다", async ({ page }) => {
  const link = await fixture();
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("마감방장");
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  await page.getByLabel("시작일", { exact: true }).fill(kstDate(14));
  await page.getByLabel("종료일", { exact: true }).fill(kstDate(40));
  await page.getByRole("button", { name: "다음", exact: true }).click();
  const deadline = page.getByLabel("응답 마감");
  await expect(deadline).toHaveValue(`${kstDate(21)}T23:59`);

  await page.getByRole("button", { name: "이전", exact: true }).click();
  await page.getByLabel("시작일", { exact: true }).fill(kstDate(15));
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(deadline).toHaveValue(`${kstDate(22)}T23:59`);

  const customDeadline = `${kstDate(3)}T12:00`;
  await deadline.fill(customDeadline);
  const limit = page.getByRole("spinbutton", { name: "정원", exact: true });
  await limit.dblclick();
  await limit.fill("1");
  await page.getByRole("button", { name: "모집 시작", exact: true }).click();
  await expect(page.getByText("정원은 방장을 포함해 2~30명으로 입력해 주세요.")).toBeVisible();
  await expect(deadline).toHaveValue(customDeadline);
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await page.getByLabel("시작일", { exact: true }).fill(kstDate(16));
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(deadline).toHaveValue(customDeadline);
  await limit.dblclick();
  await limit.fill("5");
  await page.getByRole("button", { name: "모집 시작", exact: true }).click();
  await expect(page.getByRole("heading", { name: "약속이 준비됐어요" })).toBeVisible();
  const saved = await db.promiseRecord.findUniqueOrThrow({ where: { promiseLinkId: link.id } });
  expect(saved.votingDeadlineAt!.toISOString()).toBe(`${kstDate(3)}T03:00:00.000Z`);
});

test("단계별 오류를 복구하고 수정한 입력을 유지한다", async ({ page }) => {
  const link = await fixture();
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("단계방장");
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  await page.getByLabel("시작일").fill(kstDate(-1));
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("시작일은 KST 기준 오늘 이후 날짜로 선택해 주세요.")).toBeVisible();
  await expect(page.getByLabel("시작일", { exact: true })).toBeVisible();
  await page.getByLabel("시작일").fill(kstDate(0));
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "정원 늘리기" }).click();
  const deadline = kstDateTime(2);
  await page.getByLabel("응답 마감").fill(deadline);
  const draft = await db.promiseRecord.findUniqueOrThrow({ where: { promiseLinkId: link.id } });
  expect(draft.status).toBe("draft");

  // 2단계에서 숨겨진 1단계 값을 변조해 서버 검증 실패의 복구 경로를 확인한다.
  await page.locator('[name="durationMinutes"]').evaluate((element) => {
    (element as HTMLInputElement).value = "0";
  });
  await page.getByRole("button", { name: "모집 시작", exact: true }).click();
  await expect(page.getByRole("heading", { name: "날짜와 시간" })).toBeFocused();
  await expect(page.getByText("소요 시간은 하루 시간 범위 안에서 30분 단위로 입력해 주세요.")).toBeVisible();
  await page.getByRole("button", { name: "소요 시간 30분 늘리기" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "정원", exact: true })).toHaveValue("6");
  await expect(page.getByLabel("응답 마감")).toHaveValue(deadline);
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
  await expect(page.getByLabel("시작일", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "모집 시작", exact: true })).toHaveCount(0);
  await expect(page.getByRole("grid", { name: "날짜 범위 달력" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "소요 시간 30분 늘리기" })).toBeVisible();
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
  await expect(page.getByLabel("응답 마감")).toHaveValue(`${kstDate(7)}T23:59`);
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
  await expect(page.getByLabel("시작일")).toHaveValue(kstDate(0));
  await expect(page.getByLabel("종료일")).toHaveValue(addCalendarMonth(kstDate(0)));
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

  const durationPicker = page.getByRole("group", { name: "소요 시간" });
  await expect(durationPicker.getByRole("button")).toHaveCount(2);
  const durationValue = page.locator('input[name="durationMinutes"]');
  const durationLabel = durationPicker.getByRole("status");
  const durationUp = durationPicker.getByRole("button", { name: "소요 시간 30분 늘리기" });
  const durationDown = durationPicker.getByRole("button", { name: "소요 시간 30분 줄이기" });
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
  await page.getByRole("button", { name: "달력에서 선택" }).click();
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
  await calendar.locator(`[aria-label="${kstDate(1)} 선택"]`).click();
  await calendar.locator(`[aria-label="${kstDate(2)} 선택"]`).click();
  await page.getByRole("button", { name: "선택 완료", exact: true }).click();
  await expect(page.getByLabel("시작일")).toHaveValue(kstDate(1));
  await expect(page.getByLabel("종료일")).toHaveValue(kstDate(2));
  await page.screenshot({
    path: "test-results/promise-settings-range-mobile-393.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await participantLimit.dblclick();
  await participantLimit.fill("1");
  await page.getByLabel("응답 마감").fill(kstDateTime(1));
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await expect(page.getByLabel("시작일")).toHaveValue(kstDate(1));
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

test("설정 진입 시 날짜·시간·소요 시간과 다음 버튼이 첫 화면에 보인다", async ({ page }) => {
  const link = await fixture();
  await page.setViewportSize({ width: 393, height: 700 });
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("화면방장");
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  await expect(page.getByLabel("시작일", { exact: true })).toBeVisible();
  await expect(page.getByLabel("종료일", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  for (const control of [
    page.getByLabel("시작일", { exact: true }),
    page.getByLabel("종료일", { exact: true }),
    page.getByRole("button", { name: "하루 시작 30분 늘리기" }),
    page.getByRole("button", { name: "하루 종료 30분 늘리기" }),
    page.getByRole("button", { name: "소요 시간 30분 늘리기" }),
    page.getByRole("button", { name: "다음", exact: true }),
  ]) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(700);
  }
  await page.screenshot({ path: "test-results/settings-first-viewport-393x700.png", fullPage: true });
  const calendarButton = page.getByRole("button", { name: "달력에서 선택" });
  await calendarButton.click();
  await expect(page.getByRole("dialog", { name: "날짜 범위 선택" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(calendarButton).toBeFocused();
});
