-- CreateTable
CREATE TABLE "auth_attempts" (
    "key_hash" VARCHAR(64) NOT NULL,
    "promise_id" UUID,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "blocked_until" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_attempts_pkey" PRIMARY KEY ("key_hash")
);

-- CreateIndex
CREATE INDEX "auth_attempts_expires_at_idx" ON "auth_attempts"("expires_at");

-- AddForeignKey
ALTER TABLE "auth_attempts" ADD CONSTRAINT "auth_attempts_promise_id_fkey" FOREIGN KEY ("promise_id") REFERENCES "promises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
