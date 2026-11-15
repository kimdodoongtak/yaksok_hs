"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { manageParticipant } from "@/actions/participant-management";
import type { ManagementResult } from "@/lib/participant-management/service";
import type { ManagementSnapshot, ManagementViewResult } from "@/lib/participant-management/view";
import { CancelPromiseButton } from "@/components/promise-status/cancel-promise-button";
import { LiveInvitation } from "@/components/invitation/live-invitation";
import styles from "./participants.module.css";
type Choice = { kind: "leave"; expectedRole: string; expectedSuccessorId: string | null; successorNickname?: string } | { kind: "remove"; targetParticipantId: string; nickname: string };
export function ParticipantsPanel({ inviteToken, initial }: { inviteToken: string; initial: ManagementSnapshot }) {
  const router = useRouter(), dialog = useRef<HTMLDialogElement>(null);
  const [snapshot, setSnapshot] = useState(initial), latest = useRef(initial);
  const [choice, setChoice] = useState<Choice | null>(null), [pending, setPending] = useState(false);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [done, setDone] = useState<Extract<ManagementResult, { ok: true }> | null>(null);
  const busy = useRef(false), finished = useRef(false), generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const refresh = useCallback(async () => {
    if (busy.current || finished.current) return;
    const request = ++generation.current;
    try {
      const response = await fetch(`/p/${inviteToken}/participants/state`, { cache: "no-store" });
      const result: ManagementViewResult = await response.json();
      if (request !== generation.current || busy.current || finished.current) return;
      if (!result.ok) {
        if (result.code === "UNAVAILABLE") throw new Error("unavailable");
        router.replace(`/p/${inviteToken}`); return;
      }
      if (result.snapshot.participantId !== initial.participantId) { router.replace(`/p/${inviteToken}`); return; }
      setOffline(false);
      if (JSON.stringify(latest.current) !== JSON.stringify(result.snapshot)) {
        setChoice(null); setError("");
        setMessage(latest.current.role !== "host" && result.snapshot.role === "host" ? "방장이 되었어요. 이제 참여자를 관리할 수 있어요." : "참여자 또는 약속 상태가 변경됐어요. 최신 내용을 확인해 주세요.");
        latest.current = result.snapshot; setSnapshot(result.snapshot);
      }
    } catch { if (request === generation.current && !finished.current) setOffline(true); }
  }, [inviteToken, initial.participantId, router]);
  useEffect(() => {
    if (done || cancelled) return;
    const timer = setInterval(() => void refresh(), 5000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { invalidate(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [refresh, done, cancelled, invalidate]);
  useEffect(() => {
    if (!choice || !dialog.current) return;
    const element = dialog.current; element.showModal(); element.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
    return () => element.close();
  }, [choice]);
  function leave() {
    const successor = snapshot.role === "host" ? snapshot.participants.find(member => member.id !== snapshot.participantId) : undefined;
    setError(""); setChoice({ kind: "leave", expectedRole: snapshot.role, expectedSuccessorId: successor?.id ?? null, successorNickname: successor?.nickname });
  }
  async function submit() {
    if (!choice || busy.current) return;
    busy.current = true; generation.current++; setPending(true); setError("");
    let reload = false;
    try {
      const result = await manageParticipant(inviteToken, initial.participantId, choice);
      if (result.ok) {
        setChoice(null);
        if (result.outcome === "removed") { setMessage("참여자를 내보냈어요."); reload = true; }
        else { finished.current = true; setDone(result); }
      } else if (["STATE_CHANGED", "SUCCESSOR_CHANGED", "INVALID_TARGET"].includes(result.code)) {
        setChoice(null); setMessage("참여 상태가 변경됐어요. 최신 내용을 확인하고 다시 선택해 주세요."); reload = true;
      } else if (["UNAUTHORIZED", "PROMISE_CANCELLED", "LINK_EXPIRED", "INVALID_LINK"].includes(result.code)) {
        setChoice(null); router.replace(`/p/${inviteToken}`);
      } else setError(result.code === "FORBIDDEN" ? "내보낼 권한이 없어요. 최신 화면을 확인해 주세요." : "처리하지 못했어요. 다시 시도해 주세요.");
    } catch { setError("연결하지 못했어요. 다시 시도해 주세요."); }
    finally { busy.current = false; setPending(false); if (reload) void refresh(); }
  }
  if (cancelled) return <main className={styles.page}><section className={styles.content}><LiveInvitation inviteToken={inviteToken} initialView={{ state: "cancelled" }} /></section></main>;
  const cancelling = choice?.kind === "leave" && choice.expectedRole === "host" && !choice.expectedSuccessorId;
  return <main className={styles.page}><section className={styles.content}>
    {done ? <div className={styles.complete}>
      <span className={styles.completeIcon} aria-hidden="true">✓</span>
      <h1>{done.outcome === "cancelled" ? "약속이 취소됐어요" : "약속에서 나왔어요"}</h1>
      <p>{done.successorNickname ? `${done.successorNickname}님이 방장을 이어받았어요.` : done.outcome === "cancelled" ? "마지막 참여자가 나가 약속이 종료됐어요." : "이 약속의 참여가 종료됐어요."}</p>
      <Link className={styles.back} href="/">홈으로</Link>
    </div> : <>
      <header className={styles.header}><Link href={`/p/${inviteToken}`}>← 약속으로</Link><span>{snapshot.status === "collecting" ? "모집 중" : snapshot.status === "confirmed" ? "확정" : "응답 마감"}</span></header>
      <div className={styles.title}><h1>참여자</h1><span>{snapshot.participants.length}명</span></div>
      {message && <p role="status" className={styles.notice}>{message}</p>}
      {offline && <p role="status" className={styles.notice}>최신 정보를 불러오지 못했어요. 잠시 후 다시 확인할게요.</p>}
      <ul className={styles.list}>{snapshot.participants.map(member => <li key={member.id}>
        <span className={styles.avatar} aria-hidden="true">{Array.from(member.nickname)[0]}</span>
        <div className={styles.person}><strong>{member.nickname}</strong><span>{member.role === "host" ? "방장" : "참여자"}{member.id === snapshot.participantId ? " · 나" : ""}</span></div>
        {snapshot.role === "host" && snapshot.status === "collecting" && member.id !== snapshot.participantId && <button type="button" className={styles.remove} aria-label={`${member.nickname} 내보내기`} disabled={pending} onClick={() => { setError(""); setChoice({ kind: "remove", targetParticipantId: member.id, nickname: member.nickname }); }}>내보내기</button>}
      </li>)}</ul>
      {snapshot.role === "host" && snapshot.status !== "collecting" && <p className={styles.help}>응답 마감 후에는 참여자를 내보낼 수 없어요.</p>}
      <footer className={styles.footer}><p>나가면 기존 닉네임으로 다시 참여할 수 없어요.</p><button className={styles.leave} type="button" disabled={pending} onClick={leave}>약속 나가기 <span aria-hidden="true">↗</span></button></footer>
      {snapshot.role === "host" && <CancelPromiseButton inviteToken={inviteToken} participantId={snapshot.participantId} onCancelled={() => { finished.current = true; setCancelled(true); }} />}
    </>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="participant-action-title" onCancel={event => { event.preventDefault(); if (!busy.current) setChoice(null); }}>
      <h2 id="participant-action-title">{choice?.kind === "remove" ? "참여자를 내보낼까요?" : "약속에서 나갈까요?"}</h2>
      {choice?.kind === "remove" ? <p><strong>{choice.nickname}</strong>님의 참여가 종료돼요. 기존 닉네임으로 다시 참여할 수 없어요.</p> : <>
        <p>{cancelling ? "마지막 참여자라 약속이 취소돼요." : choice?.successorNickname ? `${choice.successorNickname}님이 방장을 이어받아요.` : "나가면 이 약속에 접근할 수 없어요."}</p>
        {!cancelling && <p className={styles.help}>기존 닉네임으로 다시 참여할 수 없어요.</p>}
      </>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}><button type="button" data-cancel disabled={pending} onClick={() => setChoice(null)}>취소</button><button type="button" className={styles.danger} disabled={pending} onClick={submit}>{pending ? "처리 중…" : choice?.kind === "remove" ? "내보내기" : cancelling ? "약속 취소하고 나가기" : "나가기"}</button></div>
    </dialog>
  </section></main>;
}
