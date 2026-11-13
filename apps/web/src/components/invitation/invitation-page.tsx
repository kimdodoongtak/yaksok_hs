import { cookies } from "next/headers";
import { invitationService } from "@/lib/invitation/runtime";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { LiveInvitation } from "./live-invitation";
export async function InvitationPage({ inviteToken, animateInvitation = false }: { inviteToken: string; animateInvitation?: boolean }) {
  const jar = await cookies();
  const session = jar.get(sessionCookie(inviteToken, new Date(0)).name)?.value;
  const view = validInviteToken(inviteToken)
    ? await invitationService.readInvitation(inviteToken, session)
    : { state: "invalid" as const };
  return (
    <main className={`flex min-h-dvh justify-center bg-[#f5f6f8] px-4 py-8 text-slate-900 sm:px-6 sm:py-12 ${view.state === "host" ? "items-start" : "items-center"}`}>
      <section className={view.state === "host" ? "w-full max-w-xl" : view.state === "ready" && view.settings ? "w-full max-w-md" : "w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9"}>
        <LiveInvitation
          key={`${inviteToken}:${view.state}`}
          inviteToken={inviteToken}
          initialView={view}
          animateInvitation={animateInvitation}
        />
      </section>
    </main>
  );
}
