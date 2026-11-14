-- CreateTable
CREATE TABLE "participant_available_slots" (
    "id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "slot_start_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "participant_available_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "participant_available_slots_participant_id_slot_start_at_key" ON "participant_available_slots"("participant_id", "slot_start_at");

-- AddForeignKey
ALTER TABLE "participant_available_slots" ADD CONSTRAINT "participant_available_slots_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "participant_available_slots" ADD CONSTRAINT "ck_slot_half_hour"
CHECK (EXTRACT(MINUTE FROM slot_start_at AT TIME ZONE 'Asia/Seoul') IN (0, 30)
  AND EXTRACT(SECOND FROM slot_start_at AT TIME ZONE 'Asia/Seoul') = 0);
