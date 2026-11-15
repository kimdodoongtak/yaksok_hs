import { cookies } from "next/headers";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { candidatesService } from "@/lib/candidates/runtime";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ inviteToken: string }> }) {
  const { inviteToken } = await params;
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  if (!validInviteToken(inviteToken)) return Response.json({ ok: false, code: "INVALID_LINK" }, { status: 400, headers });
  const query = new URL(request.url).searchParams;
  const jar = await cookies();
  const result = await candidatesService.read({
    inviteToken, sessionToken: jar.get(sessionCookie(inviteToken, new Date(0)).name)?.value,
    week: query.get("week") ?? undefined, participantId: query.get("participantId") ?? undefined,
    limit: query.has("limit") ? Number(query.get("limit")) : undefined,
  });
  return Response.json(result, { status: result.ok ? 200 : result.code === "PROMISE_CANCELLED" ? 409 : result.code === "UNAVAILABLE" ? 503 : result.code === "UNAUTHORIZED" ? 401 : 400, headers });
}
