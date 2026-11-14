export type ParticipantView =
  | { kind: "anonymous"; registration: "open" | "full" | "closed" | "draft" }
  | { kind: "participant"; nickname: string; role: string; status: string };
