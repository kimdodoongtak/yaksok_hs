"use client";
import Link from "next/link";
import { JourneyHeader } from "@/components/ui/journey-header";
import { StatusStamp } from "@/components/ui/status-stamp";
import { useEffect, useRef, useState } from "react";
import type { InvitationView } from "@/lib/invitation/service";
import { RegistrationForm } from "./registration-form";
import { CancelPromiseButton } from "@/components/promise-status/cancel-promise-button";
import { AbandonForm } from "./abandon-form";
import { SettingsForm } from "@/components/promise-settings/settings-form";
import { AccessPanel, ParticipantControls } from "@/components/participant-access/access-panel";
import { ReadyInvitation } from "@/components/promise-settings/ready-invitation";
export function LiveInvitation({
  inviteToken,
  initialView,
  animateInvitation = false,
  pinChanged = false,
}: {
  inviteToken: string;
  initialView: InvitationView;
  animateInvitation?: boolean;
  pinChanged?: boolean;
}) {
  const [view, setView] = useState(initialView);
  const [offline, setOffline] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    if (initialView.state === "expired" || initialView.state === "invalid")
      return;
    const controller = new AbortController();
    let running = false;
    async function refresh() {
      if (running) return;
      running = true;
      const requestRevision = revision.current;
      try {
        const response = await fetch(`/p/${inviteToken}/state`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("상태 조회 실패");
        const next: InvitationView = await response.json();
        if (!controller.signal.aborted && requestRevision === revision.current) {
          setView(next);
          setOffline(false);
        }
      } catch {
        if (!controller.signal.aborted && requestRevision === revision.current) setOffline(true);
      } finally {
        running = false;
      }
    }
    const interval = setInterval(refresh, 5000);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [inviteToken, initialView.state]);
  if (["cancelled", "expired", "invalid"].includes(view.state)) {
    const kind = view.state as "cancelled" | "expired" | "invalid";
    return <><JourneyHeader href={null}/><div className="terminal-state"><StatusStamp kind={kind}/><h1>{kind === "cancelled" ? "취소된 약속입니다." : kind === "expired" ? "만료된 약속입니다" : "유효하지 않은 초대 링크입니다."}</h1><Link href="/" className="terminal-create-link">새 약속 만들기</Link></div></>;
  }
  return (
    <>
      <JourneyHeader stage={view.state === "ready" ? view.access?.kind === "participant" ? view.access.status === "confirmed" ? 3 : view.access.status === "closed" ? 2 : 1 : 1 : 0}/>
      {offline && (
        <p role="status" className="mb-4 text-sm text-red-700">
          연결을 확인하고 있어요. 잠시 후 다시 시도해 주세요.
        </p>
      )}
      {(view.state === "available" || view.state === "draft-expired") && (
        <>
          <p className="mb-3 text-xs font-semibold text-[var(--accent)]">STEP 1 · 방장 등록</p>
          <h1 className="text-2xl font-bold tracking-tight">
            {view.state === "available"
              ? "방장 등록"
              : "작성 시간이 만료됐어요"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {view.state === "available"
              ? "방장으로 등록하고 친구들과 만날 약속을 준비해요."
              : "다시 등록하면 새로운 초안으로 시작할 수 있어요."}
          </p>
          <RegistrationForm inviteToken={inviteToken} />
        </>
      )}
      {view.state === "host" && (
        <>
          <h1 className="text-xl font-bold text-[var(--ink)]">약속 설정</h1>
          <p className="mt-1 text-xs text-slate-500">{view.nickname}님, 약속을 설정해 주세요.</p>
          {view.warning && (
            <p
              role="status"
              className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
            >
              초안이 2분 이내에 만료돼요.
            </p>
          )}
          <SettingsForm inviteToken={inviteToken} serverNow={view.serverNow} />
          <p className="mt-3 text-center text-xs leading-5 text-slate-500">방장 등록 후 10분 동안 초안이 유지돼요.</p>
          <AbandonForm inviteToken={inviteToken} />
          <CancelPromiseButton key={view.participantId} inviteToken={inviteToken} participantId={view.participantId} draft onCancelled={() => { revision.current++; setOffline(false); setView({ state: "cancelled" }); }} />
          <ParticipantControls inviteToken={inviteToken} />
        </>
      )}
      {view.state === "waiting" && (
        <>
          <h1 className="text-xl font-bold">방장이 약속을 준비하고 있어요</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            설정이 끝나면 참여할 수 있어요. 잠시 기다려 주세요.
          </p>
        </>
      )}
      {view.state === "invalid" && (
        <h1 className="text-xl font-bold">유효하지 않은 초대 링크입니다.</h1>
      )}
      {view.state === "ready" && (
        <>
          {(!view.access || view.settings) && <ReadyInvitation inviteToken={inviteToken} settings={view.settings} animate={animateInvitation} />}
          {view.access && <AccessPanel key={view.access.kind} inviteToken={inviteToken} view={view.access} pinChanged={pinChanged} hostTicket={Boolean(view.settings)} />}
        </>
      )}
    </>
  );
}
