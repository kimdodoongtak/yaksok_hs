"use client";

import { useId, useRef, useState } from "react";
import { CalendarMonth, addCalendarMonths, kstDateString } from "./calendar-month";
import styles from "./settings.module.css";

const DAY_MS = 86_400_000;
function addDays(date: string, days: number) {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function DeadlinePicker({ value, onChange, serverNow, rangeEnd, error }: {
  value: string;
  onChange: (value: string) => void;
  serverNow: string;
  rangeEnd: string;
  error?: string;
}) {
  const headingId = useId();
  const dialogId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [draftDate, setDraftDate] = useState(value.slice(0, 10));
  const [calendarKey, setCalendarKey] = useState(0);
  const today = kstDateString(new Date(serverNow));
  const calendarLimit = addCalendarMonths(today, 3);
  // 23:59 마감 뒤에 약속 소요 시간을 확보하려면 종료일 전날까지 골라야 한다.
  const lastDate = addDays(rangeEnd, -1);
  const maxDate = lastDate < calendarLimit ? lastDate : calendarLimit;
  const date = value.slice(0, 10);
  const week = `${addDays(today, 7)}T23:59`;
  const fortnight = `${addDays(today, 14)}T23:59`;
  const custom = value !== week && value !== fortnight;
  const allowed = (day: string) => day >= today && day <= maxDate &&
    Date.parse(`${day}T23:59:00+09:00`) > Date.parse(serverNow);
  const hasDates = maxDate >= today && allowed(maxDate);
  const invalid = value.endsWith("T23:59") && !allowed(date);
  const past = Date.parse(`${value}:00+09:00`) <= Date.parse(serverNow);
  const summaryDate = new Date(`${date}T00:00:00Z`);
  const summary = Number.isNaN(summaryDate.getTime()) ? "날짜를 선택해 주세요." :
    `${summaryDate.getUTCMonth() + 1}월 ${summaryDate.getUTCDate()}일 (${["일", "월", "화", "수", "목", "금", "토"][summaryDate.getUTCDay()]}) ${value.slice(11)} 마감`;

  function open() {
    setDraftDate(date);
    setCalendarKey((key) => key + 1);
    dialog.current?.showModal();
  }

  return (
    <section className={styles.deadlinePicker} aria-labelledby={headingId}>
      <input type="hidden" name="votingDeadline" value={value} />
      <h3 id={headingId} className={styles.deadlineTitle}>응답 마감</h3>
      <div className={styles.deadlinePresets} role="group" aria-label="응답 마감 선택">
        <button type="button" aria-pressed={value === week} disabled={!allowed(week.slice(0, 10))} onClick={() => onChange(week)}>1주 뒤</button>
        <button type="button" aria-pressed={value === fortnight} disabled={!allowed(fortnight.slice(0, 10))} onClick={() => onChange(fortnight)}>2주 뒤</button>
        <button type="button" aria-pressed={custom} aria-haspopup="dialog" disabled={!hasDates} onClick={open}>직접 선택</button>
      </div>
      <p className={styles.deadlineSummary}>{summary}</p>
      {!hasDates ? <p role="alert" className={styles.help}>선택할 수 있는 마감일이 없어요. 약속 종료일을 내일 이후로 변경해 주세요.</p>
        : (error || invalid || past) && <p role="alert" className="mt-2 text-sm text-red-700">{error || "약속 종료일보다 이른 마감일을 선택해 주세요."}</p>}
      <dialog ref={dialog} aria-labelledby={dialogId} className={styles.calendarDialog}>
        <div className={styles.dialogHeading}>
          <h3 id={dialogId} className="font-semibold">응답 마감 날짜 선택</h3>
          <button type="button" className={styles.monthButton} aria-label="달력 닫기" onClick={() => dialog.current?.close()}>×</button>
        </div>
        <p className={styles.help}>선택한 날짜의 23:59에 마감돼요.</p>
        <CalendarMonth key={calendarKey} today={today} maxDate={maxDate} initialDate={date}
          label="응답 마감 달력" isSelected={(day) => day === draftDate}
          isDisabled={(day) => !allowed(day)} onSelect={setDraftDate} />
        <button type="button" className={`${styles.submit} mt-4 w-full`} disabled={!allowed(draftDate)}
          onClick={() => { if (allowed(draftDate)) { onChange(`${draftDate}T23:59`); dialog.current?.close(); } }}>선택 완료</button>
      </dialog>
    </section>
  );
}
