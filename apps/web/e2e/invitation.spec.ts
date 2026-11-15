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
test("초대 조회 뒤 명시적으로 등록하면 안전한 세션으로 설정 화면에 진입한다", async ({
  page,
  context,
}) => {
  const link = await fixture();
  await page.goto(`/p/${link.inviteToken}`);
  await expect(
    page.getByRole("heading", { name: "방장 등록" }),
  ).toBeVisible();
  expect(
    await db.promiseRecord.count({ where: { promiseLinkId: link.id } }),
  ).toBe(0);
  await page.getByLabel("닉네임").fill(" 뿅땨 ");
  await page.getByLabel("PIN").fill("0012");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${link.inviteToken}/settings$`));
  await expect(page.getByText("뿅땨님, 약속을 설정해 주세요.")).toBeVisible();
  const cookie = (await context.cookies()).find((c) =>
    c.name.startsWith("promise_"),
  );
  expect(cookie).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    path: `/p/${link.inviteToken}`,
  });
  expect(await page.evaluate(() => document.cookie)).not.toContain("promise_");
  await page.reload();
  await expect(page.getByText("뿅땨님, 약속을 설정해 주세요.")).toBeVisible();
});

test("잘못된 입력과 늦은 선점을 안내하고 타인의 초안 참여를 막는다", async ({
  page,
  browser,
}) => {
  const link = await fixture();
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("가\u2800");
  await page.getByLabel("PIN").fill("1234");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "닉네임은 이모지 없이 2~12자, PIN은 숫자 4자리로 입력해 주세요.",
  );
  expect(
    await db.promiseRecord.count({ where: { promiseLinkId: link.id } }),
  ).toBe(0);
  const statePath = `**/p/${link.inviteToken}/state`;
  await page.route(statePath, route => route.abort());
  const rivalContext = await browser.newContext();
  try {
    const rival = await rivalContext.newPage();
    await rival.goto(`/p/${link.inviteToken}`);
    await rival.getByLabel("닉네임").fill("먼저온방장");
    await rival.getByLabel("PIN").fill("1234");
    await rival.getByRole("button", { name: "방장으로 시작하기" }).click();
    await expect(rival).toHaveURL(/\/settings$/);
    await page.getByLabel("닉네임").fill("늦은방장");
    await page.getByLabel("PIN").fill("1234");
    await page.getByRole("button", { name: "방장으로 시작하기" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "다른 사람이 먼저 방장으로 등록했어요.",
    );
    await page.unroute(statePath);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "방장이 약속을 준비하고 있어요" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "방장으로 시작하기" }),
    ).toHaveCount(0);
  } finally {
    await rivalContext.close();
  }
});

test("열어 둔 설정 화면은 서버의 8분 경고·10분 만료를 반영하고 만료 링크는 문구만 표시한다", async ({
  page,
}) => {
  const link = await fixture();
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("시간확인");
  await page.getByLabel("PIN").fill("0012");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await db.promiseRecord.update({
    where: { promiseLinkId: link.id },
    data: { createdAt: new Date(Date.now() - 480000) },
  });
  await expect(page.getByText("초안이 2분 이내에 만료돼요.")).toBeVisible();
  await db.promiseRecord.update({
    where: { promiseLinkId: link.id },
    data: { createdAt: new Date(Date.now() - 600000) },
  });
  await expect(
    page.getByRole("heading", { name: "작성 시간이 만료됐어요" }),
  ).toBeVisible();
  expect(
    await db.promiseRecord.count({ where: { promiseLinkId: link.id } }),
  ).toBe(1);
  await db.promiseLink.update({
    where: { id: link.id },
    data: { createdAt: new Date("2020-01-01") },
  });
  await expect(page.getByRole("heading")).toHaveText("만료된 약속입니다");
  await expect(page.getByRole("main").getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  // 새 도장과 로고는 장식이다. 공개 본문에는 여전히 만료 안내만 남는다.
  expect(await page.getByRole("main").evaluate(element => {
    const copy = element.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove());
    return copy.textContent?.trim();
  })).toBe("만료된 약속입니다");
  expect(
    await db.promiseRecord.count({ where: { promiseLinkId: link.id } }),
  ).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading")).toHaveText("만료된 약속입니다");
  await expect(page.getByRole("main").getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  // 새 도장과 로고는 장식이다. 공개 본문에는 여전히 만료 안내만 남는다.
  expect(await page.getByRole("main").evaluate(element => {
    const copy = element.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove());
    return copy.textContent?.trim();
  })).toBe("만료된 약속입니다");
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("방장이 초안에서 나가면 세션을 지우고 같은 링크에서 다시 시작한다", async ({
  page,
  context,
}) => {
  const link = await fixture();
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("나갈방장");
  await page.getByLabel("PIN").fill("0012");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("button", { name: "초안 나가기" }).click();
  await expect(
    page.getByRole("heading", { name: "방장 등록" }),
  ).toBeVisible();
  expect(
    await db.promiseRecord.count({ where: { promiseLinkId: link.id } }),
  ).toBe(0);
  expect(
    (await context.cookies()).filter((c) => c.name.startsWith("promise_")),
  ).toHaveLength(0);
});

// 이미 연결한 UI의 진행 상태·반응형·CSRF에 대한 회귀 검증.
test("등록 요청 중 중복 클릭을 막고 모바일 화면이 넘치지 않는다", async ({
  page,
}) => {
  const link = await fixture();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/p/${link.inviteToken}`);
  await expect(
    page.getByRole("heading", { name: "방장 등록" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/invitation-mobile-320.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/invitation-mobile-390.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/invitation-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("닉네임").fill("진행확인");
  await page.getByLabel("PIN").fill("0012");
  let release!: () => void, received!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const intercepted = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route(`**/p/${link.inviteToken}`, async (route) => {
    if (route.request().method() === "POST") {
      received();
      await gate;
    }
    await route.continue();
  });
  const click = page.getByRole("button", { name: "방장으로 시작하기" }).click();
  await intercepted;
  try {
    await expect(page.getByRole("button", { name: "등록 중…" })).toBeDisabled();
  } finally {
    release();
  }
  await click;
  await expect(page).toHaveURL(/\/settings$/);
  await page.screenshot({
    path: "test-results/invitation-host.png",
    fullPage: true,
  });
});

test("다른 Origin에서 보낸 등록 Server Action은 DB를 변경하지 않는다", async ({
  page,
  request,
}) => {
  const link = await fixture();
  await page.goto(`/p/${link.inviteToken}`);
  await page.getByLabel("닉네임").fill("출처확인");
  await page.getByLabel("PIN").fill("0012");
  await page.route(`**/p/${link.inviteToken}`, async (route) => {
    const headers = route.request().headers();
    if (route.request().method() !== "POST") return route.continue();
    const rejected = await request.post(route.request().url(), {
      headers: {...headers,origin:"https://untrusted.example"},
      data: route.request().postDataBuffer() ?? undefined,
      maxRedirects:0,
    });
    await route.fulfill({response:rejected});
  });
  const response = page.waitForResponse((r) => r.request().method() === "POST");
  await page.getByRole("button", { name: "방장으로 시작하기" }).click();
  expect((await response).status()).toBeGreaterThanOrEqual(400);
  expect(
    await db.promiseRecord.count({ where: { promiseLinkId: link.id } }),
  ).toBe(0);
});
