import "server-only";
import type { ParticipantView } from "./view";
import type { PromiseSettingsDefaults } from "../promise-settings/policy";
import type { Prisma, PrismaClient, Participant } from "../../generated/prisma/client";
import { hashPin, newToken, tokenHash, verifyPin } from "../invitation/security";
import { validateRegistration, sessionExpiresAt, linkExpiresAt, draftExpiresAt } from "../invitation/policy";
export type AccessFailure = { ok: false; code: string; retryAt?: Date };
export type RegistrationResult = { ok: true; sessionToken: string; expiresAt: Date } | AccessFailure;
export type SessionInput = { inviteToken: string; sessionToken?: string };
export type AccessResult = { ok: true; participant: { id: string; nickname: string; role: string }; status: string } | AccessFailure;
export type Credentials = { inviteToken: string; nickname: unknown; pin: unknown };
export function createParticipantAccessService(db: PrismaClient, clock?: () => Date, pinHasher = hashPin, pinVerifier = verifyPin) {
  async function now(tx: Prisma.TransactionClient) {
    if (clock) return clock();
    const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    return row.now;
  }
  async function requireSession(tx: Prisma.TransactionClient, input: SessionInput) {
    await tx.$queryRaw`SELECT p.id FROM promises p JOIN promise_links l ON l.id = p.promise_link_id WHERE l.invite_token = ${input.inviteToken} FOR UPDATE OF p`;
    const link = await tx.promiseLink.findUnique({ where: { inviteToken: input.inviteToken }, include: { promise: true } });
    const at = await now(tx);
    if (!link) return { ok: false as const, code: "INVALID_LINK" };
    if (linkExpiresAt(link.createdAt) <= at) return { ok: false as const, code: "LINK_EXPIRED" };
    if (link.promise?.status === "cancelled") return { ok: false as const, code: "PROMISE_CANCELLED" };
    if (link.promise?.status === "draft" && draftExpiresAt(link.promise.createdAt) <= at) return { ok: false as const, code: "DRAFT_EXPIRED" };
    const session = input.sessionToken ? await tx.participantSession.findUnique({ where: { sessionTokenHash: tokenHash(input.sessionToken) }, include: { participant: true } }) : null;
    if (!link.promise || !session || session.expiresAt <= at || session.participant.promiseId !== link.promise.id || session.participant.status !== "active") return { ok: false as const, code: "UNAUTHORIZED" };
    return { ok: true as const, link, promise: link.promise, session, at };
  }
  async function checkPin(tx: Prisma.TransactionClient, promiseId: string, nickname: string, pin: string, member: Participant | null, at: Date, expiresAt: Date): Promise<{ ok: true } | AccessFailure> {
    const keyHash = tokenHash(JSON.stringify(["account", promiseId, nickname]));
    const attempt = await tx.authAttempt.findUnique({ where: { keyHash } });
    if (attempt?.blockedUntil && attempt.blockedUntil > at) return { ok: false as const, code: "PIN_LOCKED", retryAt: attempt.blockedUntil };
    const matches = await pinVerifier(pin, member?.passwordHash ?? `scrypt-v1$${"0".repeat(32)}$${"0".repeat(128)}`);
    if (!matches || member?.status !== "active") {
      const failures = (attempt?.blockedUntil ? 0 : attempt?.failures ?? 0) + 1;
      const blockedUntil = failures >= 5 ? new Date((await now(tx)).getTime() + 600_000) : null;
      await tx.authAttempt.upsert({ where: { keyHash }, create: { keyHash, promiseId, failures, blockedUntil, expiresAt }, update: { failures, blockedUntil } });
      return blockedUntil ? { ok: false as const, code: "PIN_LOCKED", retryAt: blockedUntil } : { ok: false as const, code: "INVALID_CREDENTIALS" };
    }
    await tx.authAttempt.deleteMany({ where: { keyHash } });
    return { ok: true };
  }
  return {
    async page(input: SessionInput): Promise<{ ok: true; view: ParticipantView; settings?: Pick<PromiseSettingsDefaults, "dateRangeStart" | "dateRangeEnd" | "dailyStart" | "dailyEnd" | "durationMinutes"> } | AccessFailure> {
      try { return await db.$transaction(async tx => {
        const access = await requireSession(tx, input);
        if (!access.ok && access.code !== "UNAUTHORIZED") return access;
        const link = await tx.promiseLink.findUnique({ where: { inviteToken: input.inviteToken }, include: { promise: true } });
        const promise = link?.promise;
        if (!promise) return { ok: false as const, code: "INVALID_LINK" };
        const at = await now(tx);
        const status = promise.status === "collecting" && promise.votingDeadlineAt && promise.votingDeadlineAt <= at ? "closed" : promise.status;
        if (access.ok) {
          const { nickname, role } = access.session.participant;
          const view: ParticipantView = { kind: "participant", nickname, role, status };
          if (role === "host" && status === "collecting" && promise.dateRangeStart && promise.dateRangeEnd && promise.dailyStartMinute !== null && promise.dailyEndMinute !== null && promise.durationMinutes !== null) {
            const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
            return { ok: true as const, view, settings: { dateRangeStart: promise.dateRangeStart.toISOString().slice(0, 10), dateRangeEnd: promise.dateRangeEnd.toISOString().slice(0, 10), dailyStart: time(promise.dailyStartMinute), dailyEnd: time(promise.dailyEndMinute), durationMinutes: String(promise.durationMinutes) } };
          }
          return { ok: true as const, view };
        }
        const count = await tx.participant.count({ where: { promiseId: promise.id, status: "active" } });
        const registration = status === "draft" ? "draft" : status !== "collecting" ? "closed" : count >= (promise.participantLimit ?? 0) ? "full" : "open";
        return { ok: true as const, view: { kind: "anonymous" as const, registration } };
      }); } catch { return { ok: false, code: "UNAVAILABLE" }; }
    },
    async consumeRequest(clientAddress: string): Promise<{ ok: true } | AccessFailure> {
      try { return await db.$transaction(async tx => {
        const keyHash = tokenHash(JSON.stringify(["ip", clientAddress]));
        await tx.$queryRaw`SELECT key_hash FROM auth_attempts WHERE key_hash = ${keyHash} FOR UPDATE`;
        await tx.$executeRaw`INSERT INTO auth_attempts (key_hash, failures, expires_at) VALUES (${keyHash}, 0, to_timestamp(0)) ON CONFLICT DO NOTHING`;
        await tx.$queryRaw`SELECT key_hash FROM auth_attempts WHERE key_hash = ${keyHash} FOR UPDATE`;
        const at = await now(tx);
        const row = await tx.authAttempt.findUniqueOrThrow({ where: { keyHash } });
        const active = row.expiresAt > at;
        if (active && row.failures >= 30) return { ok: false as const, code: "RATE_LIMITED", retryAt: row.expiresAt };
        await tx.authAttempt.update({ where: { keyHash }, data: { failures: active ? row.failures + 1 : 1, expiresAt: active ? row.expiresAt : new Date(at.getTime() + 600_000) } });
        return { ok: true as const };
      }); } catch { return { ok: false, code: "UNAVAILABLE" }; }
    },
    async changePin(input: SessionInput & { currentPin: unknown; newPin: unknown }): Promise<{ ok: true } | AccessFailure> {
      try { return await db.$transaction(async tx => {
        const access = await requireSession(tx, input);
        if (!access.ok) return access;
        const member = access.session.participant;
        const next = validateRegistration(member.nickname, input.newPin);
        if (!next) return { ok: false as const, code: "INVALID_INPUT" };
        const current = validateRegistration(member.nickname, input.currentPin);
        const checked = await checkPin(tx, access.promise.id, member.normalizedNickname, current?.pin ?? "", member, access.at, linkExpiresAt(access.link.createdAt));
        if (!checked.ok) return checked;
        if (next.pin === current?.pin) return { ok: false as const, code: "SAME_PIN" };
        const passwordHash = await pinHasher(next.pin);
        const latest = await requireSession(tx, input);
        if (!latest.ok) return latest;
        await tx.participant.update({ where: { id: member.id }, data: { passwordHash } });
        await tx.participantSession.deleteMany({ where: { participantId: member.id } });
        return { ok: true as const };
      }); } catch { return { ok: false, code: "UNAVAILABLE" }; }
    },
    async read(input: SessionInput): Promise<AccessResult> {
      try { return await db.$transaction(async tx => {
        const access = await requireSession(tx, input);
        if (!access.ok) return access;
        const { id, nickname, role } = access.session.participant;
        const status = access.promise.status === "collecting" && access.promise.votingDeadlineAt && access.promise.votingDeadlineAt <= access.at ? "closed" : access.promise.status;
        return { ok: true as const, participant: { id, nickname, role }, status };
      }); } catch { return { ok: false, code: "UNAVAILABLE" }; }
    },
    async logout(input: SessionInput): Promise<{ ok: true } | AccessFailure> {
      try { return await db.$transaction(async tx => {
        const access = await requireSession(tx, input);
        if (!access.ok) return access;
        await tx.participantSession.delete({ where: { id: access.session.id } });
        return { ok: true as const };
      }); } catch { return { ok: false, code: "UNAVAILABLE" }; }
    },
    async authenticate(input: Credentials): Promise<RegistrationResult> {
      const valid = validateRegistration(input.nickname, input.pin);
      if (!valid) return { ok: false, code: "INVALID_CREDENTIALS" };
      try {
        return await db.$transaction(async tx => {
          await tx.$queryRaw`SELECT p.id FROM promises p JOIN promise_links l ON l.id = p.promise_link_id WHERE l.invite_token = ${input.inviteToken} FOR UPDATE OF p`;
          const link = await tx.promiseLink.findUnique({ where: { inviteToken: input.inviteToken }, include: { promise: true } });
          const at = await now(tx);
          if (!link) return { ok: false as const, code: "INVALID_LINK" };
          if (linkExpiresAt(link.createdAt) <= at) return { ok: false as const, code: "LINK_EXPIRED" };
          if (!link.promise) return { ok: false as const, code: "INVALID_CREDENTIALS" };
          if (link.promise.status === "cancelled") return { ok: false as const, code: "PROMISE_CANCELLED" };
          if (link.promise.status === "draft" && draftExpiresAt(link.promise.createdAt) <= at) return { ok: false as const, code: "DRAFT_EXPIRED" };
          const member = await tx.participant.findUnique({ where: { promiseId_normalizedNickname: { promiseId: link.promise.id, normalizedNickname: valid.normalizedNickname } } });
          const checked = await checkPin(tx, link.promise.id, valid.normalizedNickname, valid.pin, member, at, linkExpiresAt(link.createdAt));
          if (!checked.ok) return checked;
          if (!member) return { ok: false as const, code: "INVALID_CREDENTIALS" };
          const successAt = await now(tx);
          if (linkExpiresAt(link.createdAt) <= successAt) return { ok: false as const, code: "LINK_EXPIRED" };
          if (link.promise.status === "draft" && draftExpiresAt(link.promise.createdAt) <= successAt) return { ok: false as const, code: "DRAFT_EXPIRED" };
          const sessionToken = newToken();
          const expiresAt = sessionExpiresAt(successAt);
          await tx.participantSession.create({ data: { participantId: member.id, sessionTokenHash: tokenHash(sessionToken), expiresAt } });
          return { ok: true as const, sessionToken, expiresAt };
        });
      } catch { return { ok: false, code: "UNAVAILABLE" }; }
    },
    async join(input: Credentials): Promise<RegistrationResult> {
      const valid = validateRegistration(input.nickname, input.pin);
      if (!valid) return { ok: false, code: "INVALID_INPUT" };
      try {
        const passwordHash = await pinHasher(valid.pin);
        return await db.$transaction(async tx => {
          await tx.$queryRaw`SELECT p.id FROM promises p JOIN promise_links l ON l.id = p.promise_link_id WHERE l.invite_token = ${input.inviteToken} FOR UPDATE OF p`;
          const link = await tx.promiseLink.findUnique({ where: { inviteToken: input.inviteToken }, include: { promise: true } });
          const at = await now(tx);
          if (!link) return { ok: false as const, code: "INVALID_LINK" };
          if (linkExpiresAt(link.createdAt) <= at) return { ok: false as const, code: "LINK_EXPIRED" };
          if (link.promise?.status === "cancelled") return { ok: false as const, code: "PROMISE_CANCELLED" };
          if (link.promise?.status === "collecting" && link.promise.votingDeadlineAt && link.promise.votingDeadlineAt <= at) {
            await tx.promiseRecord.update({ where: { id: link.promise.id }, data: { status: "closed" } });
            return { ok: false as const, code: "REGISTRATION_CLOSED" };
          }
          if (link.promise?.status === "closed" || link.promise?.status === "confirmed") return { ok: false as const, code: "REGISTRATION_CLOSED" };
          if (link.promise?.status !== "collecting" || !link.promise.votingDeadlineAt) return { ok: false as const, code: "NOT_COLLECTING" };
          const count = await tx.participant.count({ where: { promiseId: link.promise.id, status: "active" } });
          if (count >= (link.promise.participantLimit ?? 0)) return { ok: false as const, code: "CAPACITY_FULL" };
          const duplicate = await tx.participant.findUnique({ where: { promiseId_normalizedNickname: { promiseId: link.promise.id, normalizedNickname: valid.normalizedNickname } } });
          if (duplicate) return { ok: false as const, code: "NICKNAME_TAKEN" };
          const member = await tx.participant.create({ data: { promiseId: link.promise.id, nickname: valid.nickname, normalizedNickname: valid.normalizedNickname, passwordHash, role: "member", createdAt: await now(tx) } });
          const sessionToken = newToken();
          const expiresAt = sessionExpiresAt(link.promise.votingDeadlineAt);
          await tx.participantSession.create({ data: { participantId: member.id, sessionTokenHash: tokenHash(sessionToken), expiresAt } });
          return { ok: true as const, sessionToken, expiresAt };
        });
      } catch { return { ok: false, code: "UNAVAILABLE" }; }
    },
  };
}
