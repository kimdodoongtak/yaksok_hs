"use client";

import { useRef, useState } from "react";
import styles from "./settings.module.css";

export function ParticipantLimitField({
  initialValue,
  error,
}: {
  initialValue: string;
  error?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function adjust(delta: number) {
    const current = Number(value);
    const next = Math.min(30, Math.max(2, (Number.isFinite(current) ? current : 5) + delta));
    setValue(String(next));
    setEditing(false);
  }

  function edit() {
    setEditing(true);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.select();
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="participantLimit" className="block text-sm font-semibold">
          정원
        </label>
        <div className={styles.stepper}>
          <button
            type="button"
            aria-label="정원 줄이기"
            disabled={Number(value) <= 2}
            onClick={() => adjust(-1)}
            className={styles.stepperButton}
          >
            −
          </button>
          <input
            ref={input}
            id="participantLimit"
            name="participantLimit"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            role="spinbutton"
            aria-valuemin={2}
            aria-valuemax={30}
            aria-valuenow={/^\d+$/.test(value) ? Number(value) : undefined}
            required
            readOnly={!editing}
            value={value}
            onDoubleClick={edit}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setEditing(false)}
            aria-describedby={error ? "participantLimit-error" : "participantLimit-help"}
            className={styles.stepperInput}
          />
          <span className={styles.stepperUnit} aria-hidden="true">명</span>
          <button
            type="button"
            aria-label="정원 늘리기"
            disabled={Number(value) >= 30}
            onClick={() => adjust(1)}
            className={styles.stepperButton}
          >
            +
          </button>
        </div>
      </div>
      <p id="participantLimit-help" className={styles.help}>
        최대 30명 · 숫자를 더블클릭하면 직접 입력할 수 있어요.
      </p>
      {error && (
        <p id="participantLimit-error" role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
