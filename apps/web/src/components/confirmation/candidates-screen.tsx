"use client";
import { JourneyHeader } from "@/components/ui/journey-header";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CandidateList } from "@/components/availability/candidate-list";
import { useOverview } from "@/components/availability/use-overview";
import { weekStart } from "@/components/availability/calendar";
import styles from "./candidates.module.css";
export function CandidatesScreen({inviteToken,participantId,firstDay}:{inviteToken:string;participantId:string;firstDay:string}){
  const router=useRouter();
  const [limit,setLimit]=useState(5);
  const overview=useOverview(inviteToken,participantId,weekStart(firstDay),undefined,limit,"");
  const status=overview.data?.status;
  const host=overview.data?.participants.find(person=>person.id===participantId)?.role==="host";
  useEffect(()=>{
    if(status==="confirmed")router.replace(`/p/${inviteToken}/result`);
    else if(status&&status!=="closed")router.replace(`/p/${inviteToken}/availability`);
  },[status,inviteToken,router]);
  return <main className={styles.page}><div className={styles.content}>
    <JourneyHeader stage={2} href={`/p/${inviteToken}`}/>
    <div className={styles.navigation}><Link href={`/p/${inviteToken}/availability?view=responses`}>응답 시간표 보기 <span aria-hidden="true">↗</span></Link>{host&&<Link href={`/p/${inviteToken}/settings/edit`}>재조율하기</Link>}</div>
    {overview.loading&&<p className={styles.feedback} role="status">시간 정보 불러오는 중…</p>}
    {overview.error&&<p className={styles.feedback} role="status">시간 정보를 불러오지 못했어요. <button type="button" onClick={overview.refresh}>다시 불러오기</button></p>}
    <CandidateList inviteToken={inviteToken} participantId={participantId} canConfirm={host} onRefresh={overview.refresh} data={overview.data} loading={overview.loading} onMore={()=>setLimit(value=>Math.min(4320,value+5))}/>
    {overview.data&&status==="closed"&&!host&&<p className={styles.memberNotice}>방장이 시간을 선택하면 약속이 확정돼요.</p>}
  </div></main>;
}
