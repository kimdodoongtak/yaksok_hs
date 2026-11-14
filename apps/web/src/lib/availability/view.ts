import type { SlotSettings } from "./policy";
export type AvailabilitySnapshot = {
  participantId: string;
  nickname: string;
  role: string;
  version: number;
  submittedAt: string | null;
  slots: string[];
  settings: SlotSettings & { durationMinutes: number; votingDeadlineAt: string; participantLimit: number };
  status: string;
  serverNow: string;
};
export type AvailabilityResult = { ok: true; snapshot: AvailabilitySnapshot } | { ok: false; code: string; snapshot?: AvailabilitySnapshot };
