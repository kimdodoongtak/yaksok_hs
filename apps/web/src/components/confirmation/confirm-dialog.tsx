"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmPromise } from "@/actions/confirmation";
import type { Candidate } from "@/lib/candidates/policy";
import { resultDate,resultTime } from "./format";
import styles from "./confirmation.module.css";
export function ConfirmDialog({inviteToken,participantId,candidate,onClose,onInvalid}:{inviteToken:string;participantId:string;candidate:Candidate;onClose:()=>void;onInvalid:(message:string)=>void}){
  const router=useRouter(),dialog=useRef<HTMLDialogElement>(null),busy=useRef(false);
  const [pending,setPending]=useState(false),[error,setError]=useState("");
  useEffect(()=>{const element=dialog.current;if(!element)return;element.showModal();element.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();return ()=>element.close();},[]);
  async function confirm(){
    if(busy.current)return;
    busy.current=true;setPending(true);setError("");
    try {
      const result=await confirmPromise(inviteToken,candidate.startAt,participantId);
      if(result.ok||result.code==="ALREADY_CONFIRMED"){router.replace(`/p/${inviteToken}/result`);return;}
      if(["UNAUTHORIZED","LINK_EXPIRED","PROMISE_CANCELLED","INVALID_LINK","FORBIDDEN"].includes(result.code)){router.replace(`/p/${inviteToken}`);return;}
      if(result.code==="UNAVAILABLE"){setError("확정하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");return;}
      onInvalid("이 후보는 더 이상 확정할 수 없어요. 최신 후보에서 다시 선택해 주세요.");
    } catch {setError("확정하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");}
    finally {busy.current=false;setPending(false);}
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="confirm-title" aria-busy={pending} onCancel={event=>{event.preventDefault();if(!busy.current)onClose();}}>
    <h2 id="confirm-title">이 시간으로 확정할까요?</h2>
    <div className={styles.summary}><p>{resultDate(candidate.startAt)}</p><strong>{resultTime(candidate.startAt,candidate.endAt)}</strong><span>참석 가능 {candidate.count}명</span></div>
    <div className={styles.actions}><button type="button" data-cancel disabled={pending} onClick={onClose}>취소</button><button type="button" disabled={pending} onClick={confirm}>{pending?"확정 중…":"확정하기"}</button></div>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
  </dialog>;
}
