"use client";
import { useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";
import styles from "./candidates.module.css";
import cardStyles from "../availability/availability.module.css";

const candidate={startAt:"2026-11-26T00:00:00.000Z",endAt:"2026-11-26T04:00:00.000Z",count:5};
export function ConfirmationPreview(){
  const [open,setOpen]=useState(true);
  return <main className={styles.page}><div className={styles.content}>
    <section className={cardStyles.candidates}>
      <h1>가능한 약속 시간</h1>
      <p>UI 미리보기 · 실제 약속은 저장되지 않아요.</p>
      <ol><li><span className={cardStyles.rank}>1</span><div><strong>11월 26일 (목)</strong><span>09:00 ~ 13:00</span></div><span className={cardStyles.candidateCount}>5명 / 5명</span><button className={cardStyles.selectCandidate} type="button" onClick={()=>setOpen(true)}>이 시간 선택</button></li></ol>
    </section>
    {open&&<ConfirmDialog preview inviteToken="" participantId="" candidate={candidate} durationMinutes={120} onClose={()=>setOpen(false)} onInvalid={()=>{}}/>}
  </div></main>;
}
