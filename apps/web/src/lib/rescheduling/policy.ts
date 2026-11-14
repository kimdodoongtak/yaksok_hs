import type { SlotSettings } from "../availability/policy";
export type RangeChange = "same" | "shrink" | "expand";
// 유효한 설정은 비어 있지 않은 날짜×하루 시간의 직사각형 슬롯 집합이다.
export function rangeChange(before: SlotSettings, after: SlotSettings): RangeChange {
  if(after.dateRangeStart<before.dateRangeStart || after.dateRangeEnd>before.dateRangeEnd || after.dailyStartMinute<before.dailyStartMinute || after.dailyEndMinute>before.dailyEndMinute)return "expand";
  return after.dateRangeStart===before.dateRangeStart && after.dateRangeEnd===before.dateRangeEnd && after.dailyStartMinute===before.dailyStartMinute && after.dailyEndMinute===before.dailyEndMinute ? "same" : "shrink";
}
