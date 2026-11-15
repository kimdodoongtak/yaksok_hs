"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cancelPromise } from "@/actions/cancellation";
import styles from "./cancellation.module.css";
export function CancelPromiseButton({ inviteToken, participantId, draft = false, onCancelled }: { inviteToken: string; participantId: string; draft?: boolean; onCancelled: () => void }) {
  const router = useRouter(), titleId = useId(), dialog = useRef<HTMLDialogElement>(null), busy = useRef(false);
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    element.showModal(); element.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
    return () => element.close();
  }, [open]);
  async function confirm() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await cancelPromise(inviteToken, participantId);
      if (result.ok || result.code === "PROMISE_CANCELLED") { setOpen(false); onCancelled(); }
      else if (["UNAUTHORIZED", "LINK_EXPIRED", "DRAFT_EXPIRED", "INVALID_LINK"].includes(result.code)) {
        setOpen(false); router.replace(`/p/${inviteToken}`); router.refresh();
      } else setError(result.code === "FORBIDDEN" ? "현재 방장만 약속을 취소할 수 있어요. 최신 화면을 확인해 주세요." : "취소하지 못했어요. 다시 시도해 주세요.");
    } catch { setError("연결하지 못했어요. 다시 시도해 주세요."); }
    finally { busy.current = false; setPending(false); }
  }
  return <div className={styles.section}>
    <button type="button" className={styles.trigger} disabled={pending} onClick={() => { setError(""); setOpen(true); }}>약속 취소</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy.current) setOpen(false); }}>
      <h2 id={titleId}>약속을 취소할까요?</h2>
      <p>모든 참여자가 더 이상 접근할 수 없어요. 취소한 약속은 복원할 수 없어요.</p>
      {draft && <p className={styles.help}>초안 나가기와 달리 이 링크로 다시 시작할 수 없어요.</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" data-cancel disabled={pending} onClick={() => setOpen(false)}>돌아가기</button>
        <button type="button" className={styles.danger} disabled={pending} onClick={confirm}>{pending ? "처리 중…" : "약속 취소하기"}</button>
      </div>
    </dialog>
  </div>;
}
