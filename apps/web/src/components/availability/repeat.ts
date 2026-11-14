import type { SlotSettings } from "@/lib/availability/policy";
import { addDays, localDay } from "./calendar";

export function repeatWeeks(input: {
  slots: ReadonlySet<string>;
  sourceWeek: string;
  targetWeeks: readonly string[];
  settings: SlotSettings;
  now: string;
}): Set<string> {
  const result = new Set(input.slots);
  const source = [...input.slots].filter(slot => localDay(slot) >= input.sourceWeek && localDay(slot) < addDays(input.sourceWeek, 7));
  for (const targetWeek of input.targetWeeks) {
    const shift = new Date(`${targetWeek}T00:00:00Z`).getTime() - new Date(`${input.sourceWeek}T00:00:00Z`).getTime();
    for (const slot of source) {
      const target = new Date(new Date(slot).getTime() + shift).toISOString();
      const day = localDay(target);
      const kst = new Date(new Date(target).getTime() + 9 * 3600000);
      const minute = kst.getUTCHours() * 60 + kst.getUTCMinutes();
      if (target <= input.now || day < input.settings.dateRangeStart || day > input.settings.dateRangeEnd) continue;
      if (minute < input.settings.dailyStartMinute || minute + 30 > input.settings.dailyEndMinute) continue;
      result.add(target);
    }
  }
  return result;
}
