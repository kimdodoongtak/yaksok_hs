"use client";

import { useEffect, useRef, useState } from "react";
import type { SlotSettings } from "@/lib/availability/policy";
import { addDays, durationLabel, localDay, slotAt, timeLabel, weekStart } from "./calendar";
import { repeatWeeks } from "./repeat";
import styles from "./repeat.module.css";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const dateLabel = (day: string) => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일`;
const weekLabel = (week: string) => `${dateLabel(week)} ~ ${dateLabel(addDays(week, 6))}`;

export function RepeatDialog({ slots, settings, now, sourceWeek, onApply, onReset, onClose }: {
  slots: ReadonlySet<string>;
  settings: SlotSettings;
  now: string;
  sourceWeek: string;
  onApply: (next: Set<string>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<"all" | "custom">("all");
  const [customWeeks, setCustomWeeks] = useState<string[]>([]);
  const choices: string[] = [];
  for (let week = weekStart(settings.dateRangeStart); week <= settings.dateRangeEnd; week = addDays(week, 7)) {
    const lastDay = addDays(week, 6) < settings.dateRangeEnd ? addDays(week, 6) : settings.dateRangeEnd;
    if (week !== sourceWeek && slotAt(lastDay, settings.dailyEndMinute - 30) > now) choices.push(week);
  }
  const targetWeeks = mode === "all" ? choices : choices.filter(week => customWeeks.includes(week));
  const next = repeatWeeks({ slots, sourceWeek, targetWeeks, settings, now });
  const added = [...next].filter(slot => !slots.has(slot));
  const addedWeeks = new Set(added.map(slot => weekStart(localDay(slot)))).size;
  const futureSlots = [...slots].filter(slot => slot > now);
  const hasSource = futureSlots.some(slot => localDay(slot) >= sourceWeek && localDay(slot) < addDays(sourceWeek, 7));
  const pattern = weekdays.map((label, index) => {
    const day = addDays(sourceWeek, index);
    const ranges: { start: number; end: number }[] = [];
    for (const slot of [...slots].filter(slot => localDay(slot) === day).sort()) {
      const kst = new Date(new Date(slot).getTime() + 9 * 3600000);
      const minute = kst.getUTCHours() * 60 + kst.getUTCMinutes();
      const last = ranges.at(-1);
      if (last?.end === minute) last.end += 30;
      else ranges.push({ start: minute, end: minute + 30 });
    }
    return { label, ranges };
  }).filter(day => day.ranges.length);
  useEffect(() => {
    const element = dialog.current;
    if (!opener.current && document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      opener.current?.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="repeat-title" onCancel={onClose} onClose={event => { if (!event.currentTarget.open) onClose(); }}>
    <header><h2 id="repeat-title">주간 반복</h2><button type="button" aria-label="주간 반복 닫기" onClick={onClose}>×</button></header>
    {!hasSource && <p className={styles.hint}>이번 주에 선택한 시간이 없어요. 시간을 선택한 뒤 다른 주에 반복할 수 있어요.</p>}
    <details className={styles.source}>
      <summary><span>{weekLabel(sourceWeek)}</span><span className={styles.disclosure}>시간 보기 <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg></span></summary>
      <div className={styles.pattern} aria-label="반복할 시간">
        {pattern.map(day => <div key={day.label}><strong>{day.label}</strong><span>{day.ranges.map(range => `${timeLabel(range.start)} ~ ${timeLabel(range.end)}`).join(", ")}</span></div>)}
      </div>
    </details>
    <fieldset className={styles.weeks}><legend>적용할 주</legend>
      {choices.length > 0 ? <>
        <div className={styles.modeChoices}>
          <label><input type="radio" name="repeat-scope" value="all" checked={mode === "all"} onChange={() => setMode("all")}/>전체 선택</label>
          <label><input type="radio" name="repeat-scope" value="custom" checked={mode === "custom"} onChange={() => setMode("custom")} aria-controls="repeat-weeks"/>직접 선택<svg className={mode === "custom" ? styles.expanded : undefined} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg></label>
        </div>
        {mode === "custom" && <div id="repeat-weeks" className={styles.weekList}>
          {choices.map(week => <label key={week}><input type="checkbox" value={week} checked={customWeeks.includes(week)} onChange={() => setCustomWeeks(previous => previous.includes(week) ? previous.filter(value => value !== week) : [...previous, week])}/><span>{weekLabel(week)}</span></label>)}
        </div>}
      </> : <p className={styles.hint}>반복할 다른 주가 없어요.</p>}
    </fieldset>
    <p className={styles.preview} aria-live="polite">{added.length ? `${addedWeeks}개 주에 ${durationLabel(added.length * 30)} 추가` : targetWeeks.length ? "이미 선택된 시간이거나 추가할 미래 시간이 없어요." : ""}</p>
    <p className={styles.hint}>기존 선택은 유지돼요.</p>
    <div className={styles.resetSection}><span>선택한 시간을 지우려면</span><button type="button" disabled={!futureSlots.length} onClick={onReset}>초기화</button></div>
    <footer><button type="button" onClick={onClose}>취소</button><button type="button" className={styles.apply} disabled={!added.length} onClick={() => onApply(next)}>적용</button></footer>
  </dialog>;
}
