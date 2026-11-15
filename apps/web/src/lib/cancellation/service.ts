import "server-only";
import type { PrismaClient } from "../../generated/prisma/client";
import type { SessionInput } from "../participant-access/service";
import { requireParticipantSession } from "../participant-access/session";
import { cancelPromiseInTransaction } from "./transaction";
export type CancelInput = SessionInput & { expectedParticipantId: unknown };
export type CancelResult = { ok: true } | { ok: false; code: string };
export function createCancellationService(db: PrismaClient, clock?: () => Date) {
  return {
    async cancel(input: CancelInput): Promise<CancelResult> {
      try { return await db.$transaction(async tx => {
        const access = await requireParticipantSession(tx, input, clock);
        if (!access.ok) return access;
        if (input.expectedParticipantId !== access.session.participantId) return { ok: false as const, code: "UNAUTHORIZED" };
        if (access.session.participant.role !== "host") return { ok: false as const, code: "FORBIDDEN" };
        await cancelPromiseInTransaction(tx, access.promise.id, access.at);
        return { ok: true as const };
      }); } catch { return { ok: false, code: "UNAVAILABLE" }; }
    },
  };
}
