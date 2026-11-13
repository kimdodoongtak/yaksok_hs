import { cookies } from "next/headers";
import { invitationService } from "@/lib/invitation/runtime";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { LiveInvitation } from "./live-invitation";
export async function InvitationPage({ inviteToken }: { inviteToken: string }) {
  const jar = await cookies();
  const session = jar.get(sessionCookie(inviteToken, new Date(0)).name)?.value;
  const view = validInviteToken(inviteToken)
    ? await invitationService.readInvitation(inviteToken, session)
    : { state: "invalid" as const };
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-5 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <LiveInvitation
          key={`${inviteToken}:${view.state}`}
          inviteToken={inviteToken}
          initialView={view}
        />
      </section>
    </main>
  );
}
