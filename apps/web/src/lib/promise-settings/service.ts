import "server-only";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import {
  draftExpiresAt,
  isExpired,
  linkExpiresAt,
  sessionExpiresAt,
} from "../invitation/policy";
import { tokenHash } from "../invitation/security";
import type {
  PromiseSettingsInput,
  PromiseSettingsValidation,
} from "./policy";
import { validatePromiseSettings } from "./policy";

export type StartCollectionResult =
  | { ok: true; expiresAt: Date }
  | {
      ok: false;
      code: string;
      fieldErrors?: Extract<
        PromiseSettingsValidation,
        { ok: false }
      >["fieldErrors"];
    };

export function createPromiseSettingsService(
  db: PrismaClient,
  clock?: () => Date,
) {
  async function now(tx: Prisma.TransactionClient) {
    if (clock) return clock();
    const [row] = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    return row.now;
  }

  return {
    async startCollection(input: {
      inviteToken: string;
      sessionToken?: string;
      settings: PromiseSettingsInput;
    }): Promise<StartCollectionResult> {
      try {
        return await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM promise_links WHERE invite_token = ${input.inviteToken} FOR UPDATE`;
          const link = await tx.promiseLink.findUnique({
            where: { inviteToken: input.inviteToken },
          });
          if (!link) return { ok: false as const, code: "INVALID_LINK" };
          await tx.$queryRaw`SELECT id FROM promises WHERE promise_link_id = ${link.id}::uuid FOR UPDATE`;
          const promise = await tx.promiseRecord.findUnique({
            where: { promiseLinkId: link.id },
          });
          const at = await now(tx);
          if (isExpired(linkExpiresAt(link.createdAt), at))
            return { ok: false as const, code: "LINK_EXPIRED" };
          if (!promise || promise.status !== "draft")
            return { ok: false as const, code: "NOT_DRAFT" };

          const session = input.sessionToken
            ? await tx.participantSession.findUnique({
                where: { sessionTokenHash: tokenHash(input.sessionToken) },
                include: { participant: true },
              })
            : null;
          const ownsDraft =
            session?.participant.promiseId === promise.id &&
            session.participant.role === "host" &&
            session.participant.status === "active";
          if (isExpired(draftExpiresAt(promise.createdAt), at)) {
            if (!ownsDraft)
              return { ok: false as const, code: "UNAUTHORIZED" };
            await tx.participantSession.deleteMany({
              where: { participant: { promiseId: promise.id } },
            });
            await tx.participant.deleteMany({ where: { promiseId: promise.id } });
            await tx.promiseRecord.delete({ where: { id: promise.id } });
            return { ok: false as const, code: "DRAFT_EXPIRED" };
          }
          if (
            !session ||
            session.expiresAt <= at ||
            !ownsDraft
          ) {
            return { ok: false as const, code: "UNAUTHORIZED" };
          }

          const validation = validatePromiseSettings(input.settings, at);
          if (!validation.ok) {
            return {
              ok: false as const,
              code: "INVALID_INPUT",
              fieldErrors: validation.fieldErrors,
            };
          }
          const value = validation.value;
          const activeCount = await tx.participant.count({
            where: { promiseId: promise.id, status: "active" },
          });
          if (value.participantLimit < activeCount) {
            return {
              ok: false as const,
              code: "INVALID_INPUT",
              fieldErrors: {
                participantLimit:
                  "정원은 현재 참여 중인 인원보다 작게 설정할 수 없습니다.",
              },
            };
          }

          const expiresAt = sessionExpiresAt(value.votingDeadlineAt);
          await tx.promiseRecord.update({
            where: { id: promise.id },
            data: {
              participantLimit: value.participantLimit,
              dateRangeStart: new Date(`${value.dateRangeStart}T00:00:00Z`),
              dateRangeEnd: new Date(`${value.dateRangeEnd}T00:00:00Z`),
              dailyStartMinute: value.dailyStartMinute,
              dailyEndMinute: value.dailyEndMinute,
              durationMinutes: value.durationMinutes,
              votingDeadlineAt: value.votingDeadlineAt,
              status: "collecting",
            },
          });
          await tx.participantSession.update({
            where: { id: session.id },
            data: { expiresAt },
          });
          return { ok: true as const, expiresAt };
        });
      } catch {
        return { ok: false, code: "UNAVAILABLE" };
      }
    },
  };
}
