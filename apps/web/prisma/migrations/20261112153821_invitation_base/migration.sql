-- CreateTable
CREATE TABLE "promise_links" (
    "id" UUID NOT NULL,
    "invite_token" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promise_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promises" (
    "id" UUID NOT NULL,
    "promise_link_id" UUID NOT NULL,
    "participant_limit" INTEGER,
    "date_range_start" DATE,
    "date_range_end" DATE,
    "daily_start_minute" SMALLINT,
    "daily_end_minute" SMALLINT,
    "duration_minutes" INTEGER,
    "voting_deadline_at" TIMESTAMPTZ(3),
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "confirmed_start_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" UUID NOT NULL,
    "promise_id" UUID NOT NULL,
    "nickname" TEXT NOT NULL,
    "normalized_nickname" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "availability_submitted_at" TIMESTAMPTZ(3),
    "availability_version" INTEGER NOT NULL DEFAULT 0,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_sessions" (
    "id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "session_token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "participant_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promise_links_invite_token_key" ON "promise_links"("invite_token");

-- CreateIndex
CREATE UNIQUE INDEX "promises_promise_link_id_key" ON "promises"("promise_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "participants_promise_id_normalized_nickname_key" ON "participants"("promise_id", "normalized_nickname");

-- CreateIndex
CREATE UNIQUE INDEX "participant_sessions_session_token_hash_key" ON "participant_sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "participant_sessions_participant_id_idx" ON "participant_sessions"("participant_id");

-- AddForeignKey
ALTER TABLE "promises" ADD CONSTRAINT "promises_promise_link_id_fkey" FOREIGN KEY ("promise_link_id") REFERENCES "promise_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_promise_id_fkey" FOREIGN KEY ("promise_id") REFERENCES "promises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_sessions" ADD CONSTRAINT "participant_sessions_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
