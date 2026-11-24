"use server";
import { cookies, headers } from "next/headers";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { isSameOrigin } from "@/lib/participant-access/request-policy";
import { confirmationService } from "@/lib/confirmation/runtime";
import type { ConfirmResult } from "@/lib/confirmation/view";
export async function confirmPromise(inviteToken:string,startAt:unknown,expectedParticipantId:unknown,endAt?:unknown):Promise<ConfirmResult>{
  if(!validInviteToken(inviteToken)||!isSameOrigin(await headers()))return {ok:false,code:"FORBIDDEN"};
  if(typeof expectedParticipantId!=="string")return {ok:false,code:"UNAUTHORIZED"};
  const jar=await cookies();
  return confirmationService.confirm({inviteToken,startAt,endAt,expectedParticipantId,sessionToken:jar.get(sessionCookie(inviteToken,new Date(0)).name)?.value});
}
