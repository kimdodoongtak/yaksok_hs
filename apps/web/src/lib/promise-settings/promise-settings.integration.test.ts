import { afterAll, beforeAll, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { verifyTestDatabase } from "../../../scripts/test-database.mjs";
import { createInvitationService } from "../invitation/service";
import { newToken, tokenHash } from "../invitation/security";
import { createPromiseSettingsService } from "./service";
import type { PromiseSettingsInput } from "./policy";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }),
});
const links: string[] = [];
const now = new Date("2026-11-13T00:00:00Z");
const invitation = createInvitationService(db, () => now, async () => "hash");
const settingsService = createPromiseSettingsService(db, () => now);
const validSettings: PromiseSettingsInput = {
  participantLimit: "10",
  dateRangeStart: "2026-11-14",
  dateRangeEnd: "2026-11-15",
  dailyStart: "09:00",
  dailyEnd: "18:00",
  durationMinutes: "120",
  votingDeadline: "2026-11-13T10:00",
};
let verified = false;

beforeAll(async () => {
  await verifyTestDatabase(process.env.TEST_DATABASE_URL);
  verified = true;
});

afterAll(async () => {
  if (verified) {
    await db.participantSession.deleteMany({
      where: { participant: { promise: { promiseLinkId: { in: links } } } },
    });
    await db.participant.deleteMany({
      where: { promise: { promiseLinkId: { in: links } } },
    });
    await db.promiseRecord.deleteMany({
      where: { promiseLinkId: { in: links } },
    });
    await db.promiseLink.deleteMany({ where: { id: { in: links } } });
  }
  await db.$disconnect();
});

async function hostFixture() {
  const link = await db.promiseLink.create({
    data: { inviteToken: newToken(), createdAt: now },
  });
  links.push(link.id);
  const registration = await invitation.registerHost({
    inviteToken: link.inviteToken,
    nickname: "방장",
    pin: "1234",
  });
  if (!registration.ok) throw new Error("방장 fixture 생성 실패");
  return { link, registration };
}

it("유효한 방장 요청은 설정·상태·현재 세션 만료를 원자적으로 갱신한다", async () => {
  const { link, registration } = await hostFixture();
  const result = await settingsService.startCollection({
    inviteToken: link.inviteToken,
    sessionToken: registration.sessionToken,
    settings: validSettings,
  });

  expect(result).toEqual({
    ok: true,
    expiresAt: new Date("2026-11-20T01:00:00Z"),
  });
  const promise = await db.promiseRecord.findUniqueOrThrow({
    where: { promiseLinkId: link.id },
  });
  expect(promise).toMatchObject({
    status: "collecting",
    participantLimit: 10,
    dateRangeStart: new Date("2026-11-14T00:00:00Z"),
    dateRangeEnd: new Date("2026-11-15T00:00:00Z"),
    dailyStartMinute: 540,
    dailyEndMinute: 1080,
    durationMinutes: 120,
    votingDeadlineAt: new Date("2026-11-13T01:00:00Z"),
  });
  const session = await db.participantSession.findUniqueOrThrow({
    where: { sessionTokenHash: tokenHash(registration.sessionToken) },
  });
  expect(session.expiresAt).toEqual(new Date("2026-11-20T01:00:00Z"));
  expect(
    await invitation.readInvitation(
      link.inviteToken,
      registration.sessionToken,
    ),
  ).toEqual({
    state: "ready",
    settings: {
      dateRangeStart: "2026-11-14", dateRangeEnd: "2026-11-15",
      dailyStart: "09:00", dailyEnd: "18:00", durationMinutes: "120",
    },
  });
  expect(await invitation.readInvitation(link.inviteToken)).toEqual({ state: "ready" });
  expect(await invitation.readInvitation(link.inviteToken, "forged")).toEqual({ state: "ready" });
  const other = await hostFixture();
  expect(await invitation.readInvitation(link.inviteToken, other.registration.sessionToken)).toEqual({ state: "ready" });
  const expiredSession = createInvitationService(db, () => new Date("2026-11-20T01:00:00Z"));
  expect(await expiredSession.readInvitation(link.inviteToken, registration.sessionToken)).toEqual({ state: "ready" });
  const expiredLink = createInvitationService(db, () => new Date("2027-02-13T00:00:00Z"));
  expect(await expiredLink.readInvitation(link.inviteToken, registration.sessionToken)).toEqual({ state: "expired" });
});

