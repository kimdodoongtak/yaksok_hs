"use client";

import { useEffect, useState } from "react";
import type { InvitationView } from "@/lib/invitation/service";
import { InvitationTicket } from "./invitation-ticket";
import actionStyles from "@/components/ui/invitation-actions.module.css";

export function ReadyInvitation({ inviteToken, settings, animate = false }: {
  inviteToken: string;
  settings?: Extract<InvitationView, { state: "ready" }>["settings"];
  animate?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  // 성공 직후의 연출 표시는 소비한다. 새로고침·재접속 때 재생하지 않는다.
  useEffect(() => {
    if (!animate) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("invitation");
    window.history.replaceState(window.history.state, "", url);
  }, [animate]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/p/${inviteToken}`,
      );
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-[#181916]">약속이 준비됐어요</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        아래 링크를 친구들에게 보내 가능 시간을 받아 보세요.
      </p>
      {settings && <InvitationTicket settings={settings} animate={animate} />}
      <button
        type="button"
        onClick={copy}
        className={`${actionStyles.action} ${actionStyles.secondary} mt-6`}
      >
        {copied ? "복사했어요" : "초대 링크 복사"}
      </button>
      {failed && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          링크를 복사하지 못했어요. 브라우저 권한을 확인해 주세요.
        </p>
      )}
    </>
  );
}
