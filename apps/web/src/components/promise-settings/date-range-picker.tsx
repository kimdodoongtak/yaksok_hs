"use client";

import { useState } from "react";
import type { PromiseSettingsFormState } from "@/actions/promise-settings";
import styles from "./settings.module.css";

const KST_MS = 9 * 60 * 60 * 1000;

function kstDateString(date: Date) {
  return new Date(date.getTime() + KST_MS).toISOString().slice(0, 10);
}

function addCalendarMonths(dateText: string, months: number) {
  const [year, month, day] = dateText.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();
  return [
    targetYear,
    String(normalizedMonth + 1).padStart(2, "0"),
    String(Math.min(day, lastDay)).padStart(2, "0"),
  ].join("-");
}

function monthText(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function DateRangePicker({
  serverNow,
  initialStart,
  initialEnd,
  errors,
}: {
  serverNow: string;
  initialStart: string;
  initialEnd: string;
  errors: PromiseSettingsFormState["fieldErrors"];
}) {
  const today = kstDateString(new Date(serverNow));
  const calendarLimit = addCalendarMonths(today, 3);
  const initialMonth = initialStart ? initialStart.slice(0, 7) : today.slice(0, 7);
  const [year, initialMonthNumber] = initialMonth.split("-").map(Number);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(Date.UTC(year, initialMonthNumber - 1, 1)),
  );
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);

  const visibleYear = visibleMonth.getUTCFullYear();
  const visibleMonthNumber = visibleMonth.getUTCMonth();
  const firstWeekday = new Date(
    Date.UTC(visibleYear, visibleMonthNumber, 1),
  ).getUTCDay();
  const lastDay = new Date(
    Date.UTC(visibleYear, visibleMonthNumber + 1, 0),
  ).getUTCDate();
  const currentMonth = monthText(visibleYear, visibleMonthNumber);
  const minimumMonth = today.slice(0, 7);
  const maximumMonth = calendarLimit.slice(0, 7);

  function select(date: string) {
    if (!start || end || date < start) {
      setStart(date);
      setEnd("");
      return;
    }
    setEnd(date);
  }

  function moveMonth(offset: number) {
    setVisibleMonth(
      new Date(Date.UTC(visibleYear, visibleMonthNumber + offset, 1)),
    );
  }

  return (
    <details className={styles.settingDisclosure} open={Boolean(errors.dateRangeStart || errors.dateRangeEnd) || undefined}>
      <summary className={styles.settingSummary}>
        <span className="text-sm font-semibold">약속 날짜</span>
        <span className={styles.summaryValue}>{start.replaceAll("-", ".")} → {end ? end.replaceAll("-", ".") : "종료일 선택"}</span>
      </summary>
      <div className="pt-4">
      <div className={`${styles.dateInputs} grid grid-cols-2 gap-3`}>
        <div>
          <label htmlFor="dateRangeStart" className="text-sm text-slate-600">
            시작일
          </label>
          <input
            id="dateRangeStart"
            name="dateRangeStart"
            type="date"
            required
            value={start}
            onChange={(event) => {
              setStart(event.target.value);
              if (end && event.target.value > end) setEnd("");
            }}
            aria-describedby={errors.dateRangeStart ? "dateRangeStart-error" : undefined}
            className={styles.input}
          />
          {errors.dateRangeStart && (
            <p id="dateRangeStart-error" role="alert" className="mt-2 text-sm text-red-700">
              {errors.dateRangeStart}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="dateRangeEnd" className="text-sm text-slate-600">
            종료일
          </label>
          <input
            id="dateRangeEnd"
            name="dateRangeEnd"
            type="date"
            required
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            aria-describedby={errors.dateRangeEnd ? "dateRangeEnd-error" : undefined}
            className={styles.input}
          />
          {errors.dateRangeEnd && (
            <p id="dateRangeEnd-error" role="alert" className="mt-2 text-sm text-red-700">
              {errors.dateRangeEnd}
            </p>
          )}
        </div>
      </div>

      <div className={styles.calendar}>
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            aria-label="이전 달"
            disabled={currentMonth <= minimumMonth}
            onClick={() => moveMonth(-1)}
            className={styles.monthButton}
          >
            ‹
          </button>
          <strong className="flex-1 text-base">{visibleYear}년 {visibleMonthNumber + 1}월</strong>
          <button
            type="button"
            aria-label="다음 달"
            disabled={currentMonth >= maximumMonth}
            onClick={() => moveMonth(1)}
            className={styles.monthButton}
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-xs text-slate-500" aria-hidden="true">
          {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
            <span key={day} className="py-2">{day}</span>
          ))}
        </div>
        <div role="grid" aria-label="날짜 범위 달력" className="grid grid-cols-7 gap-x-px gap-y-2">
          {Array.from({ length: Math.ceil((firstWeekday + lastDay) / 7) * 7 }, (_, index) => {
            const day = index - firstWeekday + 1;
            if (day < 1 || day > lastDay)
              return <span key={`empty-${index}`} aria-hidden="true" className={`${styles.day} ${styles.dayDisabled}`} />;
            const date = `${currentMonth}-${String(day).padStart(2, "0")}`;
            const disabled = date < today || date > calendarLimit;
            const selected = date === start || date === end;
            const inRange = Boolean(start && end && date > start && date < end);
            const isToday = date === today;
            return (
              <button
                key={date}
                type="button"
                role="gridcell"
                aria-label={`${date} 선택`}
                aria-current={isToday ? "date" : undefined}
                aria-selected={selected || inRange}
                disabled={disabled}
                onClick={() => select(date)}
                className={`${styles.day} ${
                  selected
                    ? styles.daySelected
                    : inRange
                      ? styles.dayRange
                      : isToday
                        ? styles.dayToday
                        : disabled
                          ? styles.dayDisabled
                          : styles.dayDefault
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
      <p className={styles.help}>
        오늘부터 달력 3개월 이내, 최대 90일까지 선택할 수 있어요.
      </p>
      </div>
    </details>
  );
}
