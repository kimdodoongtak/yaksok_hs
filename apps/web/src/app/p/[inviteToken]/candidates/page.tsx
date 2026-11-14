import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { availabilityService } from "@/lib/availability/runtime";
import { CandidatesScreen } from "@/components/confirmation/candidates-screen";
export const runtime="nodejs";
export default async function Page({params}:{params:Promise<{inviteToken:string}>}){
  const {inviteToken}=await params;
  if(!validInviteToken(inviteToken))redirect(`/p/${encodeURIComponent(inviteToken)}`);
  const jar=await cookies();
  const result=await availabilityService.read({inviteToken,sessionToken:jar.get(sessionCookie(inviteToken,new Date(0)).name)?.value});
  if(!result.ok){
    if(result.code==="UNAVAILABLE")throw new Error("시간 후보를 불러오지 못했습니다.");
    redirect(`/p/${inviteToken}`);
  }
  if(result.snapshot.status==="confirmed")redirect(`/p/${inviteToken}/result`);
  if(result.snapshot.status!=="closed")redirect(`/p/${inviteToken}/availability`);
  return <CandidatesScreen key={`${inviteToken}:${result.snapshot.participantId}`} inviteToken={inviteToken} participantId={result.snapshot.participantId} firstDay={result.snapshot.settings.dateRangeStart}/>;
}
