"use server";
import { cookies, headers } from "next/headers";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { isSameOrigin } from "@/lib/participant-access/request-policy";
import { availabilityService } from "@/lib/availability/runtime";
import type { AvailabilityResult } from "@/lib/availability/view";
export async function submitAvailability(inviteToken: string, baseVersion: unknown, slots: unknown, expectedParticipantId?: unknown): Promise<AvailabilityResult> {
  if (!validInviteToken(inviteToken) || !isSameOrigin(await headers())) return {ok:false,code:"FORBIDDEN"};
  const jar=await cookies();
  return availabilityService.submit({inviteToken,sessionToken:jar.get(sessionCookie(inviteToken,new Date(0)).name)?.value,baseVersion,slots,expectedParticipantId});
}
