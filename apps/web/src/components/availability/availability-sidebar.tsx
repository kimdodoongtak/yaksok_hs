"use client";
import { AnimalAvatar } from "@/components/ui/animal-avatar";
import Link from "next/link";
import type { OverviewSnapshot } from "@/lib/candidates/view";
import type { AvailabilitySnapshot } from "@/lib/availability/view";
import { durationLabel, timeLabel } from "./calendar";
import styles from "./availability.module.css";

export function AvailabilitySidebar({snapshot,inviteToken,participants,onSelect,selectedId}:{snapshot:AvailabilitySnapshot;inviteToken:string;participants?:OverviewSnapshot["participants"];onSelect?:(id:string)=>void;selectedId?:string}) {
  const {settings}=snapshot;
  const deadline=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(settings.votingDeadlineAt));
  return <div className={styles.sidebarContent}>
    <section className={`${styles.infoCard} ${styles.scheduleCard}`}>
    <div className={styles.sidebarTitle}><h3>약속 일정</h3><span>{snapshot.status==="collecting"?"모집 중":snapshot.status==="confirmed"?"확정":"마감"}</span></div>
    <div className={styles.infoCardBody}>
    <p className={styles.range}>{settings.dateRangeStart.slice(5).replace("-",".")} – {settings.dateRangeEnd.slice(5).replace("-",".")}</p>
    <dl className={styles.details}>
      <div><dt>소요 시간</dt><dd>{durationLabel(settings.durationMinutes)}</dd></div>
      <div><dt>하루 시간</dt><dd>{timeLabel(settings.dailyStartMinute)} – {timeLabel(settings.dailyEndMinute)}</dd></div>
      <div><dt>응답 마감</dt><dd>{deadline}</dd></div>
      <div><dt>정원</dt><dd>{settings.participantLimit}명</dd></div>
    </dl>
    <div className={styles.cardActions}>
      {snapshot.role==="host"&&<Link href={`/p/${inviteToken}/settings/edit`} className={styles.infoLink}>{snapshot.status==="collecting"?"설정 변경":"재조율하기"}</Link>}
      <Link href={`/p/${inviteToken}`} className={styles.infoLink}>{snapshot.role==="host"?"초대 링크 · 참여 정보":"참여 정보 보기"}</Link>
    </div>
    </div>
    </section>
    <section className={styles.infoCard}>
    <h3 className={styles.myHeading}>참여자{participants ? ` ${participants.length}명` : ""}</h3>
    <p className={styles.infoHint}>이름을 누르면 시간을 볼 수 있어요.</p>
    <div className={styles.participants}><button type="button" aria-label="전체 일정" aria-pressed={selectedId==="all"} onClick={()=>onSelect?.("all")}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4m8-4v4M4 10h16"/></svg><strong>전체 일정</strong><span className={styles.responseCheck} aria-hidden="true">{selectedId==="all"?"✓":""}</span></button>{participants?.map((member,index)=><button key={member.id} type="button" aria-label={member.nickname} aria-pressed={selectedId===member.id} onClick={()=>onSelect?.(member.id)}><AnimalAvatar index={index}/><strong>{member.nickname}</strong><span>{member.role==="host"?"방장":member.id===snapshot.participantId?"나":""}</span><span aria-hidden="true" className={styles.responseCheck}>{selectedId===member.id ? "✓" : ""}</span></button>)}</div>
    <Link href={`/p/${inviteToken}/participants?from=availability`} className={styles.infoLink}>{snapshot.role==="host"?"참여자 관리":"참여자 · 나가기"}</Link>
    </section>
    <section className={styles.infoCard}>
    <h3 className={styles.myHeading}>내 참여 정보</h3>
    <div className={styles.myCard}><div><strong>{snapshot.nickname}</strong><span>{snapshot.role==="host"?"방장":"참여자"}</span></div><p>{snapshot.submittedAt?"응답 제출 완료":"응답 대기"}</p></div>
    </section>
  </div>;
}
