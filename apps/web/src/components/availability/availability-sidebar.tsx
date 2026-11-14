"use client";
import Link from "next/link";
import type { AvailabilitySnapshot } from "@/lib/availability/view";
import { durationLabel, timeLabel } from "./calendar";
import styles from "./availability.module.css";

export function AvailabilitySidebar({snapshot,inviteToken}:{snapshot:AvailabilitySnapshot;inviteToken:string}) {
  const {settings}=snapshot;
  const deadline=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(settings.votingDeadlineAt));
  return <div className={styles.sidebarContent}>
    <div className={styles.sidebarTitle}><h3>약속 일정</h3><span>{snapshot.status==="collecting"?"모집 중":snapshot.status==="confirmed"?"확정":"마감"}</span></div>
    <p className={styles.range}>{settings.dateRangeStart.slice(5).replace("-",".")} – {settings.dateRangeEnd.slice(5).replace("-",".")}</p>
    <dl className={styles.details}>
      <div><dt>소요 시간</dt><dd>{durationLabel(settings.durationMinutes)}</dd></div>
      <div><dt>하루 시간</dt><dd>{timeLabel(settings.dailyStartMinute)} – {timeLabel(settings.dailyEndMinute)}</dd></div>
      <div><dt>응답 마감</dt><dd>{deadline}</dd></div>
      <div><dt>정원</dt><dd>{settings.participantLimit}명</dd></div>
    </dl>
    <h3 className={styles.myHeading}>내 참여 정보</h3>
    <div className={styles.myCard}><div><strong>{snapshot.nickname}</strong><span>{snapshot.role==="host"?"방장":"참여자"}</span></div><p>{snapshot.submittedAt?"응답 제출 완료":"응답 대기"}</p></div>
    <Link href={`/p/${inviteToken}`} className={styles.infoLink}>{snapshot.role==="host"?"초대 링크 · 참여 정보":"참여 정보 보기"}</Link>
  </div>;
}
