import "server-only";
import type { PromiseSettingsDefaults } from "../promise-settings/policy";
import type {
  PrismaClient,
  Prisma,
  PromiseRecord,
  Participant,
} from "../../generated/prisma/client";
import { newToken, hashPin, tokenHash } from "./security";
import {
  linkExpiresAt,
  draftExpiresAt,
  isExpired,
  validateRegistration,
} from "./policy";

export type RegistrationResult =
  | { ok: true; sessionToken: string; expiresAt: Date }
  | { ok: false; code: string };
export type MutationResult = { ok: true } | { ok: false; code: string };
type DraftMutation = (
  tx: Prisma.TransactionClient,
  promise: PromiseRecord,
  host: Participant,
  at: Date,
) => Promise<void>;
export type InvitationView =
  | {
      state:
        | "invalid"
        | "expired"
        | "available"
        | "cancelled"
        | "draft-expired"
        | "waiting";
    }
  | {
      state: "ready";
      access?: import("../participant-access/view").ParticipantView;
      settings?: Pick<PromiseSettingsDefaults, "dateRangeStart" | "dateRangeEnd" | "dailyStart" | "dailyEnd" | "durationMinutes">;
    }
  | {
      state: "host";
      nickname: string;
      warning: boolean;
      expiresAt: string;
      serverNow: string;
    };
