"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmPromise } from "@/actions/confirmation";
import type { Candidate } from "@/lib/candidates/policy";
import { resultDate,resultTime } from "./format";
import { durationLabel } from "@/components/availability/calendar";
import styles from "./confirmation.module.css";
export function ConfirmDialog({inviteToken,participantId,candidate,durationMinutes,onClose,onInvalid,preview=false}:{inviteToken:string;participantId:string;candidate:Candidate;durationMinutes:number;onClose:()=>void;onInvalid:(message:string)=>void;preview?:boolean}){
  const router=useRouter(),dialog=useRef<HTMLDialogElement>(null),busy=useRef(false);
  const [pending,setPending]=useState(false),[error,setError]=useState("");
  const [previewMessage,setPreviewMessage]=useState("");
  const [selection,setSelection]=useState(()=>({start:Date.parse(candidate.startAt),end:Date.parse(candidate.endAt)}));
  const earliest=Date.parse(candidate.startAt),latest=Date.parse(candidate.endAt),minimum=durationMinutes*60000;
  const startAt=new Date(selection.start).toISOString(),endAt=new Date(selection.end).toISOString();
  const total=durationLabel((selection.end-selection.start)/60000);
  function adjust(part:"start"|"end",delta:number){
    if(busy.current)return;
    setSelection(current=>{
      const next={...current,[part]:current[part]+delta*60000};
      return next.start<earliest||next.end>latest||next.end-next.start<minimum?current:next;
    });
  }
  useEffect(()=>{const element=dialog.current;if(!element)return;element.showModal();element.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();return ()=>element.close();},[]);
  async function confirm(){
    if(preview){setPreviewMessage("미리보기예요. 실제 약속은 저장되지 않았어요.");return;}
    if(busy.current)return;
    busy.current=true;setPending(true);setError("");
    try {
      const result=await confirmPromise(inviteToken,startAt,participantId,endAt);
      if(result.ok||result.code==="ALREADY_CONFIRMED"){router.replace(`/p/${inviteToken}/result`);return;}
      if(["UNAUTHORIZED","LINK_EXPIRED","PROMISE_CANCELLED","INVALID_LINK","FORBIDDEN"].includes(result.code)){router.replace(`/p/${inviteToken}`);return;}
      if(result.code==="UNAVAILABLE"){setError("확정하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");return;}
      onInvalid("이 후보는 더 이상 확정할 수 없어요. 최신 후보에서 다시 선택해 주세요.");
    } catch {setError("확정하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");}
    finally {busy.current=false;setPending(false);}
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="confirm-title" aria-busy={pending} onCancel={event=>{event.preventDefault();if(!busy.current)onClose();}}>
    <h2 id="confirm-title">이 시간으로 확정할까요?</h2>
    <p className={styles.rangeContext}>{resultDate(candidate.startAt)}<br/><span>{resultTime(candidate.startAt,candidate.endAt)} 안에서 · 최소 {durationLabel(durationMinutes)}</span></p>
    <div className={styles.timeControls}>
      {([{part:"start",label:"시작 시간"},{part:"end",label:"종료 시간"}] as const).map(({part,label})=>{
        const value=selection[part],min=part==="start"?earliest:selection.start+minimum,max=part==="start"?selection.end-minimum:latest;
        const clock=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(value));
        return <div key={part} className={styles.timeControl} role="group" aria-label={label}>
          <span>{label}</span>
          <div className={styles.timeControlRow}>
            <output aria-label={`선택한 ${label}`}>{part==="end"&&clock==="00:00"?"24:00":clock}</output>
            <div className={styles.adjustButtons}>{([30,-30] as const).map(delta=><button key={delta} type="button" aria-label={`${label} 30분 ${delta>0?"늦추기":"앞당기기"}`} disabled={pending||(delta>0?value>=max:value<=min)} onClick={()=>adjust(part,delta)}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={delta>0?"m6 15 6-6 6 6":"m6 9 6 6 6-6"}/></svg>
            </button>)}</div>
          </div>
        </div>;
      })}
    </div>
    <div className={styles.selectionDetails} aria-live="polite"><strong>총 {total}</strong><span>참석 가능 {candidate.count}명</span></div>
    <p className={styles.confirmHelp}>확정된 시간은 참여자 모두에게 표시돼요.<br/>일정을 바꾸려면 다시 조율할 수 있어요.</p>
    <div className={styles.actions}><button type="button" data-cancel disabled={pending} onClick={onClose}>취소</button><button type="button" disabled={pending} onClick={confirm}>{pending?"확정 중…":`${resultTime(startAt,endAt)} · ${total} 확정`}</button></div>
    {previewMessage&&<p role="status" className={styles.confirmHelp}>{previewMessage}</p>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
  </dialog>;
}
