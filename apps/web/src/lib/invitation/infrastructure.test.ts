import { expect, it, vi, afterEach } from "vitest";
import { sessionCookie, validInviteToken } from "./cookie";
import { verifyTestDatabase } from "../../../scripts/test-database.mjs";
afterEach(() => vi.unstubAllEnvs());
// 기존 환경 보호·쿠키 연결에 대한 회귀 검증이다.
it("운영 쿠키는 Secure·HttpOnly·약속별 범위와 고정 만료를 갖는다", () => {
  vi.stubEnv("NODE_ENV", "production");
  const a = "a".repeat(43),
    b = "b".repeat(43),
    expires = new Date("2026-11-13");
  expect(sessionCookie(a, expires)).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: `/p/${a}`,
    expires,
  });
  expect(sessionCookie(a, expires).name).not.toBe(
    sessionCookie(b, expires).name,
  );
  expect(validInviteToken(a)).toBe(true);
  for (const input of [null, "", a + "/", a + "\n", "../settings"])
    expect(validInviteToken(input)).toBe(false);
});
it("테스트 실행기는 개발·원격·잘못된 역할과 연결 옵션을 접속 전에 거부한다", async () => {
  for (const url of [
    undefined,
    "bad",
    "postgres://sdd_test:fake@db/sdd",
    "postgres://sdd_test:fake@example.com/sdd_test",
    "postgres://sdd:fake@db/sdd_test",
    "postgres://sdd_test:fake@db/sdd_test?host=example.com",
  ]) {
    await expect(verifyTestDatabase(url)).rejects.toThrow();
  }
});
