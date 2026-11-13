"use client";

import { useState } from "react";
import type { PromiseSettingsFormState } from "@/actions/promise-settings";
import { TimeAdjustButtons } from "./time-adjust-buttons";
import styles from "./settings.module.css";

const fields = [
  { name: "dailyStart", label: "하루 시작", min: 0, max: 1410 },
  { name: "dailyEnd", label: "하루 종료", min: 30, max: 1440 },
] as const;

export function DailyTimePicker({ initialStart, initialEnd, errors }: {
  initialStart: string;
  initialEnd: string;
  errors: PromiseSettingsFormState["fieldErrors"];
}) {
  const [values, setValues] = useState({ dailyStart: initialStart, dailyEnd: initialEnd });

  return (
    <fieldset>
      <legend className="text-sm font-semibold">하루 시간 범위</legend>
      <div className={styles.timeRange}>
        {fields.map(({ name, label, min, max }, index) => {
          const [hour, minute] = values[name].split(":").map(Number);
          const total = hour * 60 + minute;
          return (
            <div key={name} className="contents">
              {index === 1 && <span aria-hidden="true" className={styles.timeSeparator}>→</span>}
              <input type="hidden" name={name} value={values[name]} />
              <div className="min-w-0">
                <span className="mb-2 block text-xs text-slate-500">{label}</span>
                <div className={styles.timeBox} data-invalid={Boolean(errors[name])}>
                  <output
                    aria-label={label}
                    aria-describedby={errors[name] ? `${name}-error` : undefined}
                    className={styles.timeValue}
                  >{values[name]}</output>
                <TimeAdjustButtons
                  label={label}
                  value={total}
                  min={min}
                  max={max}
                  onAdjust={(delta) => {
                    const next = Math.min(max, Math.max(min, total + delta));
                    const formatted = `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
                    setValues((current) => ({ ...current, [name]: formatted }));
                  }}
                />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className={styles.help}>화살표로 30분씩 조절해요.</p>
      {fields.map(({ name }) => errors[name] && (
        <p key={name} id={`${name}-error`} role="alert" className="mt-2 text-sm text-red-700">{errors[name]}</p>
      ))}
    </fieldset>
  );
}
