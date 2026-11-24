"use client";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirmation/confirm-dialog";
import type { OverviewSnapshot } from "@/lib/candidates/view";
import styles from "./availability.module.css";
const date=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"long",day:"numeric",weekday:"short"});
const time=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
export function CandidateList({data,onMore,loading,inviteToken,participantId,canConfirm,onRefresh}:{data?:OverviewSnapshot;onMore:()=>void;loading:boolean;inviteToken:string;participantId:string;canConfirm:boolean;onRefresh:()=>void}){
  const [selectedKey,setSelectedKey]=useState<string|null>(null);
  const [expandedKey,setExpandedKey]=useState<string|null>(null);
  const selected=data?.candidates.find(candidate=>candidate.startAt===selectedKey);
  const [message,setMessage]=useState("");
  return <section className={styles.candidates} aria-labelledby="candidates-heading">
    <h1 id="candidates-heading">가능한 약속 시간</h1>
    <p>전체 기간에서 함께 가능한 인원이 많은 순서예요.</p>
    {message&&<p role="alert">{message}</p>}
    {data && data.status==="closed" && <>{data.candidates.length ? <ol aria-label="시간 후보">{data.candidates.map((candidate,index)=>{
      const expanded=expandedKey===candidate.startAt,rosterId=`candidate-roster-${index}`;
      const attendees=data.participants.filter(person=>candidate.participantIds.includes(person.id));
      return <li key={candidate.startAt} className={styles.candidateItem}>
        <button className={styles.candidateToggle} type="button" aria-expanded={expanded} aria-controls={rosterId} onClick={()=>setExpandedKey(expanded?null:candidate.startAt)}>
          <span className={styles.rank}>{index+1}</span>
          <span className={styles.candidateWhen}><span>{date.format(new Date(candidate.startAt))}</span><strong>{time.format(new Date(candidate.startAt))} ~ {time.format(new Date(candidate.endAt))==="00:00"?"24:00":time.format(new Date(candidate.endAt))}</strong><span className={styles.rosterHint}>참석 가능 명단 {expanded?"접기":"보기"} <span aria-hidden="true">{expanded?"⌃":"⌄"}</span></span></span>
          <span className={styles.candidateCount}>{candidate.count}명 <small>/ {data.participants.length}명</small></span>
        </button>
        {expanded&&<div id={rosterId} className={styles.candidateRoster}><p>이 구간 내내 참석 가능</p><ul aria-label="참석 가능한 사람">{attendees.map(person=><li key={person.id}>{person.nickname}</li>)}</ul></div>}
        {canConfirm&&<button className={styles.selectCandidate} type="button" disabled={loading} onClick={()=>{setMessage("");setSelectedKey(candidate.startAt);}}>이 시간 선택</button>}
      </li>;
    })}</ol>:<div className={styles.emptyCandidates}><strong>함께 가능한 시간이 없어요.</strong><p>약속 시간 내내 2명 이상이 가능한<br/>미래 시간이 있어야 해요.</p></div>}
    {data.hasMore && <button type="button" onClick={onMore} disabled={loading}>후보 더 보기</button>}</>}
    {selected&&data&&<ConfirmDialog key={`${selected.startAt}:${selected.endAt}:${selected.participantIds.join(",")}`} durationMinutes={data.settings.durationMinutes} inviteToken={inviteToken} participantId={participantId} candidate={selected} onClose={()=>setSelectedKey(null)} onInvalid={message=>{setSelectedKey(null);setMessage(message);onRefresh();}}/>}
  </section>;
}
