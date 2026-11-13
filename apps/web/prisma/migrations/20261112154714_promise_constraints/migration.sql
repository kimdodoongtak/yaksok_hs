-- ERD §4.2: Prisma 스키마로 표현하지 못하는 행 단위 정책.
ALTER TABLE promises
  ADD CONSTRAINT ck_promise_status CHECK (status IN ('draft','collecting','closed','confirmed','cancelled')),
  ADD CONSTRAINT ck_promise_cancelled_at CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  ADD CONSTRAINT ck_promise_settings CHECK (status IN ('draft','cancelled') OR (
    participant_limit IS NOT NULL AND date_range_start IS NOT NULL AND date_range_end IS NOT NULL
    AND daily_start_minute IS NOT NULL AND daily_end_minute IS NOT NULL
    AND duration_minutes IS NOT NULL AND voting_deadline_at IS NOT NULL)),
  ADD CONSTRAINT ck_promise_confirmation CHECK (
    (status = 'confirmed' AND confirmed_start_at IS NOT NULL) OR status = 'cancelled'
    OR (status IN ('draft','collecting','closed') AND confirmed_start_at IS NULL)),
  ADD CONSTRAINT ck_promise_limit CHECK (participant_limit BETWEEN 2 AND 30),
  ADD CONSTRAINT ck_promise_dates CHECK (date_range_end - date_range_start BETWEEN 0 AND 89),
  ADD CONSTRAINT ck_promise_start CHECK (daily_start_minute BETWEEN 0 AND 1410 AND daily_start_minute % 30 = 0),
  ADD CONSTRAINT ck_promise_end CHECK (daily_end_minute BETWEEN 30 AND 1440 AND daily_end_minute % 30 = 0),
  ADD CONSTRAINT ck_promise_time_range CHECK (daily_start_minute < daily_end_minute),
  ADD CONSTRAINT ck_promise_duration CHECK (duration_minutes >= 30 AND duration_minutes % 30 = 0
    AND duration_minutes <= daily_end_minute - daily_start_minute);
