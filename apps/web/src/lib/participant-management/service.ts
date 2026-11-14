import "server-only";
import type { PrismaClient } from "../../generated/prisma/client";
import { cancelPromiseInTransaction } from "../cancellation/transaction";
import { requireParticipantSession } from "../participant-access/session";
import type { SessionInput } from "../participant-access/service";
import type { ManagementViewResult } from "./view";
export type ManagementInput = SessionInput & { expectedParticipantId: string };
export type ManagementResult = { ok: true; outcome: "left" | "removed" | "cancelled"; successorNickname?: string } | { ok: false; code: string };
export function createParticipantManagementService(db: PrismaClient, clock?: () => Date) {
  return {
    async read(input: SessionInput): Promise<ManagementViewResult> {
      try { return await db.$transaction(async tx => {
        const access = await requireParticipantSession(tx, input, clock);
        if (!access.ok) return access;
        if (access.promise.status === "draft") return { ok: false as const, code: "NOT_AVAILABLE" };
        const status = access.promise.status === "collecting" && access.promise.votingDeadlineAt && access.promise.votingDeadlineAt <= access.at ? "closed" : access.promise.status;
        const participants = await tx.participant.findMany({ where: { promiseId: access.promise.id, status: "active" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, nickname: true, role: true } });
        return { ok: true as const, snapshot: { participantId: access.session.participantId, role: access.session.participant.role, status, participants } };
      }); } catch { return { ok: false, code: "UNAVAILABLE" }; }
    },
    async remove(input: ManagementInput & { targetParticipantId: string }): Promise<ManagementResult> {
      try { return await db.$transaction(async tx => {
        const access = await requireParticipantSession(tx, input, clock);
        if (!access.ok) return access;
        if (access.session.participantId !== input.expectedParticipantId) return { ok: false as const, code: "UNAUTHORIZED" };
        if (access.session.participant.role !== "host") return { ok: false as const, code: "FORBIDDEN" };
        if (access.promise.status !== "collecting" || !access.promise.votingDeadlineAt || access.promise.votingDeadlineAt <= access.at) return { ok: false as const, code: "STATE_CHANGED" };
        // UUID 조회 전에 현재 약속의 active 목록 안에서 대상을 찾는다.
        const members = await tx.participant.findMany({ where: { promiseId: access.promise.id, status: "active", role: "member" }, select: { id: true } });
        const target = members.find(member => member.id === input.targetParticipantId);
        if (!target) return { ok: false as const, code: "INVALID_TARGET" };
        await tx.participant.update({ where: { id: target.id }, data: { status: "cancelled", cancelledAt: access.at } });
        await tx.participantSession.updateMany({ where: { participantId: target.id }, data: { expiresAt: access.at } });
        return { ok: true as const, outcome: "removed" as const };
      }); } catch { return { ok: false, code: "UNAVAILABLE" }; }
    },
    async leave(input: ManagementInput & { expectedSuccessorId: string | null; expectedRole: string }): Promise<ManagementResult> {
      try { return await db.$transaction(async tx => {
        const access = await requireParticipantSession(tx, input, clock);
        if (!access.ok) return access;
        if (access.session.participantId !== input.expectedParticipantId) return { ok: false as const, code: "UNAUTHORIZED" };
        if (!["collecting", "closed", "confirmed"].includes(access.promise.status)) return { ok: false as const, code: "STATE_CHANGED" };
        const member = access.session.participant;
        if (input.expectedRole !== member.role) return { ok: false as const, code: "STATE_CHANGED" };
        const successor = member.role === "host" ? await tx.participant.findFirst({ where: { promiseId: access.promise.id, status: "active", id: { not: member.id } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }) : null;
        if (member.role === "host" && input.expectedSuccessorId !== (successor?.id ?? null)) return { ok: false as const, code: "SUCCESSOR_CHANGED" };
        if (member.role === "host" && !successor) {
          await cancelPromiseInTransaction(tx, access.promise.id, access.at);
          return { ok: true as const, outcome: "cancelled" as const };
        }
        await tx.participant.update({ where: { id: member.id }, data: { role: "member", status: "cancelled", cancelledAt: access.at } });
        await tx.participantSession.updateMany({ where: { participantId: member.id }, data: { expiresAt: access.at } });
        if (successor) await tx.participant.update({ where: { id: successor.id }, data: { role: "host" } });
        return { ok: true as const, outcome: "left" as const, ...(successor ? { successorNickname: successor.nickname } : {}) };
      }); } catch { return { ok: false, code: "UNAVAILABLE" }; }
    },
  };
}
