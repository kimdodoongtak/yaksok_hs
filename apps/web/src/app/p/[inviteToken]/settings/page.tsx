import { InvitationPage } from "@/components/invitation/invitation-page";
export const runtime = "nodejs";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ inviteToken: string }>;
  searchParams: Promise<{ invitation?: string }>;
}) {
  const { inviteToken } = await params;
  const { invitation } = await searchParams;
  return <InvitationPage inviteToken={inviteToken} animateInvitation={invitation === "ready"} />;
}
