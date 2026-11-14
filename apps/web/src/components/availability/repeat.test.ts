import { expect, test } from "vitest";
import { repeatWeeks } from "./repeat";
import { slotAt } from "./calendar";

test("한 주 반복은 서로 다른 요일별 시간을 선택한 주에만 복사하고 기존 선택과 합친다", () => {
  const original = [slotAt("2026-11-16", 570), slotAt("2026-11-18", 660), slotAt("2026-11-18", 750), slotAt("2026-11-23", 900)];
  const slots = new Set(original);
  const input = { slots, sourceWeek: "2026-11-15", targetWeeks: ["2026-11-22", "2026-12-06"],
    settings: { dateRangeStart: "2026-11-15", dateRangeEnd: "2026-12-12", dailyStartMinute: 540, dailyEndMinute: 1080 },
    now: "2026-11-14T00:00:00.000Z" };
  const expected = [...original, slotAt("2026-11-23", 570), slotAt("2026-11-25", 660), slotAt("2026-11-25", 750), slotAt("2026-12-07", 570), slotAt("2026-12-09", 660), slotAt("2026-12-09", 750)].sort();
  const result = repeatWeeks(input);
  expect([...result].sort()).toEqual(expected);
  expect([...slots]).toEqual(original);
  expect([...repeatWeeks({ ...input, slots: result })].sort()).toEqual(expected);
});

test("한 주 반복은 일부 주의 날짜 범위·과거·일일 경계를 지키고 연도를 넘어 KST 요일을 유지한다", () => {
  const slots = new Set([slotAt("2026-12-27", 0), slotAt("2026-12-28", 30), slotAt("2026-12-28", 1410), slotAt("2027-01-01", 570)]);
  const input = { slots, sourceWeek: "2026-12-27", targetWeeks: ["2026-12-20", "2027-01-03"],
    settings: { dateRangeStart: "2026-12-21", dateRangeEnd: "2027-01-04", dailyStartMinute: 0, dailyEndMinute: 1440 },
    now: slotAt("2026-12-21", 30) };
  expect([...repeatWeeks(input)].sort()).toEqual([
    ...slots, slotAt("2026-12-21", 1410), slotAt("2026-12-25", 570), slotAt("2027-01-03", 0), slotAt("2027-01-04", 30), slotAt("2027-01-04", 1410),
  ].sort());
  expect([...repeatWeeks({...input,settings:{...input.settings,dailyStartMinute:30,dailyEndMinute:1410}})].sort()).toEqual([
    ...slots,slotAt("2026-12-25",570),slotAt("2027-01-04",30),
  ].sort());
});
