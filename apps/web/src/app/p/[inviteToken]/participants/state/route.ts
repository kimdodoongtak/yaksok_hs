import { cookies } from "next/headers";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { participantManagementService } from "@/lib/participant-management/runtime";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ inviteToken: string }> }) {
  const { inviteToken } = await params;
  const jar = await cookies();
  const result = validInviteToken(inviteToken) ? await participantManagementService.read({ inviteToken, sessionToken: jar.get(sessionCookie(inviteToken, new Date(0)).name)?.value }) : { ok: false as const, code: "INVALID_LINK" };
  return Response.json(result, { status: result.ok ? 200 : result.code === "UNAVAILABLE" ? 503 : 401, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
