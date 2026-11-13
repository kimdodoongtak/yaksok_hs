import { describe, expect, it } from "vitest";
import { validateRegistration } from "./policy";

describe("방장 입력 정책", () => {
  it("앞뒤 공백과 한글 조합을 정규화하고 영문 대소문자는 중복 키에서만 접는다", () => {
    expect(validateRegistration("  Iris  ", "0012")).toEqual({
      nickname: "Iris",
      normalizedNickname: "iris",
      pin: "0012",
    });
    expect(validateRegistration("가나", "1234")?.nickname).toBe("가나");
    expect(validateRegistration("홍 길동", "1234")?.normalizedNickname).toBe(
      "홍 길동",
    );
    expect(validateRegistration("a\u0301b", "1234")?.nickname).toBe("áb");
  });
});

it("2~12자와 이모지 금지, 숫자 4자리 PIN의 경계를 검사한다", () => {
  for (const name of [
    "",
    "가",
    "가".repeat(13),
    "가😀",
    "가🇰🇷",
    "가1️⃣",
    "가👨‍👩‍👧",
    "가🏽",
    "가\u200B",
    "가\u2800",
    "\u2800\u2800",
    "가\n나",
    "가\u0000나",
  ]) {
    expect(validateRegistration(name, "1234"), name).toBeNull();
  }
  for (const pin of ["123", "12345", "12ab", "１２３４", " 1234", "1234\n"])
    expect(validateRegistration("가나", pin)).toBeNull();
  for (const name of ["가나", "가".repeat(12), "a\u0308".repeat(12), "뿅땨"])
    expect(validateRegistration(name, "0000")).not.toBeNull();
  expect(validateRegistration(null, "1234")).toBeNull();
});

import {
  linkExpiresAt,
  draftExpiresAt,
  sessionExpiresAt,
  isExpired,
} from "./policy";
it("KST 달력 3개월의 평년·윤년·연도·자정 경계를 보정하고 정각부터 만료한다", () => {
  for (const [start, end] of [
    ["2026-01-31T15:00:00+09:00", "2026-04-30T15:00:00+09:00"],
    ["2023-11-30T00:30:00+09:00", "2024-02-29T00:30:00+09:00"],
    ["2026-11-13T15:00:00+09:00", "2027-02-13T15:00:00+09:00"],
    ["2026-11-30T00:01:00.123+09:00", "2027-02-28T00:01:00.123+09:00"],
  ])
    expect(linkExpiresAt(new Date(start))).toEqual(new Date(end));
  const start = new Date("2026-11-13T00:00:00Z");
  expect(draftExpiresAt(start)).toEqual(new Date("2026-11-13T00:10:00Z"));
  expect(sessionExpiresAt(start)).toEqual(new Date("2026-11-20T00:00:00Z"));
  expect(isExpired(start, new Date(start.getTime() - 1))).toBe(false);
  expect(isExpired(start, start)).toBe(true);
});
