"use client";
import { useState } from "react";
import type { Candidate } from "@/lib/candidates/policy";
import { ConfirmDialog } from "@/components/confirmation/confirm-dialog";
import type { OverviewSnapshot } from "@/lib/candidates/view";
import styles from "./availability.module.css";
const date=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"long",day:"numeric",weekday:"short"});
const time=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
export function CandidateList({data,onMore,loading,inviteToken,participantId,canConfirm,onRefresh}:{data?:OverviewSnapshot;onMore:()=>void;loading:boolean;inviteToken:string;participantId:string;canConfirm:boolean;onRefresh:()=>void}){
  const [selected,setSelected]=useState<Candidate|null>(null);
  const [message,setMessage]=useState("");
  return <section className={styles.candidates} aria-labelledby="candidates-heading">
    <h1 id="candidates-heading">가능한 약속 시간</h1>
    <p>전체 기간에서 함께 가능한 인원이 많은 순서예요.</p>
    {message&&<p role="alert">{message}</p>}
    {data && data.status==="closed" && <>{data.candidates.length ? <ol aria-label="시간 후보">{data.candidates.map((candidate,index)=><li key={candidate.startAt}>
      <span className={styles.rank}>{index+1}</span><div><strong>{date.format(new Date(candidate.startAt))}</strong><span>{time.format(new Date(candidate.startAt))} ~ {time.format(new Date(candidate.endAt))==="00:00"?"24:00":time.format(new Date(candidate.endAt))}</span></div>
      <span className={styles.candidateCount}>{candidate.count}명 <small>/ {data.participants.length}명</small></span>
      {canConfirm&&<button className={styles.selectCandidate} type="button" disabled={loading} onClick={()=>{setMessage("");setSelected(candidate);}}>이 시간 선택</button>}
    </li>)}</ol>:<div className={styles.emptyCandidates}><strong>함께 가능한 시간이 없어요.</strong><p>약속 시간 내내 2명 이상이 가능한<br/>미래 시간이 있어야 해요.</p></div>}
    {data.hasMore && <button type="button" onClick={onMore} disabled={loading}>후보 더 보기</button>}</>}
    {selected&&<ConfirmDialog inviteToken={inviteToken} participantId={participantId} candidate={selected} onClose={()=>setSelected(null)} onInvalid={message=>{setSelected(null);setMessage(message);onRefresh();}}/>}
  </section>;
}
