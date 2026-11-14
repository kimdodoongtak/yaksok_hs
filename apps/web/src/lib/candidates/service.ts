import "server-only";
import type { PrismaClient } from "../../generated/prisma/client";
import type { SessionInput } from "../participant-access/service";
import { requireParticipantSession } from "../participant-access/session";
import { settingsOf } from "../availability/service";
import { calculateCandidates } from "./policy";
import type { CloseResult, OverviewResult } from "./view";
export type OverviewInput = SessionInput & { week?: string; participantId?: string; limit?: number };
export function createCandidatesService(db: PrismaClient, clock?: () => Date) {
  return {
    async read(input: OverviewInput): Promise<OverviewResult> {
      try { return await db.$transaction(async tx => {
        const access = await requireParticipantSession(tx, input, clock);
        if (!access.ok) return access;
        const settings = settingsOf(access.promise);
        if (!settings || access.promise.status === "draft") return { ok: false as const, code: "NOT_AVAILABLE" };
        const week = input.week ?? settings.dateRangeStart;
        const weekTime = new Date(`${week}T00:00:00+09:00`).getTime();
        const limit = input.limit ?? 5;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || !Number.isFinite(weekTime) || new Date(weekTime + 9 * 3600000).toISOString().slice(0, 10) !== week || !Number.isInteger(limit) || limit < 1 || limit > 4320) return { ok: false as const, code: "INVALID_INPUT" };
        const members = await tx.participant.findMany({
          where: { promiseId: access.promise.id, status: "active" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, nickname: true, role: true, availabilitySubmittedAt: true,
            availableSlots: { where: { slotStartAt: { gte: new Date(`${settings.dateRangeStart}T00:00:00+09:00`), lt: new Date(new Date(`${settings.dateRangeEnd}T00:00:00+09:00`).getTime() + 86400000) } }, orderBy: { slotStartAt: "asc" }, select: { slotStartAt: true } } },
        });
        const target = input.participantId ? members.find(member => member.id === input.participantId) : null;
        if (input.participantId && !target) return { ok: false as const, code: "NOT_FOUND" };
        const data = members.map(member => ({ id: member.id, active: true, submitted: member.availabilitySubmittedAt !== null, slots: member.availableSlots.map(slot => slot.slotStartAt.toISOString()) }));
        const memberIndexes = new Map(members.map((member,index) => [member.id,index]));
        const calculated = calculateCandidates(data, settings, access.at);
        const inWeek = (slot: string) => new Date(slot).getTime() >= weekTime && new Date(slot).getTime() < weekTime + 7 * 86400000;
        const status = access.promise.status === "collecting" && access.promise.votingDeadlineAt! <= access.at ? "closed" : access.promise.status;
        return { ok: true as const, snapshot: {
          participantId: access.session.participantId, status, serverNow: access.at.toISOString(), settings, week,
          participants: members.map(({ id, nickname, role }) => ({ id, nickname, role })),
          selected: target ? { participantId: target.id, slots: target.availabilitySubmittedAt ? data.find(member => member.id === target.id)!.slots.filter(inWeek) : [] } : null,
          heatmap: Object.fromEntries(Object.entries(calculated.heatmap).filter(([slot]) => inWeek(slot))),
          slotParticipantIndexes: Object.fromEntries(Object.entries(calculated.participantIdsBySlot).filter(([slot]) => inWeek(slot)).map(([slot, ids]) => [slot, ids.map(id => memberIndexes.get(id)!)])),
          weekCandidates: ["collecting", "closed"].includes(status) ? calculated.candidates.filter(candidate => inWeek(candidate.startAt)) : [],
          candidates: status === "closed" ? calculated.candidates.slice(0, limit) : [], hasMore: status === "closed" && calculated.candidates.length > limit,
        } };
      }); } catch { return { ok: false, code: "UNAVAILABLE" }; }
    },
    async close(input: SessionInput & { expectedParticipantId?: string }): Promise<CloseResult> {
      try { return await db.$transaction(async tx => {
        const access = await requireParticipantSession(tx, input, clock);
        if (!access.ok) return access;
        if (input.expectedParticipantId && input.expectedParticipantId !== access.session.participantId) return { ok: false as const, code: "UNAUTHORIZED" };
        if (access.session.participant.role !== "host") return { ok: false as const, code: "FORBIDDEN" };
        if (access.promise.status === "closed") return { ok: true as const };
        if (access.promise.status !== "collecting") return { ok: false as const, code: "NOT_AVAILABLE" };
        await tx.promiseRecord.update({ where: { id: access.promise.id }, data: { status: "closed" } });
        return { ok: true as const };
      }); } catch { return { ok: false, code: "UNAVAILABLE" }; }
    },
  };
}
