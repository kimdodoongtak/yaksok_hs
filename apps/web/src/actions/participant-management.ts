"use server";
import { cookies, headers } from "next/headers";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { isSameOrigin } from "@/lib/participant-access/request-policy";
import { participantManagementService } from "@/lib/participant-management/runtime";
import type { ManagementResult } from "@/lib/participant-management/service";
export async function manageParticipant(inviteToken: string, expectedParticipantId: string, action: { kind: "leave"; expectedRole: string; expectedSuccessorId: string | null } | { kind: "remove"; targetParticipantId: string }): Promise<ManagementResult> {
  if (!validInviteToken(inviteToken) || !isSameOrigin(await headers())) return { ok: false, code: "FORBIDDEN" };
  const jar = await cookies(), cookie = sessionCookie(inviteToken, new Date(0));
  const input = { inviteToken, expectedParticipantId, sessionToken: jar.get(cookie.name)?.value };
  if (!action || (action.kind !== "leave" && action.kind !== "remove")) return { ok: false, code: "INVALID_INPUT" };
  const result = action.kind === "leave" ? await participantManagementService.leave({ ...input, ...action }) : await participantManagementService.remove({ ...input, ...action });
  // DB에서 모든 기기 세션을 즉시 만료했다. 쿠키 재설정에 따른 서버 재렌더 없이 완료 안내를 반환한다.
  return result;
}
