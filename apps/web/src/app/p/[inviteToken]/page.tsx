import { InvitationPage } from "@/components/invitation/invitation-page";
export const runtime = "nodejs";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ inviteToken: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { inviteToken } = await params;
  const { notice } = await searchParams;
  return <InvitationPage inviteToken={inviteToken} pinChanged={notice === "pin-changed"} />;
}
