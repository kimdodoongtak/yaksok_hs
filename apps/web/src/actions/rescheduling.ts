"use server";
import { cookies } from "next/headers";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { reschedulingService } from "@/lib/rescheduling/runtime";
import type { RangeChange } from "@/lib/rescheduling/policy";
import type { ChangeResult } from "@/lib/rescheduling/service";
import type { PromiseSettingsInput } from "@/lib/promise-settings/policy";
export async function changePromiseSettings(inviteToken:string,expectedParticipantId:string,mode:"reset"|"reopen",settings:PromiseSettingsInput,confirmedImpact:RangeChange,confirmedClear:boolean):Promise<ChangeResult>{
 if(!validInviteToken(inviteToken))return {ok:false,code:"INVALID_LINK"};
 const jar=await cookies();
 return reschedulingService.change({inviteToken,expectedParticipantId,mode,settings,confirmedImpact,confirmedClear,sessionToken:jar.get(sessionCookie(inviteToken,new Date(0)).name)?.value});
}
