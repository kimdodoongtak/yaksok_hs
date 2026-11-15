import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import type { SessionInput } from "./service";
import { tokenHash } from "../invitation/security";
import { linkExpiresAt, draftExpiresAt } from "../invitation/policy";
export async function databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
  const [row] = await tx.$queryRaw<{now: Date}[]>`SELECT clock_timestamp() AS now`;
  return row.now;
}
export async function requireParticipantSession(tx: Prisma.TransactionClient, input: SessionInput, clock?: () => Date | Promise<Date>, options: { lock?: boolean } = {}) {
    // 쓰기는 기존처럼 직렬화하고, 읽기에서만 RepeatableRead와 함께 잠금을 생략한다.
    if (options.lock !== false) {
      await tx.$queryRaw`SELECT p.id FROM promises p JOIN promise_links l ON l.id = p.promise_link_id WHERE l.invite_token = ${input.inviteToken} FOR UPDATE OF p`;
    }
    const link = await tx.promiseLink.findUnique({ where: { inviteToken: input.inviteToken }, include: { promise: true } });
    const at = clock ? await clock() : await databaseNow(tx);
    if (!link) return { ok: false as const, code: "INVALID_LINK" };
    if (linkExpiresAt(link.createdAt) <= at) return { ok: false as const, code: "LINK_EXPIRED" };
    if (link.promise?.status === "cancelled") return { ok: false as const, code: "PROMISE_CANCELLED" };
    if (link.promise?.status === "draft" && draftExpiresAt(link.promise.createdAt) <= at) return { ok: false as const, code: "DRAFT_EXPIRED" };
    const session = input.sessionToken ? await tx.participantSession.findUnique({ where: { sessionTokenHash: tokenHash(input.sessionToken) }, include: { participant: true } }) : null;
    if (!link.promise || !session || session.expiresAt <= at || session.participant.promiseId !== link.promise.id || session.participant.status !== "active") return { ok: false as const, code: "UNAUTHORIZED" };
    return { ok: true as const, link, promise: link.promise, session, at };
  }
