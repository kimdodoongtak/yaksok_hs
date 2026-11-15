"use server";
import { cookies, headers } from "next/headers";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { isSameOrigin } from "@/lib/participant-access/request-policy";
import { cancellationService } from "@/lib/cancellation/runtime";
import type { CancelResult } from "@/lib/cancellation/service";
export async function cancelPromise(inviteToken: string, expectedParticipantId: unknown): Promise<CancelResult> {
  if (!validInviteToken(inviteToken) || !isSameOrigin(await headers())) return { ok: false, code: "FORBIDDEN" };
  const jar = await cookies();
  return cancellationService.cancel({ inviteToken, expectedParticipantId, sessionToken: jar.get(sessionCookie(inviteToken, new Date(0)).name)?.value });
}
