import "server-only";
import { prisma } from "../prisma";
import { createParticipantAccessService } from "./service";
import { invitationService } from "../invitation/runtime";
import type { InvitationView } from "../invitation/service";
export const participantAccessService = createParticipantAccessService(prisma);
export async function readInvitationPage(inviteToken: string, sessionToken?: string): Promise<InvitationView> {
  const original = await invitationService.readInvitation(inviteToken, sessionToken);
  if (original.state !== "ready" && original.state !== "waiting") return original;
  const result = await participantAccessService.page({ inviteToken, sessionToken });
  if (!result.ok) {
    if (result.code === "LINK_EXPIRED") return { state: "expired" };
    if (result.code === "PROMISE_CANCELLED") return { state: "cancelled" };
    if (result.code === "DRAFT_EXPIRED") return { state: "draft-expired" };
    if (result.code === "INVALID_LINK") return { state: "invalid" };
    throw new Error("약속 상태를 불러올 수 없습니다.");
  }
  return { state: "ready", access: result.view, ...(result.settings ? { settings: result.settings } : {}) };
}
