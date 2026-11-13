import { cookies } from "next/headers";
import { invitationService } from "@/lib/invitation/runtime";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ inviteToken: string }> },
) {
  const { inviteToken } = await params;
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  if (!validInviteToken(inviteToken))
    return Response.json({ state: "invalid" }, { headers });
  const jar = await cookies();
  try {
    const view = await invitationService.readInvitation(
      inviteToken,
      jar.get(sessionCookie(inviteToken, new Date(0)).name)?.value,
    );
    return Response.json(view, { headers });
  } catch {
    return Response.json({ state: "unavailable" }, { status: 503, headers });
  }
}
