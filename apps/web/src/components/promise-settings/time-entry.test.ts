import { describe, expect, it } from "vitest";
import { formatTimeEntry, parseDurationEntry, parseTimeEntry } from "./time-entry";

describe("시간대 직접 입력", () => {
  it("시각과 숫자 입력을 같은 30분 시각으로 해석한다", () => {
    for (const value of ["9", "09", "900", "0900", "09:00"]) expect(parseTimeEntry(value, 0, 1410)).toBe(540);
    for (const value of ["930", "0930", "9:30", "09:30"]) expect(parseTimeEntry(value, 0, 1410)).toBe(570);
    expect(formatTimeEntry(570)).toBe("09:30");
  });
  it("자정 경계와 시작/종료 범위를 구분한다", () => {
    expect(parseTimeEntry("0", 0, 1410)).toBe(0);
    expect(parseTimeEntry("2330", 0, 1410)).toBe(1410);
    expect(parseTimeEntry("24", 0, 1410)).toBeNull();
    expect(parseTimeEntry("0", 30, 1440)).toBeNull();
    expect(parseTimeEntry("0030", 30, 1440)).toBe(30);
    expect(parseTimeEntry("2400", 30, 1440)).toBe(1440);
    expect(formatTimeEntry(1440)).toBe("24:00");
  });
  it("부정확한 입력을 자동 반올림하지 않는다", () => {
    for (const value of ["", " ", "9:", "9:3", "915", "2360", "24:30", "25", "-1", "1e2", "9.5", "09000"]) {
      expect(parseTimeEntry(value, 0, 1440), value).toBeNull();
    }
  });
});

describe("소요 시간 직접 입력", () => {
  it("시간/분과 30분·24시간 경계를 지원한다", () => {
    expect(parseDurationEntry("2", "30")).toBe(150);
    expect(parseDurationEntry("00", "30")).toBe(30);
    expect(parseDurationEntry("24", "00")).toBe(1440);
  });
  it("빈 값·범위 밖·30분 단위가 아닌 값을 차단한다", () => {
    for (const [hours, minutes] of [["", "30"], ["2", ""], ["0", "0"], ["24", "30"], ["25", "0"], ["2", "15"], ["1", "60"], ["-1", "30"], ["2.5", "0"]]) {
      expect(parseDurationEntry(hours, minutes)).toBeNull();
    }
  });
});
