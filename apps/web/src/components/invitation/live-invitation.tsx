"use client";
import { useEffect, useState } from "react";
import type { InvitationView } from "@/lib/invitation/service";
import { RegistrationForm } from "./registration-form";
import { AbandonForm } from "./abandon-form";
export function LiveInvitation({
  inviteToken,
  initialView,
}: {
  inviteToken: string;
  initialView: InvitationView;
}) {
  const [view, setView] = useState(initialView);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (initialView.state === "expired" || initialView.state === "invalid")
      return;
    const controller = new AbortController();
    let running = false;
    async function refresh() {
      if (running) return;
      running = true;
      try {
        const response = await fetch(`/p/${inviteToken}/state`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("상태 조회 실패");
        const next: InvitationView = await response.json();
        if (!controller.signal.aborted) {
          setView(next);
          setOffline(false);
        }
      } catch {
        if (!controller.signal.aborted) setOffline(true);
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
  if (view.state === "expired")
    return <h1 className="text-xl font-bold">만료된 약속입니다</h1>;
  return (
    <>
      {offline && (
        <p role="status" className="mb-4 text-sm text-red-700">
          연결을 확인하고 있어요. 잠시 후 다시 시도해 주세요.
        </p>
      )}
      {(view.state === "available" || view.state === "draft-expired") && (
        <>
          <p className="mb-3 text-sm font-semibold text-slate-500">약속 잡기</p>
          <h1 className="text-2xl font-bold tracking-tight">
            {view.state === "available"
              ? "약속을 시작해 볼까요?"
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
          <h1 className="text-2xl font-bold">약속 설정</h1>
          <p className="mt-4">{view.nickname}님, 약속을 설정해 주세요.</p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            방장 등록 후 10분 동안 초안이 유지돼요.
          </p>
          {view.warning && (
            <p
              role="status"
              className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
            >
              초안이 2분 이내에 만료돼요.
            </p>
          )}
          <AbandonForm inviteToken={inviteToken} />
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
      {view.state === "cancelled" && (
        <h1 className="text-xl font-bold">취소된 약속입니다.</h1>
      )}
      {view.state === "ready" && (
        <>
          <h1 className="text-xl font-bold">약속이 준비됐어요</h1>
          <p className="mt-4 text-sm text-slate-600">
            참여 안내를 확인해 주세요.
          </p>
        </>
      )}
    </>
  );
}
