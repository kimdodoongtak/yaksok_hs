import { tokenHash } from "./security";
export function sessionCookie(inviteToken: string, expiresAt: Date) {
  return {
    name: `promise_${tokenHash(inviteToken).slice(0, 24)}`,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: `/p/${inviteToken}`,
    expires: expiresAt,
  };
}
export function validInviteToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}
