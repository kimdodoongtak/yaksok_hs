import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { confirmationService } from "@/lib/confirmation/runtime";
import { ConfirmationTicket } from "@/components/confirmation/confirmation-ticket";
export const runtime="nodejs";
export default async function Page({params}:{params:Promise<{inviteToken:string}>}){
  const {inviteToken}=await params;
  if(!validInviteToken(inviteToken))redirect(`/p/${encodeURIComponent(inviteToken)}`);
  const jar=await cookies();
  const result=await confirmationService.read({inviteToken,sessionToken:jar.get(sessionCookie(inviteToken,new Date(0)).name)?.value});
  if(!result.ok){
    if(result.code==="UNAVAILABLE")throw new Error("확정 결과를 불러오지 못했습니다.");
    redirect(`/p/${inviteToken}${result.code==="NOT_CONFIRMED"?"/availability":""}`);
  }
  return <ConfirmationTicket key={`${inviteToken}:${result.snapshot.participantId}`} inviteToken={inviteToken} initial={result.snapshot}/>;
}
