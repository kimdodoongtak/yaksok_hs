export type SlotSettings = { dateRangeStart: string; dateRangeEnd: string; dailyStartMinute: number; dailyEndMinute: number };
export function normalizeSlots(request: unknown, saved: string[], settings: SlotSettings, at: Date): string[] | null {
  if (!Array.isArray(request) || request.length > 10000) return null;
  const slots = new Set(saved.filter(slot => new Date(slot) <= at));
  for (const raw of request) {
    if (typeof raw !== "string") return null;
    const date = new Date(raw);
    if (!Number.isFinite(date.getTime())) return null;
    const iso = date.toISOString();
    if (raw !== iso && raw !== iso.replace(".000Z", "Z")) return null;
    if (date <= at) continue;
    const local = new Date(date.getTime() + 9 * 3600000);
    const day = local.toISOString().slice(0, 10);
    const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (date.getUTCSeconds() || date.getUTCMilliseconds() || minute % 30 || day < settings.dateRangeStart || day > settings.dateRangeEnd || minute < settings.dailyStartMinute || minute + 30 > settings.dailyEndMinute) return null;
    slots.add(iso);
  }
  return [...slots].sort();
}
