import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { availabilityService } from "@/lib/availability/runtime";
import { AvailabilityEditor } from "@/components/availability/availability-editor";
export const runtime="nodejs";
export default async function Page({params,searchParams}:{params:Promise<{inviteToken:string}>;searchParams:Promise<{view?:string}>}){
  const {inviteToken}=await params;
  if(!validInviteToken(inviteToken))redirect(`/p/${encodeURIComponent(inviteToken)}`);
  const jar=await cookies();
  const result=await availabilityService.read({inviteToken,sessionToken:jar.get(sessionCookie(inviteToken,new Date(0)).name)?.value});
  if(!result.ok){
    if(result.code==="UNAVAILABLE")throw new Error("가능 시간을 불러오지 못했습니다.");
    redirect(`/p/${inviteToken}`);
  }
  if(result.snapshot.status==="confirmed")redirect(`/p/${inviteToken}/result`);
  if(result.snapshot.status==="closed"&&(await searchParams).view!=="responses")redirect(`/p/${inviteToken}/candidates`);
  return <AvailabilityEditor key={`${inviteToken}:${result.snapshot.participantId}`} inviteToken={inviteToken} initial={result.snapshot}/>;
}
