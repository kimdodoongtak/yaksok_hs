export type ConfirmationSnapshot = {
  participantId: string;
  role: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  attendees: { id: string; nickname: string }[];
  serverNow: string;
};
export type ConfirmationResult = { ok: true; snapshot: ConfirmationSnapshot } | { ok: false; code: string };
export type ConfirmResult = { ok: true } | { ok: false; code: string };
