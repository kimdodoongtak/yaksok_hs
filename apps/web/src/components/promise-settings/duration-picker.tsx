"use client";

import { useState } from "react";
import { TimeAdjustButtons } from "./time-adjust-buttons";
import { parseDurationEntry } from "./time-entry";
import styles from "./settings.module.css";

const MIN_DURATION = 30;
const MAX_DURATION = 24 * 60;

export function DurationPicker({ initialValue, error, onEdit }: {
  initialValue: string;
  error?: string;
  onEdit?: () => void;
}) {
  const parsed = Number(initialValue);
  const initialDuration =
    Number.isInteger(parsed)
      ? Math.min(MAX_DURATION, Math.max(MIN_DURATION, parsed))
      : 120;
  const [parts, setParts] = useState({ hours: String(Math.floor(initialDuration / 60)).padStart(2, "0"), minutes: String(initialDuration % 60).padStart(2, "0") });
  const [lastValid, setLastValid] = useState(initialDuration);
  const [inputError, setInputError] = useState<string | null>(null);
  const duration = parseDurationEntry(parts.hours, parts.minutes);
  const message = inputError || error;
  const label = duration === null ? "최소 소요 시간 입력 중" : [Math.floor(duration / 60) ? `${Math.floor(duration / 60)}시간` : "", duration % 60 ? `${duration % 60}분` : ""].filter(Boolean).join(" ");

  function commit(value: number) {
    setLastValid(value);
    setParts({ hours: String(Math.floor(value / 60)).padStart(2, "0"), minutes: String(value % 60).padStart(2, "0") });
    setInputError(null);
    onEdit?.();
  }

  return (
    <fieldset>
      <legend className="text-sm font-semibold">최소 소요 시간</legend>
      <p className={styles.help}>이 시간 이상 함께할 수 있는 구간을 찾아요.</p>
      <input type="hidden" name="durationMinutes" value={duration ?? ""} />
      <output aria-label={label} className="sr-only">{label}</output>
      <div className={styles.durationBox} data-invalid={Boolean(message)}>
        <div className={styles.flipDisplay}>
          {([{ name: "hours", label: "시간" }, { name: "minutes", label: "분" }] as const).map(part => (
            <label key={part.name} className={styles.flipUnit}>
              <input type="text" inputMode="numeric" enterKeyHint="done" autoComplete="off" spellCheck={false} maxLength={2}
                className={`${styles.flipFace} ${styles.durationInput}`}
                aria-label={`최소 소요 시간 (${part.label})`} aria-invalid={Boolean(message)} aria-describedby={message ? "durationMinutes-error" : undefined}
                value={parts[part.name]}
                onFocus={event => event.currentTarget.select()}
                onChange={event => { setParts(current => ({ ...current, [part.name]: event.target.value })); setInputError(null); onEdit?.(); }}
                onBlur={() => {
                  if (duration !== null) commit(duration);
                  else setInputError("최소 소요 시간은 30분~24시간 사이로, 분은 00 또는 30으로 입력해 주세요.");
                }}
                onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
              />
              <span className={styles.flipCaption} aria-hidden="true">{part.label}</span>
            </label>
          ))}
        </div>
        <TimeAdjustButtons
          label="최소 소요 시간"
          value={duration ?? lastValid}
          min={MIN_DURATION}
          max={MAX_DURATION}
          onAdjust={delta => commit(Math.min(MAX_DURATION, Math.max(MIN_DURATION, (duration ?? lastValid) + delta)))}
        />
      </div>
      {message && <p id="durationMinutes-error" role="alert" className="mt-2 text-sm text-red-700">{message}</p>}
    </fieldset>
  );
}
