"use client";
import { useActionState } from "react";
import { abandonDraft } from "@/actions/invitation";
export function AbandonForm({ inviteToken }: { inviteToken: string }) {
  const [state, action, pending] = useActionState(
    abandonDraft.bind(null, inviteToken),
    { message: null },
  );
  return (
    <form action={action} className="mt-8 border-t border-slate-100 pt-5">
      <p className="mb-3 text-sm leading-6 text-slate-500">
        나가면 작성 중인 초안과 방장 등록이 삭제돼요. 초대 링크는 다시 사용할 수
        있어요.
      </p>
      {state.message && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {state.message}
        </p>
      )}
      <button
        disabled={pending}
        className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {pending ? "나가는 중…" : "초안 나가기"}
      </button>
    </form>
  );
}
