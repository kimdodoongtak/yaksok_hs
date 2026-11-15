"use client";

import { useState } from "react";
import styles from "./settings.module.css";

const KST_MS = 9 * 60 * 60 * 1000;

export function kstDateString(date: Date) {
  return new Date(date.getTime() + KST_MS).toISOString().slice(0, 10);
}

export function addCalendarMonths(dateText: string, months: number) {
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

export function CalendarMonth({ today, maxDate, initialDate, label, onSelect, isSelected, isInRange, isDisabled }: {
  today: string;
  maxDate: string;
  initialDate: string;
  label: string;
  onSelect: (date: string) => void;
  isSelected: (date: string) => boolean;
  isInRange?: (date: string) => boolean;
  isDisabled?: (date: string) => boolean;
}) {
  const initialMonth = initialDate >= today && initialDate <= maxDate ? initialDate : today;
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(`${initialMonth.slice(0, 7)}-01T00:00:00Z`));
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
  const maximumMonth = maxDate.slice(0, 7);

  function moveMonth(offset: number) {
    setVisibleMonth(new Date(Date.UTC(visibleYear, visibleMonthNumber + offset, 1)));
  }

  return (
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
      <div role="grid" aria-label={label} className="grid grid-cols-7 gap-x-px gap-y-2">
        {Array.from({ length: Math.ceil((firstWeekday + lastDay) / 7) * 7 }, (_, index) => {
          const day = index - firstWeekday + 1;
          if (day < 1 || day > lastDay)
            return <span key={`empty-${index}`} aria-hidden="true" className={`${styles.day} ${styles.dayDisabled}`} />;
          const date = `${currentMonth}-${String(day).padStart(2, "0")}`;
          const disabled = date < today || date > maxDate || Boolean(isDisabled?.(date));
          const selected = isSelected(date);
          const inRange = Boolean(isInRange?.(date));
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
              onClick={() => onSelect(date)}
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
  );
}
