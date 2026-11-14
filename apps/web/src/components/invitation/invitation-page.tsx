import { cookies } from "next/headers";
import { readInvitationPage } from "@/lib/participant-access/runtime";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { LiveInvitation } from "./live-invitation";
export async function InvitationPage({ inviteToken, animateInvitation = false, pinChanged = false }: { inviteToken: string; animateInvitation?: boolean; pinChanged?: boolean }) {
  const jar = await cookies();
  const session = jar.get(sessionCookie(inviteToken, new Date(0)).name)?.value;
  const view = validInviteToken(inviteToken)
    ? await readInvitationPage(inviteToken, session)
    : { state: "invalid" as const };
  return (
    <main className={`flex min-h-dvh justify-center bg-[#f5f6f8] px-4 text-slate-900 sm:px-6 ${view.state === "host" ? "items-start py-4 sm:py-6" : "items-center py-8 sm:py-12"}`}>
      <section className={view.state === "host" ? "w-full max-w-xl" : view.state === "ready" && view.settings ? "w-full max-w-md" : view.state === "ready" && view.access ? "w-full max-w-xl rounded-xl border border-[#dce3f1] bg-white p-4 min-[480px]:p-5" : "w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9"}>
        <LiveInvitation
          key={`${inviteToken}:${view.state}:${view.state === "ready" && view.access?.kind === "participant" ? view.access.nickname : "anonymous"}:${pinChanged}`}
          inviteToken={inviteToken}
          initialView={view}
          animateInvitation={animateInvitation}
          pinChanged={pinChanged}
        />
      </section>
    </main>
  );
}
