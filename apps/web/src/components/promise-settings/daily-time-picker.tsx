"use client";

import { useState } from "react";
import type { PromiseSettingsFormState } from "@/actions/promise-settings";
import { TimeAdjustButtons } from "./time-adjust-buttons";
import { formatTimeEntry, parseTimeEntry } from "./time-entry";
import styles from "./settings.module.css";

const fields = [
  { name: "dailyStart", label: "하루 시작", displayLabel: "시작", min: 0, max: 1410 },
  { name: "dailyEnd", label: "하루 종료", displayLabel: "종료", min: 30, max: 1440 },
] as const;

export function DailyTimePicker({ initialStart, initialEnd, errors, onEdit }: {
  initialStart: string;
  initialEnd: string;
  errors: PromiseSettingsFormState["fieldErrors"];
  onEdit?: (field: "dailyStart" | "dailyEnd") => void;
}) {
  const [values, setValues] = useState({ dailyStart: initialStart, dailyEnd: initialEnd });
  const [lastValid, setLastValid] = useState({ dailyStart: parseTimeEntry(initialStart, 0, 1410) ?? 540, dailyEnd: parseTimeEntry(initialEnd, 30, 1440) ?? 1440 });
  const [inputErrors, setInputErrors] = useState<Partial<Record<"dailyStart" | "dailyEnd", string>>>({});

  function commit(name: "dailyStart" | "dailyEnd", minute: number) {
    setLastValid(current => ({ ...current, [name]: minute }));
    setValues(current => ({ ...current, [name]: formatTimeEntry(minute) }));
    setInputErrors(current => ({ ...current, [name]: undefined }));
    onEdit?.(name);
  }

  return (
    <fieldset>
      <legend className="text-sm font-semibold">약속 시간대</legend>
      <p className={styles.help}>이 시간대 안에서 친구들이 가능한 시간을 골라요.</p>
      <div className={styles.timeRange}>
        {fields.map(({ name, label, displayLabel, min, max }, index) => {
          const total = parseTimeEntry(values[name], min, max);
          const error = inputErrors[name] || errors[name];
          return (
            <div key={name} className="contents">
              {index === 1 && <span aria-hidden="true" className={styles.timeSeparator}>→</span>}
              <input type="hidden" name={name} value={total === null ? values[name] : formatTimeEntry(total)} />
              <div className="min-w-0">
                <div className={styles.timeBox} data-invalid={Boolean(error)}>
                  <label className={styles.timeReading}>
                    <span className={styles.timeLabel} aria-hidden="true">{displayLabel}</span>
                    <input
                      type="text" inputMode="numeric" enterKeyHint="done" autoComplete="off" spellCheck={false} maxLength={5}
                      value={values[name]}
                      aria-label={label}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? `${name}-error` : undefined}
                      className={`${styles.timeValue} ${styles.timeInput}`}
                      onFocus={event => event.currentTarget.select()}
                      onChange={event => {
                        setValues(current => ({ ...current, [name]: event.target.value }));
                        setInputErrors(current => ({ ...current, [name]: undefined }));
                        onEdit?.(name);
                      }}
                      onBlur={() => {
                        if (total !== null) commit(name, total);
                        else setInputErrors(current => ({ ...current, [name]: `${displayLabel} 시간은 ${formatTimeEntry(min)}~${formatTimeEntry(max)} 사이 30분 단위로 입력해 주세요.` }));
                      }}
                      onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
                    />
                  </label>
                  <TimeAdjustButtons
                    label={label}
                    value={total ?? lastValid[name]}
                    min={min}
                    max={max}
                    onAdjust={(delta) => {
                      commit(name, Math.min(max, Math.max(min, (total ?? lastValid[name]) + delta)));
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="sr-only">숫자를 눌러 직접 입력하거나 화살표로 30분씩 조절해요.</p>
      {fields.map(({ name }) => (inputErrors[name] || errors[name]) && (
        <p key={name} id={`${name}-error`} role="alert" className="mt-2 text-sm text-red-700">{inputErrors[name] || errors[name]}</p>
      ))}
    </fieldset>
  );
}
