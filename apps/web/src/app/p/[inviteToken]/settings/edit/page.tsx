import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { availabilityService } from "@/lib/availability/runtime";
import { PromiseAccessGuard } from "@/components/promise-status/promise-access-guard";
import { ReschedulingForm } from "@/components/promise-settings/rescheduling-form";
export const runtime="nodejs";
export default async function Page({params}:{params:Promise<{inviteToken:string}>}){
 const {inviteToken}=await params;
 if(!validInviteToken(inviteToken))redirect(`/p/${encodeURIComponent(inviteToken)}`);
 const jar=await cookies();
 const result=await availabilityService.read({inviteToken,sessionToken:jar.get(sessionCookie(inviteToken,new Date(0)).name)?.value});
 if(!result.ok){if(result.code==="UNAVAILABLE")throw new Error("설정을 불러오지 못했습니다.");redirect(`/p/${inviteToken}`);}
 if(result.snapshot.role!=="host")redirect(`/p/${inviteToken}/availability`);
 return <PromiseAccessGuard inviteToken={inviteToken} participantId={result.snapshot.participantId}><ReschedulingForm inviteToken={inviteToken} initial={result.snapshot}/></PromiseAccessGuard>;
}
