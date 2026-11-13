"use client";

import { useState } from "react";
import { TimeAdjustButtons } from "./time-adjust-buttons";
import styles from "./settings.module.css";

const MIN_DURATION = 30;
const MAX_DURATION = 24 * 60;

export function DurationPicker({ initialValue, error }: {
  initialValue: string;
  error?: string;
}) {
  const parsed = Number(initialValue);
  const [duration, setDuration] = useState(
    Number.isInteger(parsed)
      ? Math.min(MAX_DURATION, Math.max(MIN_DURATION, parsed))
      : 120,
  );
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  const label = [hours ? `${hours}시간` : "", minutes ? `${minutes}분` : ""].filter(Boolean).join(" ");

  return (
    <fieldset>
      <legend className="text-sm font-semibold">소요 시간</legend>
      <input type="hidden" name="durationMinutes" value={duration} />
      <div className={styles.durationBox} data-invalid={Boolean(error)}>
        <output
          aria-label={label}
          aria-describedby={error ? "durationMinutes-error" : undefined}
          className={styles.flipDisplay}
        >
          <span aria-hidden="true" className={styles.flipUnit}>
            <span className={styles.flipFace}>{String(hours).padStart(2, "0")}</span>
            <span className={styles.flipCaption}>시간</span>
          </span>
          <span aria-hidden="true" className={styles.flipUnit}>
            <span className={styles.flipFace}>{String(minutes).padStart(2, "0")}</span>
            <span className={styles.flipCaption}>분</span>
          </span>
        </output>
        <TimeAdjustButtons
          label="소요 시간"
          value={duration}
          min={MIN_DURATION}
          max={MAX_DURATION}
          onAdjust={(delta) => setDuration((current) =>
            Math.min(MAX_DURATION, Math.max(MIN_DURATION, current + delta)),
          )}
        />
      </div>
      {error && <p id="durationMinutes-error" role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </fieldset>
  );
}
