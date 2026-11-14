import type { SlotSettings } from "../availability/policy";
export type Candidate = { startAt: string; endAt: string; count: number };
export type CandidateMember = { id: string; active: boolean; submitted: boolean; slots: string[] };
export type CandidateSettings = SlotSettings & { durationMinutes: number };
const halfHour = 1800000;
export function calculateCandidates(members: CandidateMember[], settings: CandidateSettings, now: Date): { candidates: Candidate[]; heatmap: Record<string, number>; participantIdsBySlot: Record<string, string[]> } {
  const peopleBySlot = new Map<number, Set<string>>();
  for (const member of members) {
    if (!member.active || !member.submitted) continue;
    for (const slot of member.slots) {
      const time = new Date(slot).getTime();
      if (!Number.isFinite(time) || time % halfHour) continue;
      const local = new Date(time + 9 * 3600000);
      const day = local.toISOString().slice(0, 10), minute = local.getUTCHours() * 60 + local.getUTCMinutes();
      if (day < settings.dateRangeStart || day > settings.dateRangeEnd || minute < settings.dailyStartMinute || minute + 30 > settings.dailyEndMinute) continue;
      const people = peopleBySlot.get(time) ?? new Set<string>();
      people.add(member.id); peopleBySlot.set(time, people);
    }
  }
  const heatmap = Object.fromEntries([...peopleBySlot].map(([time, people]) => [new Date(time).toISOString(), people.size]));
  const candidates: Candidate[] = [];
  const endDay = new Date(`${settings.dateRangeEnd}T00:00:00+09:00`).getTime();
  for (let day = new Date(`${settings.dateRangeStart}T00:00:00+09:00`).getTime(); day <= endDay; day += 86400000) {
    for (let minute = settings.dailyStartMinute; minute + settings.durationMinutes <= settings.dailyEndMinute; minute += 30) {
      const start = day + minute * 60000, end = start + settings.durationMinutes * 60000;
      if (start <= now.getTime()) continue;
      const people = [...(peopleBySlot.get(start) ?? [])].filter(id => {
        for (let time = start + halfHour; time < end; time += halfHour) if (!peopleBySlot.get(time)?.has(id)) return false;
        return true;
      });
      if (people.length >= 2) candidates.push({ startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), count: people.length });
    }
  }
  candidates.sort((a, b) => b.count - a.count || a.startAt.localeCompare(b.startAt));
  return { candidates, heatmap, participantIdsBySlot: Object.fromEntries([...peopleBySlot].map(([time, people]) => [new Date(time).toISOString(), [...people]])) };
}
