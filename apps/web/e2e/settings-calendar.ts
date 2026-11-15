import type { Page } from "@playwright/test";

export async function calendarDay(page: Page, date: string, name = "날짜 범위 달력") {
  const calendar = page.getByRole("grid", { name, exact: true });
  for (let attempt = 0; attempt < 5; attempt++) {
    const day = calendar.getByRole("gridcell", { name: `${date} 선택`, exact: true });
    if (await day.count()) return day;
    const visible = (await calendar.locator("button").first().getAttribute("aria-label"))!.slice(0, 7);
    await page.getByRole("button", {
      name: date.slice(0, 7) < visible ? "이전 달" : "다음 달", exact: true,
    }).click();
  }
  throw new Error(`달력에 ${date} 없음`);
}

export async function selectDateRange(page: Page, start: string, end: string) {
  await page.getByRole("button", { name: "약속 날짜 선택", exact: true }).click();
  await (await calendarDay(page, start)).click();
  await (await calendarDay(page, end)).click();
  await page.getByRole("button", { name: "선택 완료", exact: true }).click();
}

export async function selectDeadline(page: Page, value: string) {
  const date = value.slice(0, 10);
  await page.getByRole("button", { name: "직접 선택", exact: true }).click();
  await (await calendarDay(page, date, "응답 마감 달력")).click();
  await page.getByRole("button", { name: "선택 완료", exact: true }).click();
}
