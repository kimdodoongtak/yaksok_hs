"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfirmationResult, ConfirmationSnapshot } from "@/lib/confirmation/view";
import { durationLabel } from "@/components/availability/calendar";
import { resultDate, resultTime } from "./format";
import { ConfirmedStamp, TicketBarcode } from "./ticket-art";
import styles from "./confirmation.module.css";
export function ConfirmationTicket({inviteToken,initial}:{inviteToken:string;initial:ConfirmationSnapshot}){
  const router=useRouter();
  const [snapshot,setSnapshot]=useState(initial);
  const [offline,setOffline]=useState(false),[refreshId,setRefreshId]=useState(0);
  useEffect(()=>{
    let disposed=false,reading=false;
    const controller=new AbortController();
    async function refresh(){
      if(reading||document.visibilityState==="hidden")return;
      reading=true;
      try {
        const response=await fetch(`/p/${inviteToken}/result/state`,{cache:"no-store",signal:controller.signal});
        const result:ConfirmationResult=await response.json();
        if(disposed)return;
        if(result.ok){
          if(result.snapshot.participantId!==initial.participantId){router.replace(`/p/${inviteToken}`);return;}
          setSnapshot(result.snapshot);setOffline(false);
        } else if(result.code==="UNAVAILABLE")setOffline(true);
        else router.replace(`/p/${inviteToken}${result.code==="NOT_CONFIRMED"?"/availability":""}`);
      } catch {if(!disposed)setOffline(true);}
      finally {reading=false;}
    }
    void refresh();const timer=window.setInterval(refresh,5000);
    window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
    return ()=>{disposed=true;controller.abort();window.clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
  },[inviteToken,initial.participantId,router,refreshId]);
  const [copied,setCopied]=useState(false);
  const [manual,setManual]=useState("");
  async function copy(){
    const url=`${window.location.origin}/p/${inviteToken}/result`;
    try {await navigator.clipboard.writeText(url);setCopied(true);setManual("");}
    catch {setCopied(false);setManual(url);}
  }
  return <div className={styles.canvas}><main className={styles.page}>
    <header className={styles.header}><Link href={`/p/${inviteToken}`}>약속 잡기</Link><span>확정 결과</span></header>
    {offline&&<div role="status" className={styles.notice}><p>최신 결과를 확인하지 못했어요.</p><button type="button" onClick={()=>setRefreshId(value=>value+1)}>다시 불러오기</button></div>}
    <article className={styles.ticket}>
      <div className={styles.coverShadow}><div className={styles.ticketCover}>
        <Image className={styles.coverPhoto} src="/images/ticket-train.png" alt="" fill sizes="(max-width: 359px) calc(100vw - 40px), 320px" priority/>
        <div className={styles.coverShade} aria-hidden="true"/>
        <span className={styles.coverBrand} aria-hidden="true">YAKSOK</span>
        <div className={styles.coverTitle}><h1 aria-label="약속 확정">SEE YOU SOON</h1></div>
      </div></div>
      <div className={styles.paperShadow}><div className={styles.paper}>
        <div className={styles.ticketDetails}>
          <div className={styles.dateRow}><span className={styles.fieldLabel}>날짜</span></div>
          <p className={styles.date}>{resultDate(snapshot.startAt)}</p>
          <span className={styles.fieldLabel}>시간</span>
          <strong className={styles.time} aria-label="확정 시간">{resultTime(snapshot.startAt,snapshot.endAt)}</strong>
          <span className={styles.duration}>소요 {durationLabel(snapshot.durationMinutes)}</span>
        </div>
        <section className={styles.attendees}><h2>참석자 <span>{snapshot.attendees.length}명</span></h2><ul aria-label="참석자">{snapshot.attendees.map(person=><li key={person.id}>{person.nickname}</li>)}</ul>{snapshot.attendees.length===0&&<p>현재 참석 가능한 참여자가 없어요.</p>}</section>
        <div className={styles.ticketStub} aria-hidden="true"><span>약속 잡기</span><TicketBarcode/><span>MEETING TICKET</span></div>
      </div><span className={styles.confirmedStamp}><ConfirmedStamp/></span></div>
    </article>
    {snapshot.role==="host"&&snapshot.attendees.length<2&&<p className={styles.notice}>참석 가능한 인원이 2명 미만이에요. 재조율 또는 약속 취소를 검토해 주세요.</p>}
    <button className={styles.primary} type="button" onClick={copy}>결과 링크 복사</button>
    <p className={styles.help}>이 약속에 참여한 사람만 로그인 후 볼 수 있어요.</p>
    {copied&&<p role="status" className={styles.help}>결과 링크를 복사했어요.</p>}
    {manual&&<div className={styles.manual}><p role="status">자동 복사가 안 돼요. 아래 링크를 직접 복사해 주세요.</p><input aria-label="결과 링크" value={manual} readOnly onFocus={event=>event.target.select()}/></div>}
    {snapshot.role==="host"&&<Link className={styles.back} href={`/p/${inviteToken}/settings/edit`}>재조율하기</Link>}
    <Link className={styles.back} href={`/p/${inviteToken}/participants`}>참여자 · 나가기</Link>
    <Link className={styles.back} href={`/p/${inviteToken}`}>참여 정보</Link>
  </main></div>;
}
