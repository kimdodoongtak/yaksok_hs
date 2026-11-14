"use server";
import { cookies, headers } from "next/headers";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { isSameOrigin } from "@/lib/participant-access/request-policy";
import { candidatesService } from "@/lib/candidates/runtime";
import type { CloseResult } from "@/lib/candidates/view";
export async function closeCollection(inviteToken:string,expectedParticipantId:string):Promise<CloseResult>{
  if(!validInviteToken(inviteToken)||!isSameOrigin(await headers()))return {ok:false,code:"FORBIDDEN"};
  if(typeof expectedParticipantId!=="string"||!expectedParticipantId)return {ok:false,code:"INVALID_INPUT"};
  const jar=await cookies();
  return candidatesService.close({inviteToken,expectedParticipantId,sessionToken:jar.get(sessionCookie(inviteToken,new Date(0)).name)?.value});
}
