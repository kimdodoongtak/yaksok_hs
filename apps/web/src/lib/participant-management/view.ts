export type ManagementSnapshot = {
  participantId: string;
  role: string;
  status: string;
  participants: { id: string; nickname: string; role: string }[];
};
export type ManagementViewResult = { ok: true; snapshot: ManagementSnapshot } | { ok: false; code: string };
