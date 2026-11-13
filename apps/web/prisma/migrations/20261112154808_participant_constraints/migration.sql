CREATE UNIQUE INDEX uq_one_host_per_promise ON participants (promise_id) WHERE role = 'host';
ALTER TABLE participants
  ADD CONSTRAINT ck_participant_role CHECK (role IN ('host','member')),
  ADD CONSTRAINT ck_participant_status CHECK (status IN ('active','cancelled')),
  ADD CONSTRAINT ck_host_must_be_active CHECK (role <> 'host' OR status = 'active'),
  ADD CONSTRAINT ck_participant_cancelled_at CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL));
