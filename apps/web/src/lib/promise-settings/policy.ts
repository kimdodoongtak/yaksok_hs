export type PromiseSettingsField =
  | "participantLimit"
  | "dateRangeStart"
  | "dateRangeEnd"
  | "dailyStart"
  | "dailyEnd"
  | "durationMinutes"
  | "votingDeadline";

export type PromiseSettingsInput = Record<PromiseSettingsField, unknown>;
export type PromiseSettingsDefaults = Record<PromiseSettingsField, string>;

export type ValidPromiseSettings = {
  participantLimit: number;
  dateRangeStart: string;
  dateRangeEnd: string;
  dailyStartMinute: number;
  dailyEndMinute: number;
  durationMinutes: number;
  votingDeadlineAt: Date;
};

export type PromiseSettingsValidation =
  | { ok: true; value: ValidPromiseSettings }
  | {
      ok: false;
      fieldErrors: Partial<Record<PromiseSettingsField, string>>;
    };

function parseTime(value: unknown, allowEndOfDay: boolean): number | null {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
  if (allowEndOfDay && value === "24:00") return 1440;
  const [hour, minute] = value.split(":").map(Number);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  return typeof value === "string" && /^\d+$/.test(value)
    ? Number(value)
    : null;
}

const DAY_MS = 86_400_000;
const KST_MS = 9 * 60 * 60 * 1000;

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

function kstToday(now: Date): Date {
  const local = new Date(now.getTime() + KST_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
}

function addCalendarMonths(date: Date, months: number): Date {
  const targetMonth = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      Math.min(date.getUTCDate(), lastDay),
    ),
  );
}

function formatDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function parseKstDateTime(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const date = parseDate(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (!date || hour > 23 || minute > 59) return null;
  return new Date(date.getTime() + (hour * 60 + minute) * 60_000 - KST_MS);
}

export function defaultVotingDeadline(startDate: string): string {
  const start = parseDate(startDate);
  if (!start) return "";
  return `${formatDate(new Date(start.getTime() + 7 * DAY_MS))}T23:59`;
}

export function defaultPromiseSettings(now: Date): PromiseSettingsDefaults {
  const today = kstToday(now);
  return {
    participantLimit: "5",
    dateRangeStart: formatDate(today),
    dateRangeEnd: formatDate(addCalendarMonths(today, 1)),
    dailyStart: "09:00",
    dailyEnd: "24:00",
    durationMinutes: "120",
    votingDeadline: defaultVotingDeadline(formatDate(today)),
  };
}

export function validatePromiseSettings(
  input: PromiseSettingsInput,
  _now: Date,
): PromiseSettingsValidation {
  const participantLimit = parseInteger(input.participantLimit);
  if (
    participantLimit === null ||
    participantLimit < 2 ||
    participantLimit > 30
  ) {
    return {
      ok: false,
      fieldErrors: {
        participantLimit: "정원은 방장을 포함해 2~30명으로 입력해 주세요.",
      },
    };
  }

  const dateRangeStart = parseDate(input.dateRangeStart);
  const today = kstToday(_now);
  if (!dateRangeStart || dateRangeStart < today) {
    return {
      ok: false,
      fieldErrors: {
        dateRangeStart: "시작일은 KST 기준 오늘 이후 날짜로 선택해 주세요.",
      },
    };
  }
  const dateRangeEnd = parseDate(input.dateRangeEnd);
  if (!dateRangeEnd || dateRangeEnd < dateRangeStart) {
    return {
      ok: false,
      fieldErrors: {
        dateRangeEnd: "종료일은 시작일과 같거나 이후여야 합니다.",
      },
    };
  }
  const calendarLimit = addCalendarMonths(today, 3);
  if (dateRangeEnd > calendarLimit) {
    return {
      ok: false,
      fieldErrors: {
        dateRangeEnd: "종료일은 KST 기준 오늘부터 달력 3개월 이내여야 합니다.",
      },
    };
  }
  if ((dateRangeEnd.getTime() - dateRangeStart.getTime()) / DAY_MS > 89) {
    return {
      ok: false,
      fieldErrors: {
        dateRangeEnd: "날짜 범위는 시작일과 종료일을 포함해 90일 이하여야 합니다.",
      },
    };
  }

  const dailyStartMinute = parseTime(input.dailyStart, false);
  if (dailyStartMinute === null || dailyStartMinute % 30 !== 0) {
    return {
      ok: false,
      fieldErrors: {
        dailyStart: "시작 시간은 00:00~23:30 사이 30분 단위로 선택해 주세요.",
      },
    };
  }
  const dailyEndMinute = parseTime(input.dailyEnd, true);
  if (
    dailyEndMinute === null ||
    dailyEndMinute < 30 ||
    dailyEndMinute % 30 !== 0
  ) {
    return {
      ok: false,
      fieldErrors: {
        dailyEnd: "종료 시간은 00:30~24:00 사이 30분 단위로 선택해 주세요.",
      },
    };
  }
  if (dailyStartMinute >= dailyEndMinute) {
    return {
      ok: false,
      fieldErrors: { dailyEnd: "종료 시간은 시작 시간보다 늦어야 합니다." },
    };
  }
  const durationMinutes = parseInteger(input.durationMinutes);
  if (
    durationMinutes === null ||
    durationMinutes < 30 ||
    durationMinutes % 30 !== 0 ||
    durationMinutes > dailyEndMinute - dailyStartMinute
  ) {
    return {
      ok: false,
      fieldErrors: {
        durationMinutes:
          "소요 시간은 하루 시간 범위 안에서 30분 단위로 입력해 주세요.",
      },
    };
  }

  const votingDeadlineAt = parseKstDateTime(input.votingDeadline);
  if (!votingDeadlineAt || votingDeadlineAt <= _now) {
    return {
      ok: false,
      fieldErrors: {
        votingDeadline: "응답 마감은 KST 기준 현재보다 미래여야 합니다.",
      },
    };
  }
  const latestStartAt = new Date(
    dateRangeEnd.getTime() +
      (dailyEndMinute - durationMinutes) * 60_000 -
      KST_MS,
  );
  if (latestStartAt <= votingDeadlineAt) {
    return {
      ok: false,
      fieldErrors: {
        votingDeadline:
          "마감 뒤에 약속 시간 전체가 들어가는 시작 시각이 최소 하나 남아야 합니다.",
      },
    };
  }

  return {
    ok: true,
    value: {
      participantLimit,
      dateRangeStart: String(input.dateRangeStart),
      dateRangeEnd: String(input.dateRangeEnd),
      dailyStartMinute,
      dailyEndMinute,
      durationMinutes,
      votingDeadlineAt,
    },
  };
}
