import type { AvailabilitySnapshot } from "../availability/view";
import type { Candidate } from "./policy";
export type OverviewSnapshot = {
  participantId: string;
  status: string;
  serverNow: string;
  settings: AvailabilitySnapshot["settings"];
  participants: { id: string; nickname: string; role: string }[];
  week: string;
  selected: { participantId: string; slots: string[] } | null;
  heatmap: Record<string, number>;
  // 같은 응답의 participants 배열 위치. 요청한 주 또는 월의 제출 슬롯만 포함한다.
  slotParticipantIndexes: Record<string, number[]>;
  weekCandidates: Candidate[];
  candidates: Candidate[];
  hasMore: boolean;
};
export type OverviewResult = { ok: true; snapshot: OverviewSnapshot } | { ok: false; code: string };
export type CloseResult = { ok: true } | { ok: false; code: string };
