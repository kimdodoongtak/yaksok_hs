"use client";

import { useActionState } from "react";
import { createInvitation } from "@/actions/create-invitation";

export function CreateInvitationForm() {
  const [state, action, pending] = useActionState(createInvitation, { message: null });
  return (
    <form action={action} className="home-create-form">
      <button type="submit" disabled={pending}>
        {pending ? "만드는 중…" : "약속 만들기"}
      </button>
      {state.message && <p role="alert">{state.message}</p>}
    </form>
  );
}
