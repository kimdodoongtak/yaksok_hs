import { describe, expect, it } from "vitest";
import {
  defaultPromiseSettings,
  defaultVotingDeadline,
  validatePromiseSettings,
  type PromiseSettingsInput,
} from "./policy";

const now = new Date("2026-11-13T00:00:00Z");
const validInput: PromiseSettingsInput = {
  participantLimit: "10",
  dateRangeStart: "2026-11-14",
  dateRangeEnd: "2026-11-15",
  dailyStart: "09:00",
  dailyEnd: "18:00",
  durationMinutes: "120",
  votingDeadline: "2026-11-13T10:00",
};

describe("약속 설정 입력 정책", () => {
  it("시작일 기준 기본 마감은 월말·연말·윤년을 넘어 정확히 7일 뒤 23:59다", () => {
    expect(defaultVotingDeadline("2026-11-28")).toBe("2026-12-05T23:59");
    expect(defaultVotingDeadline("2026-12-28")).toBe("2027-01-04T23:59");
    expect(defaultVotingDeadline("2027-02-25")).toBe("2027-03-04T23:59");
    expect(defaultVotingDeadline("2028-02-25")).toBe("2028-03-03T23:59");
    expect(defaultVotingDeadline("")).toBe("");
    expect(defaultVotingDeadline("2027-02-29")).toBe("");
  });

  it("KST 오늘을 기준으로 화면 기본값과 월말 보정 날짜를 계산한다", () => {
    expect(defaultPromiseSettings(now)).toEqual({
      participantLimit: "5",
      dateRangeStart: "2026-11-13",
      dateRangeEnd: "2026-12-13",
      dailyStart: "09:00",
      dailyEnd: "24:00",
      durationMinutes: "120",
      votingDeadline: "2026-11-20T23:59",
    });
    expect(
      defaultPromiseSettings(new Date("2027-01-31T01:00:00Z")),
    ).toMatchObject({
      dateRangeStart: "2027-01-31",
      dateRangeEnd: "2027-02-28",
      votingDeadline: "2027-02-07T23:59",
    });
  });

  it("정원은 정수 2명과 30명을 허용하고 범위 밖 값은 거절한다", () => {
    for (const participantLimit of ["2", "30"]) {
      expect(
        validatePromiseSettings({ ...validInput, participantLimit }, now),
      ).toMatchObject({
        ok: true,
        value: { participantLimit: Number(participantLimit) },
      });
    }

    for (const participantLimit of ["", "1", "31", "2.5", 2.5]) {
      expect(
        validatePromiseSettings({ ...validInput, participantLimit }, now),
      ).toMatchObject({
        ok: false,
        fieldErrors: { participantLimit: expect.any(String) },
      });
    }
  });

  it("하루 시간과 소요 시간은 30분 단위이며 24:00 종료를 1440분으로 변환한다", () => {
    expect(
      validatePromiseSettings(
        {
          ...validInput,
          dailyStart: "00:00",
          dailyEnd: "24:00",
          durationMinutes: "1440",
        },
        now,
      ),
    ).toMatchObject({
      ok: true,
      value: {
        dailyStartMinute: 0,
        dailyEndMinute: 1440,
        durationMinutes: 1440,
      },
    });

    for (const change of [
      { dailyStart: "09:15" },
      { dailyStart: "24:00" },
      { dailyEnd: "00:00" },
      { dailyEnd: "18:15" },
      { dailyStart: "18:00", dailyEnd: "18:00" },
      { dailyStart: "18:30", dailyEnd: "18:00" },
      { durationMinutes: "0" },
      { durationMinutes: "45" },
      { durationMinutes: "570" },
    ]) {
      const result = validatePromiseSettings({ ...validInput, ...change }, now);
      expect(result, JSON.stringify(change)).toMatchObject({ ok: false });
      if (!result.ok) {
        expect(
          result.fieldErrors.dailyStart ??
            result.fieldErrors.dailyEnd ??
            result.fieldErrors.durationMinutes,
        ).toEqual(expect.any(String));
      }
    }
  });

  it("KST 오늘부터 시작해 달력 3개월과 양끝 포함 90일 상한을 함께 적용한다", () => {
    for (const range of [
      { dateRangeStart: "2026-11-13", dateRangeEnd: "2027-02-10" },
      { dateRangeStart: "2026-12-01", dateRangeEnd: "2027-02-13" },
    ]) {
      expect(
        validatePromiseSettings({ ...validInput, ...range }, now),
      ).toMatchObject({ ok: true, value: range });
    }

    for (const range of [
      { dateRangeStart: "2026-11-12", dateRangeEnd: "2026-11-14" },
      { dateRangeStart: "2026-11-13", dateRangeEnd: "2027-02-11" },
      { dateRangeStart: "2026-12-01", dateRangeEnd: "2027-02-14" },
      { dateRangeStart: "2026-11-15", dateRangeEnd: "2026-11-14" },
      { dateRangeStart: "2026-02-30", dateRangeEnd: "2026-11-14" },
    ]) {
      const result = validatePromiseSettings({ ...validInput, ...range }, now);
      expect(result, JSON.stringify(range)).toMatchObject({ ok: false });
      if (!result.ok) {
        expect(
          result.fieldErrors.dateRangeStart ?? result.fieldErrors.dateRangeEnd,
        ).toEqual(expect.any(String));
      }
    }

    const monthEndNow = new Date("2026-11-29T15:00:00Z");
    expect(
      validatePromiseSettings(
        {
          ...validInput,
          dateRangeStart: "2026-12-01",
          dateRangeEnd: "2027-02-28",
          votingDeadline: "2026-11-30T10:00",
        },
        monthEndNow,
      ),
    ).toMatchObject({ ok: true });
    expect(
      validatePromiseSettings(
        {
          ...validInput,
          dateRangeStart: "2026-12-01",
          dateRangeEnd: "2027-03-01",
          votingDeadline: "2026-11-30T10:00",
        },
        monthEndNow,
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { dateRangeEnd: expect.any(String) },
    });
  });

  it("응답 마감은 미래이며 그 뒤에 약속 전체가 들어가는 시작 시각이 남아야 한다", () => {
    expect(validatePromiseSettings(validInput, now)).toMatchObject({
      ok: true,
      value: {
        votingDeadlineAt: new Date("2026-11-13T01:00:00Z"),
      },
    });

    for (const votingDeadline of [
      "",
      "2026-11-13T09:00",
      "2026-11-13T08:59",
      "2026-02-30T12:00",
    ]) {
      expect(
        validatePromiseSettings({ ...validInput, votingDeadline }, now),
      ).toMatchObject({
        ok: false,
        fieldErrors: { votingDeadline: expect.any(String) },
      });
    }

    const tightRange = {
      ...validInput,
      dateRangeStart: "2026-11-14",
      dateRangeEnd: "2026-11-14",
      dailyStart: "09:00",
      dailyEnd: "10:00",
      durationMinutes: "60",
    };
    expect(
      validatePromiseSettings(
        { ...tightRange, votingDeadline: "2026-11-14T08:59" },
        now,
      ),
    ).toMatchObject({ ok: true });
    expect(
      validatePromiseSettings(
        { ...tightRange, votingDeadline: "2026-11-14T09:00" },
        now,
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { votingDeadline: expect.any(String) },
    });
  });
});
