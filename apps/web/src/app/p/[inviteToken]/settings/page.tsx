import { InvitationPage } from "@/components/invitation/invitation-page";
export const runtime = "nodejs";
export default async function Page({
  params,
}: {
  params: Promise<{ inviteToken: string }>;
}) {
  const { inviteToken } = await params;
  return <InvitationPage inviteToken={inviteToken} />;
}
