import { expect, it } from "vitest";
import { normalizeSlots } from "./policy";
const settings = { dateRangeStart: "2026-11-15", dateRangeEnd: "2026-11-16", dailyStartMinute: 540, dailyEndMinute: 1440 };
const at = new Date("2026-11-14T00:00:00Z");
it("30분 전체가 범위 안에 있는 중복 없는 최종 슬롯을 만든다", () => {
  const last = "2026-11-16T14:30:00.000Z";
  expect(normalizeSlots([last, "2026-11-15T00:00:00.000Z", last], [], settings, at)).toEqual(["2026-11-15T00:00:00.000Z", last]);
  for (const slot of ["2026-11-16T15:00:00.000Z", "2026-11-14T23:30:00.000Z", "2026-11-15T00:15:00.000Z", "2026-11-15T00:00:01.000Z", "not-a-date"]) {
    expect(normalizeSlots([slot], [], settings, at)).toBeNull();
  }
  expect(normalizeSlots(["2026-11-15T14:00:00.000Z"], [], {...settings, dailyEndMinute:1380}, at)).toBeNull();
  expect(normalizeSlots([], [], settings, at)).toEqual([]);
});
it("시작이 현재 이하인 요청은 무시하고 저장된 과거 슬롯은 보존한다", () => {
  const now = new Date("2026-11-15T01:00:00.000Z");
  const past = "2026-11-15T00:00:00.000Z";
  const current = "2026-11-15T01:00:00.000Z";
  const future = "2026-11-15T01:30:00.000Z";
  expect(normalizeSlots(["2026-11-13T00:00:00.000Z", current, future], [past], settings, now)).toEqual([past, future]);
  expect(normalizeSlots([], [past, future], settings, now)).toEqual([past]);
});