it("유효한 방장이 만료 초안을 시작하려 하면 초안만 정리하고 링크는 보존한다", async () => {
  const { link, registration } = await hostFixture();
  const expiredService = createPromiseSettingsService(
    db,
    () => new Date(now.getTime() + 600_000),
  );

  expect(
    await expiredService.startCollection({
      inviteToken: link.inviteToken,
      sessionToken: registration.sessionToken,
      settings: validSettings,
    }),
  ).toEqual({ ok: false, code: "DRAFT_EXPIRED" });
  expect(
    await db.promiseRecord.findUnique({ where: { promiseLinkId: link.id } }),
  ).toBeNull();
  expect(await db.promiseLink.count({ where: { id: link.id } })).toBe(1);
});

it("위조 세션·만료 링크·현재 active 인원보다 작은 정원은 아무 설정도 저장하지 않는다", async () => {
  const first = await hostFixture();
  expect(
    await settingsService.startCollection({
      inviteToken: first.link.inviteToken,
      sessionToken: "forged",
      settings: validSettings,
    }),
  ).toEqual({ ok: false, code: "UNAUTHORIZED" });

  const promise = await db.promiseRecord.findUniqueOrThrow({
    where: { promiseLinkId: first.link.id },
  });
  for (const [nickname, normalizedNickname] of [
    ["멤버하나", "멤버하나"],
    ["멤버둘", "멤버둘"],
  ]) {
    await db.participant.create({
      data: {
        promiseId: promise.id,
        nickname,
        normalizedNickname,
        passwordHash: "test-only",
        role: "member",
      },
    });
  }
  expect(
    await settingsService.startCollection({
      inviteToken: first.link.inviteToken,
      sessionToken: first.registration.sessionToken,
      settings: { ...validSettings, participantLimit: "2" },
    }),
  ).toMatchObject({
    ok: false,
    code: "INVALID_INPUT",
    fieldErrors: { participantLimit: expect.any(String) },
  });

  await db.promiseLink.update({
    where: { id: first.link.id },
    data: { createdAt: new Date("2026-08-13T00:00:00Z") },
  });
  expect(
    await settingsService.startCollection({
      inviteToken: first.link.inviteToken,
      sessionToken: first.registration.sessionToken,
      settings: validSettings,
    }),
  ).toEqual({ ok: false, code: "LINK_EXPIRED" });
  expect(
    await db.promiseRecord.findUniqueOrThrow({
      where: { promiseLinkId: first.link.id },
    }),
  ).toMatchObject({ status: "draft", participantLimit: null });
});

it("세션 연장 실패는 설정과 상태 변경도 함께 롤백한다", async () => {
  const { link, registration } = await hostFixture();
  await db.$executeRawUnsafe(
    `CREATE FUNCTION test_reject_session_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$`,
  );
  try {
    await db.$executeRawUnsafe(
      `CREATE TRIGGER test_session_update_failure BEFORE UPDATE ON participant_sessions FOR EACH ROW EXECUTE FUNCTION test_reject_session_update()`,
    );
    expect(
      await settingsService.startCollection({
        inviteToken: link.inviteToken,
        sessionToken: registration.sessionToken,
        settings: validSettings,
      }),
    ).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(
      await db.promiseRecord.findUniqueOrThrow({
        where: { promiseLinkId: link.id },
      }),
    ).toMatchObject({ status: "draft", participantLimit: null });
    expect(
      await db.participantSession.findUniqueOrThrow({
        where: { sessionTokenHash: tokenHash(registration.sessionToken) },
      }),
    ).toMatchObject({ expiresAt: new Date("2026-11-13T00:10:00Z") });
  } finally {
    await db.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS test_session_update_failure ON participant_sessions`,
    );
    await db.$executeRawUnsafe(`DROP FUNCTION test_reject_session_update()`);
  }
});

it("독립 연결의 동시 모집 시작은 하나만 성공하고 최종 상태는 collecting이다", async () => {
  const { link, registration } = await hostFixture();
  const other = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }),
  });
  try {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const attempt = async (client: PrismaClient) => {
      await gate;
      return createPromiseSettingsService(client, () => now).startCollection({
        inviteToken: link.inviteToken,
        sessionToken: registration.sessionToken,
        settings: validSettings,
      });
    };
    const pending = [attempt(db), attempt(other)];
    release();
    const results = await Promise.all(pending);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, code: "NOT_DRAFT" },
    ]);
    expect(
      await db.promiseRecord.findUniqueOrThrow({
        where: { promiseLinkId: link.id },
      }),
    ).toMatchObject({ status: "collecting", participantLimit: 10 });
  } finally {
    await other.$disconnect();
  }
});