export function createInvitationService(
  db: PrismaClient,
  clock?: () => Date,
  pinHasher: (pin: string) => Promise<string> = hashPin,
) {
  async function now(tx: Prisma.TransactionClient = db) {
    if (clock) return clock();
    const [row] = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    return row.now;
  }
  // 모든 초안 쓰기는 링크 → 약속 순서로 잠그고, 잠금을 얻은 뒤 시각을 판정한다.
  async function lockInvitation(
    tx: Prisma.TransactionClient,
    inviteToken: string,
  ) {
    await tx.$queryRaw`SELECT id FROM promise_links WHERE invite_token = ${inviteToken} FOR UPDATE`;
    const link = await tx.promiseLink.findUnique({ where: { inviteToken } });
    if (!link) return null;
    await tx.$queryRaw`SELECT id FROM promises WHERE promise_link_id = ${link.id}::uuid FOR UPDATE`;
    const promise = await tx.promiseRecord.findUnique({
      where: { promiseLinkId: link.id },
    });
    return { link, promise, at: await now(tx) };
  }
  async function deleteDraft(tx: Prisma.TransactionClient, promiseId: string) {
    await tx.participantSession.deleteMany({
      where: { participant: { promiseId } },
    });
    await tx.participant.deleteMany({ where: { promiseId } });
    await tx.promiseRecord.delete({ where: { id: promiseId } });
  }
  async function mutateDraft(
    inviteToken: string,
    sessionToken: string | undefined,
    mutation: DraftMutation,
  ): Promise<MutationResult> {
    try {
      return await db.$transaction(async (tx) => {
        const locked = await lockInvitation(tx, inviteToken);
        if (!locked) return { ok: false, code: "INVALID_LINK" };
        const { link, promise, at } = locked;
        if (isExpired(linkExpiresAt(link.createdAt), at))
          return { ok: false, code: "LINK_EXPIRED" };
        if (promise?.status === "cancelled") return { ok: false as const, code: "PROMISE_CANCELLED" };
        if (!promise || promise.status !== "draft")
          return { ok: false, code: "NOT_DRAFT" };
        const session = sessionToken
          ? await tx.participantSession.findUnique({
              where: { sessionTokenHash: tokenHash(sessionToken) },
              include: { participant: true },
            })
          : null;
        const ownsDraft =
          session?.participant.promiseId === promise.id &&
          session.participant.role === "host" &&
          session.participant.status === "active";
        if (isExpired(draftExpiresAt(promise.createdAt), at)) {
          if (!ownsDraft) return { ok: false, code: "UNAUTHORIZED" };
          await deleteDraft(tx, promise.id);
          return { ok: false, code: "DRAFT_EXPIRED" };
        }
        if (!ownsDraft || session.expiresAt <= at)
          return { ok: false, code: "UNAUTHORIZED" };
        await mutation(tx, promise, session.participant, at);
        return { ok: true };
      });
    } catch {
      return { ok: false, code: "UNAVAILABLE" };
    }
  }
  return {
    mutateDraft,
    async abandonDraft(
      inviteToken: string,
      sessionToken?: string,
    ): Promise<MutationResult> {
      return mutateDraft(inviteToken, sessionToken, async (tx, promise) =>
        deleteDraft(tx, promise.id),
      );
    },
    async registerHost(input: {
      inviteToken: string;
      nickname: unknown;
      pin: unknown;
    }): Promise<RegistrationResult> {
      const valid = validateRegistration(input.nickname, input.pin);
      if (!valid) return { ok: false, code: "INVALID_INPUT" };
      try {
        const candidateLink = await db.promiseLink.findUnique({
          where: { inviteToken: input.inviteToken },
          include: { promise: true },
        });
        if (!candidateLink) return { ok: false, code: "INVALID_LINK" };
        const candidateAt = await now();
        if (isExpired(linkExpiresAt(candidateLink.createdAt), candidateAt))
          return { ok: false, code: "LINK_EXPIRED" };
        if (candidateLink.promise?.status === "cancelled") return { ok: false, code: "PROMISE_CANCELLED" };
        if (
          candidateLink.promise &&
          (candidateLink.promise.status !== "draft" ||
            !isExpired(
              draftExpiresAt(candidateLink.promise.createdAt),
              candidateAt,
            ))
        )
          return { ok: false, code: "ALREADY_CLAIMED" };

        const passwordHash = await pinHasher(valid.pin);
        const sessionToken = newToken();
        return await db.$transaction(async (tx) => {
          const locked = await lockInvitation(tx, input.inviteToken);
          if (!locked) return { ok: false as const, code: "INVALID_LINK" };
          const { link, promise: existing, at } = locked;
          if (isExpired(linkExpiresAt(link.createdAt), at))
            return { ok: false as const, code: "LINK_EXPIRED" };
          if (existing?.status === "cancelled") return { ok: false as const, code: "PROMISE_CANCELLED" };
          if (existing) {
            if (
              existing.status !== "draft" ||
              !isExpired(draftExpiresAt(existing.createdAt), at)
            )
              return { ok: false as const, code: "ALREADY_CLAIMED" };
            await deleteDraft(tx, existing.id);
          }
          const promise = await tx.promiseRecord.create({
            data: { promiseLinkId: link.id, createdAt: at },
          });
          const host = await tx.participant.create({
            data: {
              promiseId: promise.id,
              nickname: valid.nickname,
              normalizedNickname: valid.normalizedNickname,
              passwordHash,
              role: "host",
              createdAt: at,
            },
          });
          const expiresAt = draftExpiresAt(at);
          await tx.participantSession.create({
            data: {
              participantId: host.id,
              sessionTokenHash: tokenHash(sessionToken),
              expiresAt,
            },
          });
          return { ok: true as const, sessionToken, expiresAt };
        });
      } catch {
        return { ok: false, code: "UNAVAILABLE" };
      }
    },
    async readInvitation(
      inviteToken: string,
      sessionToken?: string,
    ): Promise<InvitationView> {
      const link = await db.promiseLink.findUnique({
        where: { inviteToken },
        include: { promise: true },
      });
      if (!link) return { state: "invalid" };
      const at = await now();
      if (isExpired(linkExpiresAt(link.createdAt), at))
        return { state: "expired" };
      if (!link.promise) return { state: "available" };
      if (link.promise.status === "cancelled") return { state: "cancelled" };
      if (link.promise.status === "draft" && isExpired(draftExpiresAt(link.promise.createdAt), at))
        return { state: "draft-expired" };
      const session = sessionToken
        ? await db.participantSession.findUnique({
            where: { sessionTokenHash: tokenHash(sessionToken) },
            include: { participant: true },
          })
        : null;
      const isHost = Boolean(
        session &&
        session.expiresAt > at &&
        session.participant.promiseId === link.promise.id &&
        session.participant.role === "host" &&
        session.participant.status === "active"
      );
      if (link.promise.status !== "draft") {
        const promise = link.promise;
        if (isHost && promise.status === "collecting" &&
          promise.dateRangeStart && promise.dateRangeEnd &&
          promise.dailyStartMinute !== null && promise.dailyEndMinute !== null &&
          promise.durationMinutes !== null) {
          const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
          return {
            state: "ready",
            settings: {
              dateRangeStart: promise.dateRangeStart.toISOString().slice(0, 10),
              dateRangeEnd: promise.dateRangeEnd.toISOString().slice(0, 10),
              dailyStart: time(promise.dailyStartMinute),
              dailyEnd: time(promise.dailyEndMinute),
              durationMinutes: String(promise.durationMinutes),
            },
          };
        }
        return { state: "ready" };
      }
      if (isHost && session) {
        const expiresAt = draftExpiresAt(link.promise.createdAt);
        return {
          state: "host",
          nickname: session.participant.nickname,
          warning: at.getTime() >= expiresAt.getTime() - 120000,
          expiresAt: expiresAt.toISOString(),
          serverNow: at.toISOString(),
        };
      }
      return { state: "waiting" };
    },
    async issueInviteLink() {
      const link = await db.promiseLink.create({
        data: { inviteToken: newToken(), createdAt: await now() },
      });
      return {
        inviteToken: link.inviteToken,
        expiresAt: linkExpiresAt(link.createdAt),
      };
    },
  };
}
