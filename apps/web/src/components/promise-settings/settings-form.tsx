"use client";

import { useActionState, useRef, useState } from "react";
import { startCollection, type PromiseSettingsFormState } from "@/actions/promise-settings";
import { defaultPromiseSettings, validatePromiseSettings, type PromiseSettingsField } from "@/lib/promise-settings/policy";
import { DeadlinePicker } from "./deadline-picker";
import { DateRangePicker } from "./date-range-picker";
import { DurationPicker } from "./duration-picker";
import { DailyTimePicker } from "./daily-time-picker";
import { ParticipantLimitField } from "./participant-limit-field";
import styles from "./settings.module.css";

const firstStepFields: PromiseSettingsField[] = [
  "dateRangeStart", "dateRangeEnd", "dailyStart", "dailyEnd", "durationMinutes",
];

export function SettingsForm({ inviteToken, serverNow, initialValues, submitSettings }: {
  inviteToken: string;
  serverNow: string;
  initialValues?: PromiseSettingsFormState["values"];
  submitSettings?: (data:FormData)=>Promise<PromiseSettingsFormState>;
}) {
  const defaults = initialValues ?? defaultPromiseSettings(new Date(serverNow));
  const initialState: PromiseSettingsFormState = { message: null, fieldErrors: {}, values: defaults };
  const [step, setStep] = useState<1 | 2>(1);
  const [errors, setErrors] = useState<PromiseSettingsFormState["fieldErrors"]>({});
  const [message, setMessage] = useState<string | null>(null);
  const [review, setReview] = useState(defaults);
  const [deadline, setDeadline] = useState(defaults.votingDeadline);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  function goTo(next: 1 | 2) {
    setStep(next);
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    });
  }

  const [state, action, pending] = useActionState(
    async (previous: PromiseSettingsFormState, data: FormData) => {
      const result = submitSettings ? await submitSettings(data) : await startCollection(inviteToken, previous, data);
      setErrors(result.fieldErrors);
      setMessage(result.message);
      setDeadline(result.values.votingDeadline);
      goTo(firstStepFields.some((field) => result.fieldErrors[field]) ? 1 : 2);
      return result;
    },
    initialState,
  );

  function next() {
    if (!form.current) return;
    setMessage(null);
    const data = new FormData(form.current);
    const values = Object.fromEntries(
      Object.keys(defaults).map((field) => [field, String(data.get(field) ?? "")]),
    ) as typeof defaults;
    // 단계 1에서는 정원·마감을 검사하지 않고, 최종 제출은 서버가 전체를 검사한다.
    const validation = validatePromiseSettings(
      { ...values, participantLimit: "5" },
      new Date(serverNow),
    );
    const firstErrors = validation.ok ? {} : Object.fromEntries(
      Object.entries(validation.fieldErrors).filter(([field]) =>
        firstStepFields.includes(field as PromiseSettingsField),
      ),
    );
    setErrors(firstErrors);
    if (Object.keys(firstErrors).length) {
      goTo(1);
      return;
    }
    setReview(values);
    goTo(2);
  }

  return (
    <form
      ref={form}
      action={action}
      noValidate
      className={`${styles.form} settings-flow`}
      onSubmit={(event) => {
        if (step === 1) {
          event.preventDefault();
          next();
        }
      }}
    >
      <div className={styles.stepProgress} aria-label={`설정 ${step}/2단계`}>
        <span aria-current={step === 1 ? "step" : undefined}>1 · 날짜와 시간</span>
        <span aria-hidden="true">—</span>
        <span aria-current={step === 2 ? "step" : undefined}>2 · 모집 설정</span>
        <span className="ml-auto tabular-nums">{step}/2</span>
      </div>
      <h2 ref={heading} tabIndex={-1} className="sr-only">
        {step === 1 ? "날짜와 시간" : "모집 설정"}
      </h2>
      {step === 2 && <p className="mb-4 mt-3 text-sm leading-6 text-slate-500">정원과 응답 마감을 설정해 주세요.</p>}

      <div hidden={step !== 1} className={`${styles.stepPanel} mt-3`}>
        <div className={styles.card}>
          <DateRangePicker
            key={`${state.values.dateRangeStart}:${state.values.dateRangeEnd}`}
            serverNow={serverNow}
            initialStart={state.values.dateRangeStart}
            initialEnd={state.values.dateRangeEnd}
            errors={errors}
          />
          <div className={styles.timeSection}>
            <DailyTimePicker
              key={`${state.values.dailyStart}:${state.values.dailyEnd}`}
              initialStart={state.values.dailyStart}
              initialEnd={state.values.dailyEnd}
              errors={errors}
            />
          </div>
          <DurationPicker
            key={state.values.durationMinutes}
            initialValue={state.values.durationMinutes}
            error={errors.durationMinutes}
          />
        </div>
      </div>

      <div hidden={step !== 2} className={styles.stepPanel}>
        <div className={styles.card}>
          <ParticipantLimitField
            key={state.values.participantLimit}
            initialValue={state.values.participantLimit}
            error={errors.participantLimit}
          />
          <DeadlinePicker
            value={deadline}
            serverNow={serverNow}
            error={errors.votingDeadline}
            rangeEnd={review.dateRangeEnd}
            onChange={(value) => {
              setDeadline(value);
            }}
          />
        </div>
        <div className={styles.review}>
          <p className="mb-2 text-sm font-semibold">선택한 약속 조건</p>
          <p>{review.dateRangeStart.replaceAll("-", ".")} → {review.dateRangeEnd.replaceAll("-", ".")}</p>
          <p>매일 {review.dailyStart}–{review.dailyEnd} · 소요 {[Math.floor(Number(review.durationMinutes) / 60) ? `${Math.floor(Number(review.durationMinutes) / 60)}시간` : "", Number(review.durationMinutes) % 60 ? `${Number(review.durationMinutes) % 60}분` : ""].filter(Boolean).join(" ")}</p>
          <p className="mt-2 text-xs text-slate-500">수정하려면 이전 단계로 돌아가세요.</p>
        </div>
      </div>

      {message && (
        <p role="status" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">{message}</p>
      )}
      <div className={styles.stepActions}>
        {step === 1 ? (
          <button type="button" onClick={next} className={styles.submit}>다음</button>
        ) : (
          <>
            <button type="button" disabled={pending} onClick={() => goTo(1)} className={styles.previous}>이전</button>
            <button type="submit" disabled={pending} className={styles.submit}>{pending ? (submitSettings ? "처리 중…" : "시작 중…") : submitSettings ? "변경 내용 확인" : "모집 시작"}</button>
          </>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-slate-500">
        {step === 1 ? "다음 단계에서 정원과 응답 마감을 정해요." : submitSettings ? "다음 화면에서 변경 영향을 확인할 수 있어요." : "모집을 시작하면 초대 링크를 공유할 수 있어요."}
      </p>
    </form>
  );
}
