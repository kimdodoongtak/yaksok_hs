import { test, expect } from "@playwright/test";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { verifyTestDatabase } from "../scripts/test-database.mjs";
import { tokenHash } from "../src/lib/invitation/security";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
const links: string[] = [];
const creationKey = tokenHash(JSON.stringify(["ip", "invite-create:unknown"]));
let verified = false;
test.beforeAll(async () => {
  await verifyTestDatabase(process.env.TEST_DATABASE_URL);
  verified = true;
});
test.afterAll(async () => {
  if (verified) {
    await db.authAttempt.deleteMany({ where: { keyHash: creationKey } });
    await db.participantSession.deleteMany({ where: { participant: { promise: { promiseLinkId: { in: links } } } } });
    await db.participant.deleteMany({ where: { promise: { promiseLinkId: { in: links } } } });
    await db.promiseRecord.deleteMany({ where: { promiseLinkId: { in: links } } });
    await db.promiseLink.deleteMany({ where: { id: { in: links } } });
  }
  await db.$disconnect();
});

test("홈에서 약속을 만들어 방장 등록·설정 후 초대 링크를 공유한다", async ({ page, context, browser }) => {
  const before = await db.promiseLink.count();
  await page.goto("/");
  await page.reload();
  expect(await db.promiseLink.count()).toBe(before);
  await expect(page.getByRole("button", { name: "약속 만들기", exact: true })).toBeVisible();
  for (const width of [320, 393, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    await page.screenshot({ path: `test-results/home-create-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "약속 만들기", exact: true }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]{43}$/);
  const invitePath = new URL(page.url()).pathname;
  const link = await db.promiseLink.findUniqueOrThrow({ where: { inviteToken: invitePath.split("/").at(-1)! }, include: { promise: true } });
  links.push(link.id);
  expect(await db.promiseLink.count()).toBe(before + 1);
  expect(link.promise).toBeNull();
  await expect(page.getByRole("heading", { name: "방장 등록" })).toBeVisible();
  await page.getByLabel("닉네임").fill("웹방장");
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  await expect(page).toHaveURL(`${invitePath}/settings`);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "모집 시작", exact: true }).click();
  await expect(page.getByRole("heading", { name: "약속이 준비됐어요" })).toBeVisible();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "초대 링크 복사", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(invitePath, page.url()).href);
  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage();
    await guest.goto(invitePath);
    await expect(guest.getByLabel("닉네임")).toBeVisible();
    await expect(guest.getByRole("button", { name: "방장으로 시작하기" })).toHaveCount(0);
    expect((await db.promiseRecord.findUniqueOrThrow({ where: { promiseLinkId: link.id } })).status).toBe("collecting");
  } finally {
    await guestContext.close();
  }
});

// 처리 중·오류 UI의 사후 검증. 요청 제한은 실제 테스트 DB로 발생시킨다.
test("생성 중 연타를 막고 제한 안내 후 키보드로 다시 만들 수 있다", async ({ page }) => {
  const data = { failures: 30, expiresAt: new Date(Date.now() + 600_000) };
  await db.authAttempt.upsert({ where: { keyHash: creationKey }, create: { keyHash: creationKey, ...data }, update: data });
  const before = await db.promiseLink.count();
  await page.goto("/");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/*", async route => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "약속 만들기", exact: true }).click();
    await expect(page.getByRole("button", { name: "만드는 중…" })).toBeDisabled();
  } finally { release(); }
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.");
  expect(await db.promiseLink.count()).toBe(before);
  const create = page.getByRole("button", { name: "약속 만들기", exact: true });
  await expect(create).toBeEnabled();
  await page.screenshot({ path: "test-results/home-create-error.png" });
  await db.authAttempt.update({ where: { keyHash: creationKey }, data: { expiresAt: new Date(0) } });
  await create.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/p\/[\w-]{43}$/);
  const link = await db.promiseLink.findUniqueOrThrow({ where: { inviteToken: new URL(page.url()).pathname.split("/").at(-1)! } });
  links.push(link.id);
  expect(await db.promiseLink.count()).toBe(before + 1);
});
