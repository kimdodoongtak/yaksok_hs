"use client";
import { useActionState } from "react";
import { registerHost } from "@/actions/invitation";
export function RegistrationForm({ inviteToken }: { inviteToken: string }) {
  const [state, action, pending] = useActionState(
    registerHost.bind(null, inviteToken),
    { message: null },
  );
  return (
    <form action={action} className="registration-form mt-6 space-y-5">
      <div>
        <label htmlFor="nickname" className="block text-sm font-semibold">
          닉네임
        </label>
        <input
          id="nickname"
          name="nickname"
          required
          autoComplete="nickname"
          aria-describedby="nickname-help"
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
        />
        <p id="nickname-help" className="mt-2 text-sm text-slate-500">
          이모지 없이 2~12자로 입력해 주세요.
        </p>
      </div>
      <div>
        <label htmlFor="pin" className="block text-sm font-semibold">
          PIN
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4}"
          minLength={4}
          maxLength={4}
          required
          autoComplete="new-password"
          aria-describedby="pin-help"
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
        />
        <p id="pin-help" className="mt-2 text-sm text-slate-500">
          다시 들어올 때 사용할 숫자 4자리예요.
        </p>
      </div>
      {state.message && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {pending ? "등록 중…" : "방장으로 시작하기"}
      </button>
    </form>
  );
}
