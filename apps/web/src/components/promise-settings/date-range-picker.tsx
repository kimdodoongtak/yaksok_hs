"use client";

import { useId, useRef, useState } from "react";
import type { PromiseSettingsFormState } from "@/actions/promise-settings";
import styles from "./settings.module.css";
import { CalendarMonth, addCalendarMonths, kstDateString } from "./calendar-month";

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
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitle = useId();
  const today = kstDateString(new Date(serverNow));
  const calendarLimit = addCalendarMonths(today, 3);
  const [calendarKey, setCalendarKey] = useState(0);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [draftStart, setDraftStart] = useState(initialStart);
  const [draftEnd, setDraftEnd] = useState(initialEnd);
  const rangeDays = (new Date(draftEnd).getTime() - new Date(draftStart).getTime()) / 86400000;
  const canApply = Boolean(
    draftStart && draftEnd && draftStart >= today && draftEnd >= draftStart &&
    draftEnd <= calendarLimit && rangeDays <= 89,
  );

  function openCalendar() {
    setDraftStart(start);
    setDraftEnd(end);
    setCalendarKey((key) => key + 1);
    dialog.current?.showModal();
  }
  function applyRange() {
    if (!canApply) return;
    setStart(draftStart);
    setEnd(draftEnd);
    dialog.current?.close();
  }

  function select(date: string) {
    if (!draftStart || draftEnd || date < draftStart) {
      setDraftStart(date);
      setDraftEnd("");
      return;
    }
    setDraftEnd(date);
  }

  return (
    <section aria-label="약속 날짜" className={styles.dateSection}>
      <div className={styles.dateHeading}><span className="text-sm font-semibold">약속 날짜</span></div>
      <input type="hidden" name="dateRangeStart" value={start}/>
      <input type="hidden" name="dateRangeEnd" value={end}/>
      <button type="button" className={styles.dateRangeTrigger} aria-label="약속 날짜 선택" aria-haspopup="dialog" aria-describedby={`${dialogTitle}-range`} onClick={openCalendar}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18"/></svg>
        <span><strong id={`${dialogTitle}-range`}>{start && end ? `${start.replaceAll("-", ".")} → ${end.replaceAll("-", ".")}` : "약속 기간을 선택해 주세요"}</strong><small>달력에서 기간 선택</small></span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
      </button>
      {errors.dateRangeStart && <p role="alert" className="mt-2 text-sm text-red-700">{errors.dateRangeStart}</p>}
      {errors.dateRangeEnd && <p role="alert" className="mt-2 text-sm text-red-700">{errors.dateRangeEnd}</p>}

      <dialog ref={dialog} aria-labelledby={dialogTitle} className={styles.calendarDialog}>
        <div className={styles.dialogHeading}>
          <h3 id={dialogTitle} className="font-semibold">날짜 범위 선택</h3>
          <button type="button" className={styles.monthButton} aria-label="달력 닫기" onClick={() => dialog.current?.close()}>×</button>
        </div>
        <p className={styles.help}>첫날과 마지막 날을 차례로 눌러 주세요.</p>
        <p className={styles.summaryValue}>{draftStart.replaceAll("-", ".")} → {draftEnd ? draftEnd.replaceAll("-", ".") : "마지막 날 선택"}</p>
        <CalendarMonth
          key={calendarKey}
          today={today}
          maxDate={calendarLimit}
          initialDate={start}
          label="날짜 범위 달력"
          onSelect={select}
          isSelected={(date) => date === draftStart || date === draftEnd}
          isInRange={(date) => Boolean(draftStart && draftEnd && date > draftStart && date < draftEnd)}
          isDisabled={(date) => Boolean(draftStart && !draftEnd && (new Date(date).getTime() - new Date(draftStart).getTime()) / 86400000 > 89)}
        />
      <p className={styles.help}>
        오늘부터 달력 3개월 이내, 최대 90일까지 선택할 수 있어요.
      </p>
      <button type="button" disabled={!canApply} className={`${styles.submit} mt-4 w-full`} onClick={applyRange}>선택 완료</button>
      </dialog>
    </section>
  );
}
