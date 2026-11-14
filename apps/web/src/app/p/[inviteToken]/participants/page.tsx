import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { participantManagementService } from "@/lib/participant-management/runtime";
import { ParticipantsPanel } from "@/components/participants/participants-panel";
export const runtime = "nodejs";
export default async function Page({ params }: { params: Promise<{ inviteToken: string }> }) {
  const { inviteToken } = await params;
  if (!validInviteToken(inviteToken)) redirect(`/p/${encodeURIComponent(inviteToken)}`);
  const jar = await cookies();
  const result = await participantManagementService.read({ inviteToken, sessionToken: jar.get(sessionCookie(inviteToken, new Date(0)).name)?.value });
  if (!result.ok) { if (result.code === "UNAVAILABLE") throw new Error("참여자를 불러오지 못했습니다."); redirect(`/p/${inviteToken}`); }
  return <ParticipantsPanel key={result.snapshot.participantId} inviteToken={inviteToken} initial={result.snapshot} />;
}
