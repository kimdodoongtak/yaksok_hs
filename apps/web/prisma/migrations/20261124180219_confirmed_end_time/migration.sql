-- AlterTable
ALTER TABLE "promises" ADD COLUMN     "confirmed_end_at" TIMESTAMPTZ(3);

-- 기존 확정 길이를 보존한다. NULL 읽기 호환은 이전 클라이언트/기록을 위해 유지한다.
UPDATE promises
SET confirmed_end_at = confirmed_start_at + duration_minutes * INTERVAL '1 minute'
WHERE confirmed_start_at IS NOT NULL AND duration_minutes IS NOT NULL;

ALTER TABLE promises ADD CONSTRAINT ck_promise_confirmed_end CHECK (
  confirmed_end_at IS NULL OR (
    status IN ('confirmed', 'cancelled') AND confirmed_start_at IS NOT NULL
    AND duration_minutes IS NOT NULL
    AND confirmed_end_at >= confirmed_start_at + duration_minutes * INTERVAL '1 minute'
    AND MOD(EXTRACT(EPOCH FROM confirmed_start_at), 1800) = 0
    AND MOD(EXTRACT(EPOCH FROM confirmed_end_at), 1800) = 0
  )
);
