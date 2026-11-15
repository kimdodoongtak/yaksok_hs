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
    <main className="app-entry">
      <section className="entry-content">
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
