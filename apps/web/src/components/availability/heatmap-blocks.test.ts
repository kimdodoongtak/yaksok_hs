import { describe, expect, it } from "vitest";
import { samePeople } from "./heatmap-blocks";
describe("연속 시간의 참여자 구획", () => {
  it("순서가 달라도 같은 사람이면 연결한다", () => {
    expect(samePeople([0, 2], [2, 0])).toBe(true);
  });
  it("인원수만 같거나 한 명이라도 바뀌면 연결하지 않는다", () => {
    expect(samePeople([0, 2], [0, 1])).toBe(false);
    expect(samePeople([0, 2], [0, 1, 2])).toBe(false);
  });
  it("빈 칸과 조회되지 않은 칸은 블록을 만들지 않는다", () => {
    expect(samePeople([], [])).toBe(false);
    expect(samePeople(undefined, [0])).toBe(false);
  });
});
