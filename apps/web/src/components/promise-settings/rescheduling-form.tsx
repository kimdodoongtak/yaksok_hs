"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { changePromiseSettings } from "@/actions/rescheduling";
import type { PromiseSettingsFormState } from "@/actions/promise-settings";
import type { AvailabilitySnapshot } from "@/lib/availability/view";
import { validatePromiseSettings } from "@/lib/promise-settings/policy";
import { rangeChange, type RangeChange } from "@/lib/rescheduling/policy";
import { timeLabel } from "@/components/availability/calendar";
import { SettingsForm } from "./settings-form";
import styles from "./settings.module.css";

type Staged={state:PromiseSettingsFormState;impact:RangeChange;clearsConfirmation:boolean};
export function ReschedulingForm({inviteToken,initial}:{inviteToken:string;initial:AvailabilitySnapshot}){
 const router=useRouter(),dialog=useRef<HTMLDialogElement>(null);
 const [staged,setStaged]=useState<Staged|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const busy=useRef(false),mode=initial.status==="collecting"?"reset":"reopen";
 const {settings}=initial;
 const values={participantLimit:String(settings.participantLimit),dateRangeStart:settings.dateRangeStart,dateRangeEnd:settings.dateRangeEnd,dailyStart:timeLabel(settings.dailyStartMinute),dailyEnd:timeLabel(settings.dailyEndMinute),durationMinutes:String(settings.durationMinutes),votingDeadline:new Date(new Date(settings.votingDeadlineAt).getTime()+9*3600000).toISOString().slice(0,16)};
 useEffect(()=>{const el=dialog.current;if(!staged||!el)return;el.showModal();el.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();return ()=>el.close();},[staged]);
 function finish(){setStaged(null);}
 function stage(data:FormData):Promise<PromiseSettingsFormState>{
  const entered=Object.fromEntries(Object.keys(values).map(key=>[key,String(data.get(key)??"")])) as typeof values;
  const state={values:entered,fieldErrors:{},message:null};
  const validation=validatePromiseSettings(entered,new Date());
  if(!validation.ok)return Promise.resolve({...state,fieldErrors:validation.fieldErrors,message:"입력한 내용을 확인해 주세요."});
  setError("");setStaged({state,impact:rangeChange(settings,validation.value),clearsConfirmation:initial.status==="confirmed"});
  return Promise.resolve(state);
 }
 async function save(){
  if(!staged||busy.current)return;
  busy.current=true;setSaving(true);setError("");
  try{
   const result=await changePromiseSettings(inviteToken,initial.participantId,mode,staged.state.values,staged.impact,staged.clearsConfirmation);
   if(result.ok){finish();router.replace(`/p/${inviteToken}/availability`);return;}
   if(result.code==="IMPACT_CHANGED" && result.impact){
    setStaged({...staged,impact:result.impact,clearsConfirmation:result.clearsConfirmation===true});
    setError("다른 화면에서 설정이 변경됐어요. 변경 영향을 다시 확인해 주세요.");
    return;
   }
   if(result.code==="INVALID_INPUT"){setError(Object.values(result.fieldErrors??{}).join(" ")||"입력한 내용을 확인해 주세요.");return;}
   setError(result.code==="STATE_CHANGED"?"약속 상태가 변경됐어요. 최신 화면을 다시 열어 주세요.":result.code==="UNAVAILABLE"?"저장하지 못했어요. 잠시 후 다시 시도해 주세요.":"설정을 변경할 권한이나 로그인 상태를 확인해 주세요.");
  }catch{setError("연결하지 못했어요. 다시 시도해 주세요.");}
  finally{busy.current=false;setSaving(false);}
 }
 return <main className="min-h-dvh bg-[#f5f6f8] px-4 py-4 text-[#243047] sm:px-6 sm:py-6"><section className="mx-auto w-full max-w-xl">
  <header className="flex items-center justify-between gap-4"><h1 className="text-lg font-semibold">{mode==="reset"?"설정 변경":"재조율"}</h1><Link href={`/p/${inviteToken}/availability`} className="text-sm text-[#4261df]">돌아가기</Link></header>
  <SettingsForm inviteToken={inviteToken} serverNow={initial.serverNow} initialValues={values} submitSettings={stage}/>
  <dialog ref={dialog} className={styles.changeDialog} aria-labelledby="change-title" onCancel={event=>{event.preventDefault();if(!busy.current&&staged)finish();}}>
   <h2 id="change-title">변경 내용을 적용할까요?</h2>
   {staged?.clearsConfirmation&&<p>기존 확정 시간은 해제돼요.</p>}
   <p>{staged?.impact==="expand"?"모든 참여자가 가능 시간을 다시 제출해야 해요. 새 범위 안의 기존 선택은 남겨둬요.":staged?.impact==="shrink"?"줄어든 범위 밖의 선택만 삭제해요. 제출 상태는 유지돼요.":"기존 선택과 제출 상태는 유지돼요."}</p>
   {mode==="reopen"&&<p>새 응답 마감까지 다시 모집해요.</p>}
   {error&&<div role="alert"><p>{error}</p><Link href={`/p/${inviteToken}/availability`}>최신 화면 열기</Link></div>}
   <div className={styles.stepActions}><button data-cancel type="button" className={styles.previous} disabled={saving} onClick={()=>staged&&finish()}>취소</button><button type="button" className={styles.submit} disabled={saving} onClick={save}>{saving?"저장 중…":mode==="reset"?"변경 저장":"재조율 시작"}</button></div>
  </dialog>
 </section></main>;
}
