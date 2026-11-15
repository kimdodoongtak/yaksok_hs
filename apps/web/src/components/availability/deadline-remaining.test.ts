import { describe, expect, it } from "vitest";
import { deadlineRemaining } from "./deadline-remaining";

describe("마감까지 남은 시간", () => {
  it.each([
    [183600000, "2일 3시간"],
    [86400000, "1일"],
    [12000000, "3시간 20분"],
    [3600000, "1시간"],
    [60000, "1분"],
    [59999, "1분 미만"],
    [1, "1분 미만"],
    [0, "응답 마감"],
    [-1000, "응답 마감"],
  ])("%i ms → %s", (remaining, expected) => {
    expect(deadlineRemaining(remaining)).toBe(expected);
  });
});
