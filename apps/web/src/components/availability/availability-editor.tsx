"use client";
import { JourneyHeader, JourneyProgress } from "@/components/ui/journey-header";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { closeCollection } from "@/actions/promise-status";
import { heatLegend } from "./heatmap-scale";
import { HeatmapCell } from "./heatmap-cell";
import { availabilityBlocks } from "./heatmap-blocks";
import Link from "next/link";
import { submitAvailability } from "@/actions/availability";
import type { AvailabilityResult, AvailabilitySnapshot } from "@/lib/availability/view";
import { addDays, addMonths, monthDays, durationLabel, localDay, slotAt, timeLabel, weekStart } from "./calendar";
import { useSlotDrag } from "./use-slot-drag";
import { AvailabilitySidebar } from "./availability-sidebar";
import { useOverview } from "./use-overview";
import { DeadlineCountdown } from "./deadline-countdown";
import { DateGrid } from "./date-grid";
import { toggleDate } from "./date-selection";
import { RepeatDialog } from "./repeat-dialog";
import { AvailabilityCoachmarks } from "./availability-coachmarks";
import styles from "./availability.module.css";

const settingsRevision=(snapshot:AvailabilitySnapshot)=>[snapshot.settings,snapshot.status,snapshot.version];

export function AvailabilityEditor({inviteToken,initial}:{inviteToken:string;initial:AvailabilitySnapshot}){
  const router=useRouter();
  const [snapshot,setSnapshot]=useState(initial);
  const [draft,setDraft]=useState(()=>new Set(initial.slots));
  const [stepMinutes,setStepMinutes]=useState(60);
  const [dateView,setDateView]=useState(false);
  const [month,setMonth]=useState(initial.settings.dateRangeStart.slice(0,7));
  const [week,setWeek]=useState(()=>weekStart(initial.settings.dateRangeStart));
  const [view,setView]=useState("mine");
  const [touchSelecting,setTouchSelecting]=useState(false);
  const [guideRequest,setGuideRequest]=useState(0);
  const [confirmClose,setConfirmClose]=useState(false);
  const closeDialog=useRef<HTMLDialogElement>(null);
  const overview=useOverview(inviteToken,snapshot.participantId,dateView?`${month}-01`:week,["mine","all"].includes(view)?undefined:view,5,JSON.stringify(settingsRevision(snapshot)),dateView?month:undefined);
  const [message,setMessage]=useState("");
  const [pending,setPending]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [confirmClear,setConfirmClear]=useState(false);
  const [repeatWeek,setRepeatWeek]=useState<string|null>(null);
  const clearDialog=useRef<HTMLDialogElement>(null);
  const repeatButton=useRef<HTMLButtonElement>(null);
  const drawer=useRef<HTMLDialogElement>(null);
  const latest=useRef(initial);
  const busy=useRef(false);
  const epoch=useRef(0);
  const grid=useRef<HTMLDivElement>(null);
  const controls=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const node=controls.current;if(!node)return;
    const measure=()=>node.parentElement?.style.setProperty("--calendar-controls-height",`${node.offsetHeight}px`);
    measure();const observer=new ResizeObserver(measure);observer.observe(node);
    return ()=>observer.disconnect();
  },[]);
  const {settings}=snapshot;
  const days=Array.from({length:7},(_,i)=>addDays(week,i));
  const blocksByDay=Object.fromEntries(days.map(day=>[day,view==="all"&&overview.data?availabilityBlocks(overview.data.slotParticipantIndexes,day,settings.dailyStartMinute,settings.dailyEndMinute):[]]));
  const minutes=Array.from({length:Math.ceil((settings.dailyEndMinute-settings.dailyStartMinute)/stepMinutes)},(_,i)=>settings.dailyStartMinute+i*stepMinutes);
  const closed=snapshot.status!=="collecting";
  const editable=(day:string,minute:number)=>view==="mine" && !closed && !pending && minute>=settings.dailyStartMinute && minute+30<=settings.dailyEndMinute && day>=settings.dateRangeStart && day<=settings.dateRangeEnd && slotAt(day,minute)>snapshot.serverNow;
  const {start: startDrag, cancelDrag, handlers: dragHandlers}=useSlotDrag(grid,draft,setDraft,editable,()=>setMessage(""),stepMinutes);
  const selected=[...draft].sort();
  const dirty=JSON.stringify(selected)!==JSON.stringify(snapshot.slots);
  const submitted=Boolean(snapshot.submittedAt)&&!dirty;
  const applySnapshot=useCallback((next:AvailabilitySnapshot,force=false)=>{
    if(next.status==="confirmed"){router.replace(`/p/${inviteToken}/result`);return;}
    const previous=latest.current;
    if(next.status==="closed"&&previous.status!=="closed"){cancelDrag();setConfirmClose(false);setRepeatWeek(null);setConfirmClear(false);router.replace(`/p/${inviteToken}/candidates`);return;}
    const changedSettings=JSON.stringify(previous.settings)!==JSON.stringify(next.settings);
    const changedVersion=previous.version!==next.version;
    if(next.participantId!==previous.participantId || next.version<previous.version)return;
    if(force || changedSettings || changedVersion || next.status!==previous.status){
      cancelDrag();setDraft(new Set(next.slots));setConfirmClear(false);setRepeatWeek(null);setConfirmClose(false);
      if(!force)setMessage(changedSettings?(next.submittedAt===null?"약속 설정이 변경됐어요. 가능 시간을 확인하고 다시 제출해 주세요.":"약속 설정이 변경됐어요. 최신 선택을 불러왔어요."):changedVersion?"다른 기기에서 응답이 변경됐어요. 최신 선택을 불러왔어요.":"응답이 마감됐어요. 제출한 시간만 확인할 수 있어요.");
    }
    if(changedSettings)setMonth(current=>current<next.settings.dateRangeStart.slice(0,7)||current>next.settings.dateRangeEnd.slice(0,7)?next.settings.dateRangeStart.slice(0,7):current);
    if(changedSettings)setWeek(current=>current<weekStart(next.settings.dateRangeStart)||current>next.settings.dateRangeEnd?weekStart(next.settings.dateRangeStart):current);
    latest.current=next;setSnapshot(next);
  },[cancelDrag,inviteToken,router]);
  useEffect(()=>{
    let reading=false,disposed=false;
    const controller=new AbortController();
    async function refresh(){
      if(reading || busy.current || document.visibilityState==="hidden")return;
      reading=true;const requestEpoch=epoch.current;
      try {
        const response=await fetch(`/p/${inviteToken}/availability/state`,{cache:"no-store",signal:controller.signal});
        const result:AvailabilityResult=await response.json();
        if(disposed || requestEpoch!==epoch.current)return;
        if(result.ok){
          if(result.snapshot.participantId!==latest.current.participantId)router.replace(`/p/${inviteToken}`);
          else applySnapshot(result.snapshot);
        }
        else if(result.code!=="UNAVAILABLE")router.replace(`/p/${inviteToken}`);
      } catch { /* 미제출 선택을 유지하고 다음 폴링에서 재시도한다. */ }
      finally {reading=false;}
    }
    const timer=window.setInterval(refresh,5000);
    window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
    return ()=>{disposed=true;controller.abort();window.clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
  },[inviteToken,router,applySnapshot]);
  useEffect(()=>{
    const dialog=drawer.current;
    if(!sidebarOpen || !dialog)return;
    dialog.showModal();
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const resize=()=>{if(window.innerWidth>=900)setSidebarOpen(false);};
    window.addEventListener("resize",resize);
    return ()=>{window.removeEventListener("resize",resize);document.body.style.overflow=previousOverflow;dialog.close();};
  },[sidebarOpen]);
  useEffect(()=>{
    const dialog=clearDialog.current;
    if(!confirmClear || !dialog)return;
    const opener=repeatButton.current;
    dialog.showModal();dialog.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
    return ()=>{dialog.close();opener?.focus({preventScroll:true});};
  },[confirmClear]);
  useEffect(()=>{
    const dialog=closeDialog.current;
    if(!confirmClose||!dialog)return;
    dialog.showModal();dialog.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
    return ()=>dialog.close();
  },[confirmClose]);
  async function closeVoting(){
    if(busy.current||closed)return;
    busy.current=true;epoch.current++;setPending(true);cancelDrag();
    try {
      const result=await closeCollection(inviteToken,snapshot.participantId);
      if(result.ok){router.replace(`/p/${inviteToken}/candidates`);}
      else if(["UNAUTHORIZED","LINK_EXPIRED","PROMISE_CANCELLED","INVALID_LINK"].includes(result.code))router.replace(`/p/${inviteToken}`);
      else setMessage(result.code==="FORBIDDEN"?"현재 방장만 마감할 수 있어요.":"마감하지 못했어요. 다시 시도해 주세요.");
    } catch {setMessage("마감하지 못했어요. 다시 시도해 주세요.");}
    finally {setConfirmClose(false);busy.current=false;setPending(false);}
  }
  function changeView(next:string){cancelDrag(true);if(next!==view)setTouchSelecting(false);setView(next);setSidebarOpen(false);}
  function changeTouchMode(selecting:boolean){cancelDrag(true);setTouchSelecting(selecting);}
  const participantProps={participants:overview.participants,onSelect:(id:string)=>changeView(id===snapshot.participantId?"mine":id),selectedId:view==="mine"?snapshot.participantId:view};
  function cellMinutes(minute:number){return Array.from({length:Math.min(stepMinutes,settings.dailyEndMinute-minute)/30},(_,i)=>minute+i*30);}
  function cellState(day:string,minute:number):boolean|"mixed"{
    if(minute<settings.dailyStartMinute || minute>=settings.dailyEndMinute)return false;
    const parts=cellMinutes(minute),count=parts.filter(m=>draft.has(slotAt(day,m))).length;
    return count===parts.length?true:count?"mixed":false;
  }
  function toggle(day:string,minute:number){
    const parts=cellMinutes(minute).filter(m=>editable(day,m));
    if(!parts.length)return;
    const select=!parts.every(m=>draft.has(slotAt(day,m)));
    const next=new Set(draft);
    parts.forEach(m=>{const slot=slotAt(day,m);if(select)next.add(slot);else next.delete(slot);});
    setDraft(next);setMessage("");
  }
  function toggleDay(day:string){
    if(view!=="mine"||closed||pending)return;
    cancelDrag(true);setWeek(weekStart(day));setDraft(current=>toggleDate(current,day,settings,snapshot.serverNow));setMessage("");
  }
  function zoom(value:number|"date"){
    cancelDrag(true);
    if(value==="date"||dateView){
      if(value==="date"&&!dateView)setMonth(current=>current>=week.slice(0,7)&&current<=addDays(week,6).slice(0,7)?current:(week<settings.dateRangeStart?settings.dateRangeStart:week).slice(0,7));
      setDateView(value==="date");setTouchSelecting(false);
      if(value!=="date")setStepMinutes(value);
      window.scrollTo({top:0});return;
    }
    const top=Math.max(0,(controls.current?.getBoundingClientRect().bottom??0)-(grid.current?.getBoundingClientRect().top??0));
    const nextOffset=top*stepMinutes/value;
    setStepMinutes(value);
    if(top>0)requestAnimationFrame(()=>{
      if(grid.current&&controls.current)window.scrollTo({top:window.scrollY+grid.current.getBoundingClientRect().top-controls.current.getBoundingClientRect().bottom+nextOffset});
    });
  }
  function moveMonth(amount:number){
    const next=addMonths(month,amount);
    setMonth(next);setWeek(weekStart(`${next}-01`<settings.dateRangeStart?settings.dateRangeStart:`${next}-01`));
  }
  const futureSlots=selected.filter(slot=>slot>snapshot.serverNow);
  const weekSlots=futureSlots.filter(slot=>localDay(slot)>=week && localDay(slot)<addDays(week,7));
  function clearSelection(scope:"week"|"all"){
    setConfirmClear(false);
    const slots=scope==="week"?weekSlots:futureSlots;
    if(pending || closed || !slots.length)return;
    cancelDrag();const next=new Set(draft);slots.forEach(slot=>next.delete(slot));setDraft(next);setMessage(`${scope==="week"?"이번 주":"모든 주의"} 선택을 지웠어요. 선택 제출을 눌러 저장하세요.`);
  }
  function openRepeat(){
    cancelDrag(true);
    setRepeatWeek(week);
  }
  function applyRepeat(next:Set<string>){
    if(pending || closed)return;
    setDraft(next);setRepeatWeek(null);setMessage("반복 시간을 추가했어요. 선택 제출을 눌러 저장하세요.");
  }
  function move(event:KeyboardEvent<HTMLButtonElement>,day:string,minute:number){
    const steps:Record<string,[number,number]>={ArrowUp:[0,-stepMinutes],ArrowDown:[0,stepMinutes],ArrowLeft:[-1,0],ArrowRight:[1,0]};
    const step=steps[event.key];if(!step)return;
    event.preventDefault();
    const target=grid.current?.querySelector<HTMLButtonElement>(`[data-day="${addDays(day,step[0])}"][data-minute="${minute+step[1]}"]`);
    target?.focus();
  }
  async function submit(){
    if(busy.current || closed || submitted)return;
    busy.current=true;epoch.current++;
    setPending(true);cancelDrag();setMessage("");
    try {
      const result=await submitAvailability(inviteToken,snapshot.version,selected,snapshot.participantId);
      if(result.ok || result.snapshot){
        const next=result.ok?result.snapshot:result.snapshot!;
        applySnapshot(next,true);
      }
      if(result.ok){setTouchSelecting(false);overview.refresh();setMessage(result.snapshot.slots.length?"가능 시간을 제출했어요.":"가능한 시간 없음으로 제출했어요.");}
      else if(result.code==="AVAILABILITY_VERSION_CONFLICT")setMessage("다른 기기에서 응답이 변경됐어요. 최신 선택을 불러왔어요.");
      else if(result.code==="VOTING_CLOSED")router.replace(`/p/${inviteToken}/candidates`);
      else if(["UNAUTHORIZED","LINK_EXPIRED","PROMISE_CANCELLED","DRAFT_EXPIRED","INVALID_LINK","NOT_AVAILABLE"].includes(result.code))router.replace(`/p/${inviteToken}`);
      else setMessage("제출하지 못했어요. 선택은 유지돼요. 다시 시도해 주세요.");
    } catch {setMessage("제출하지 못했어요. 선택은 유지돼요. 다시 시도해 주세요.");}
    finally {busy.current=false;setPending(false);}
  }
  const collectionAction=closed?<Link href={`/p/${inviteToken}/candidates`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>후보 보기</Link>:snapshot.role==="host"?<button type="button" disabled={pending} onClick={()=>{setSidebarOpen(false);setConfirmClose(true);}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>응답 마감</button>:<span className={styles.viewBadge}>모집 중</span>;
  return <main className={`${styles.page} ${styles.calendarPage}`}><div className={styles.shell}>
    <div className={styles.topBar}>
      <JourneyHeader href={`/p/${inviteToken}`}/>
    </div>
    <header className={styles.header}>
      <JourneyProgress stage={closed ? 2 : 1}/>
      <div className={styles.headingRow}>
        <div><h1>{closed?"응답 시간표":"가능 시간 입력"}</h1><p>{snapshot.nickname} · {dirty?"수정 중 · 미제출":snapshot.submittedAt?"제출 완료":"미제출"}</p></div>
      </div>
    </header>
    <div className={styles.calendarTopRow}>
      <button type="button" className={styles.mobileInfoButton} aria-label="약속 정보 열기" aria-expanded={sidebarOpen} aria-controls="availability-drawer" onClick={()=>setSidebarOpen(true)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
    <div className={styles.viewSwitch} role="group" aria-label="시간 보기">
      <button type="button" aria-pressed={view==="mine"} onClick={()=>changeView("mine")}>내 시간</button>
      <button type="button" aria-pressed={view==="all"} onClick={()=>changeView("all")}>전체 시간</button>
    </div>
    {(closed||snapshot.role==="host")?<div className={styles.headerAction}>{collectionAction}</div>:<span aria-hidden="true"/>}
    </div>
    <div className={styles.workspace}>
      <aside className={styles.sidebar} aria-label="약속 정보"><AvailabilitySidebar snapshot={snapshot} inviteToken={inviteToken} {...participantProps}/></aside>
      <div className={styles.calendarColumn}>
      <section className={styles.panel} data-date-view={dateView} aria-label="가능 시간 선택">
    <div className={styles.calendarControls} ref={controls} data-calendar-controls>
    <div className={styles.toolbar}>
      <button type="button" aria-label={dateView?"이전 달":"이전 주"} disabled={dateView?month<=settings.dateRangeStart.slice(0,7):week<=weekStart(settings.dateRangeStart)} onClick={()=>dateView?moveMonth(-1):setWeek(addDays(week,-7))}>‹</button>
      {dateView?<div className={styles.weekHeading} aria-live="polite"><span>{month.slice(0,4)}년</span><strong>{Number(month.slice(5,7))}월</strong></div>:(<div className={styles.weekHeading} aria-live="polite"><span>{week.slice(0,4)}년{week.slice(0,4)!==days[6].slice(0,4)?` – ${days[6].slice(0,4)}년`:""}</span><strong>{Number(week.slice(5,7))}월 {Number(week.slice(8))}일 ~ {week.slice(0,7)!==days[6].slice(0,7)?`${Number(days[6].slice(5,7))}월 `:""}{Number(days[6].slice(8))}일</strong></div>)}
      <button type="button" aria-label={dateView?"다음 달":"다음 주"} disabled={dateView?month>=settings.dateRangeEnd.slice(0,7):addDays(week,7)>settings.dateRangeEnd} onClick={()=>dateView?moveMonth(1):setWeek(addDays(week,7))}>›</button>
    </div>
    <div className={styles.editTools}>
      {view==="mine"&&!closed&&!dateView&&<div className={styles.controlBlock}>
        <div className={styles.controlLabel}>조작 방법</div>
        <div className={styles.touchModes} role="group" aria-label="터치 조작" data-coachmark="mode">
          <button type="button" aria-pressed={!touchSelecting} disabled={pending} onClick={()=>changeTouchMode(false)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v18M7 8l5-5 5 5M7 16l5 5 5-5"/></svg>스크롤</button>
          <button type="button" aria-pressed={touchSelecting} disabled={pending} onClick={()=>changeTouchMode(true)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 12V4a2 2 0 0 1 4 0v7-3a2 2 0 0 1 4 0v4-2a2 2 0 0 1 4 0v5c0 4-3 7-7 7h-1c-2 0-4-1-5-3l-4-5a2 2 0 0 1 3-2l2 2"/></svg>선택</button>
        </div>
      </div>}
      <div className={`${styles.controlBlock} ${styles.unitBlock}`}>
        <div className={styles.controlLabel}>시간 선택 단위</div>
        <div className={styles.zoomControls} role="group" aria-label="입력 단위" data-coachmark="unit">{([30,60,"date"] as const).map(value=><button key={value} type="button" disabled={pending} aria-pressed={value==="date"?dateView:!dateView&&stepMinutes===value} onClick={()=>zoom(value)}>{value==="date"?"날짜":durationLabel(value)}</button>)}</div>
      </div>
    </div>
    <div className={`${styles.help} ${styles.helpWithGuide}`} aria-live="polite">
      {overview.error ? <span>시간 정보를 불러오지 못했어요. <button type="button" onClick={overview.refresh}>다시 불러오기</button></span>
        : overview.loading ? <span>시간 정보 불러오는 중…</span>
        : <span>{view==="all"?`${closed?"집계":"임시 집계"} · 전체 ${overview.data?.participants.length ?? "–"}명`:view!=="mine"?`${overview.participants?.find(member=>member.id===view)?.nickname ?? "참여자"} · 읽기 전용`:closed?"응답이 마감됐어요. 제출한 시간만 확인할 수 있어요.":dateView?"날짜를 눌러 하루 선택·해제":<><span className={styles.mouseHelp}>드래그로 선택 · 양옆 여백을 밀어 스크롤</span><span className={styles.touchHelp}>{touchSelecting?"탭·드래그로 선택":"밀어서 스크롤"}</span></>}</span>}
      {view==="mine"&&!closed&&<button type="button" className={styles.guideButton} disabled={pending} onClick={()=>{cancelDrag(true);setDateView(false);setGuideRequest(value=>value+1);}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/></svg>사용법</button>}
    </div>
    {!dateView&&<div className={styles.dayHeaders}>
        <div className={styles.corner}/>{days.map((day,index)=><div className={styles.day} key={day} data-day-heading><span>{["일","월","화","수","목","금","토"][index]}</span><strong data-today={day===localDay(snapshot.serverNow)}>{Number(day.slice(8))}</strong></div>)}
    </div>}
    </div>
    {dateView?<>
      <p className={styles.dateRangeHint}><span>{view==="mine"&&!closed?`날짜 선택 시 ${timeLabel(settings.dailyStartMinute)}~${timeLabel(settings.dailyEndMinute)} 가능으로 표시돼요.`:`${timeLabel(settings.dailyStartMinute)}~${timeLabel(settings.dailyEndMinute)} 기준 · 제출된 시간`}</span>{view==="mine"&&!closed&&month===localDay(snapshot.serverNow).slice(0,7)&&localDay(snapshot.serverNow)>=settings.dateRangeStart&&<span>오늘은 남은 시간만 선택해요.</span>}</p>
      <DateGrid days={monthDays(month)} settings={settings} now={snapshot.serverNow} draft={draft} view={view} closed={closed} pending={pending} data={overview.data} error={overview.error} onToggle={toggleDay}/>
    </>:<div className={styles.scroll} ref={grid} aria-label="주별 가능 시간" data-coachmark="grid" data-touch-selecting={touchSelecting&&view==="mine"&&!closed} {...dragHandlers}>
      <div className={styles.grid} style={{gridAutoRows:42}}>
        {minutes.map(minute=><div className={styles.row} key={minute}>
          <div className={styles.time}>{stepMinutes>30?timeLabel(minute).replace(/^0/, ""):timeLabel(minute)}</div>
          {days.map(day=>{if(view!=="mine")return <HeatmapCell key={day} blocks={blocksByDay[day]} day={day} minute={minute} stepMinutes={stepMinutes} endMinute={settings.dailyEndMinute} startMinute={settings.dailyStartMinute} valid={day>=settings.dateRangeStart&&day<=settings.dateRangeEnd} data={overview.data} all={view==="all"}/>;
          const active=cellState(day,minute),enabled=cellMinutes(minute).some(m=>editable(day,m));
          const selectedMinute=active==="mixed"?cellMinutes(minute).find(m=>draft.has(slotAt(day,m))):undefined;
          return <button key={day} type="button" className={styles.slot} style={{minHeight:36}} data-day={day} data-minute={minute} data-hour={minute%60===0} data-block-start={active===true && cellState(day,minute-stepMinutes)!==true} data-block-end={active===true && cellState(day,minute+stepMinutes)!==true} aria-label={`${day} ${timeLabel(minute)}${stepMinutes>30?`–${timeLabel(Math.min(minute+stepMinutes,settings.dailyEndMinute))}`:""}`} aria-pressed={active} aria-describedby={selectedMinute===undefined?undefined:`selected-${day}-${minute}`} disabled={!enabled}
            onPointerDown={event=>{if(event.pointerType==="mouse"||touchSelecting)startDrag(event,day,minute);}}
            onClick={event=>{if(event.detail===0)toggle(day,minute);}}
            onKeyDown={event=>move(event,day,minute)}>{active==="mixed"?<>{cellMinutes(minute).map(part=><span key={part} aria-hidden="true" className={styles.slotHalf} data-selected={draft.has(slotAt(day,part))}/>)}<span id={`selected-${day}-${minute}`} className="sr-only">{timeLabel(selectedMinute!)}–{timeLabel(selectedMinute!+30)} 선택됨</span></>:active?<span aria-hidden="true">✓</span>:null}</button>;})}
        </div>)}
      </div>
    </div>}
    {!dateView&&<div className={styles.legend}>{view!=="mine"?<span>{view==="all"?<span className={styles.heatLegend} role="group" aria-label="색상별 가능 인원"><span>0명</span><span className={styles.heatRamp} aria-hidden="true"><i data-heat="0"/>{heatLegend(overview.data?.participants.length??0).map(item=><i key={item.level} data-heat={item.level}/>)}</span><span>{overview.data?.participants.length??"–"}명</span></span>:"제출된 시간 · 읽기 전용"}</span>:<><span><i/>선택한 시간</span><span><i/>선택 불가</span>{stepMinutes>30 && <span className={styles.partialLegend}><i/>30분 선택</span>}</>}</div>}
    <footer className={styles.footer} data-readonly={view!=="mine"}>
      {view==="mine"&&<button ref={repeatButton} type="button" data-coachmark="repeat" className={styles.repeatButton} disabled={pending||closed} onClick={openRepeat}>주간 반복</button>}
      <div className={styles.footerDeadline}>
        <DeadlineCountdown deadline={settings.votingDeadlineAt} serverNow={snapshot.serverNow} closed={closed}/>
      </div>
      {view==="mine"&&<button type="button" data-coachmark="submit" disabled={pending||closed||submitted} data-submitted={submitted} onClick={submit}>{pending?"제출 중…":submitted?<><span aria-hidden="true">✓ </span>제출 완료</>:"선택 제출"}</button>}
    </footer>
    <p role="status" className={styles.notice}>{message}</p>

      </section>
      </div>
    </div>
    <dialog id="availability-drawer" ref={drawer} className={styles.drawer} aria-label="약속 정보" onClose={()=>setSidebarOpen(false)} onClick={event=>{if(event.target===event.currentTarget){const box=event.currentTarget.getBoundingClientRect();if(event.clientX>box.right || event.clientX<box.left)setSidebarOpen(false);}}}>
      <div className={styles.drawerHeader}><h2>약속 정보</h2><button type="button" aria-label="약속 정보 닫기" onClick={()=>setSidebarOpen(false)}>×</button></div>
      <div className={styles.drawerIntro}>
        <p>{snapshot.nickname} · {dirty?"수정 중 · 미제출":snapshot.submittedAt?"제출 완료":"미제출"}</p>
      </div>
      <AvailabilitySidebar snapshot={snapshot} inviteToken={inviteToken} {...participantProps}/>
    </dialog>
    <dialog ref={closeDialog} className={styles.confirmDialog} aria-labelledby="close-title" onCancel={()=>{if(!pending)setConfirmClose(false);}} onClose={event=>{if(!event.currentTarget.open)setConfirmClose(false);}}>
      <h2 id="close-title">응답을 마감할까요?</h2>
      <p>마감하면 새로 참여하거나 시간을 수정할 수 없어요.{dirty && <> 아직 제출하지 않은 내 선택은 반영되지 않아요.</>}</p>
      <div className={styles.closeActions}><button type="button" data-cancel disabled={pending} onClick={()=>setConfirmClose(false)}>취소</button><button type="button" className={styles.closeConfirm} disabled={pending} onClick={closeVoting}>{pending?"마감 중…":"마감하기"}</button></div>
    </dialog>
    {repeatWeek && <RepeatDialog slots={draft} settings={settings} now={snapshot.serverNow} sourceWeek={repeatWeek} onApply={applyRepeat} onReset={()=>{setRepeatWeek(null);setConfirmClear(true);}} onClose={()=>setRepeatWeek(null)}/> }
    <dialog ref={clearDialog} className={styles.confirmDialog} aria-labelledby="clear-title" aria-describedby="clear-description" onCancel={()=>setConfirmClear(false)} onClose={()=>setConfirmClear(false)}>
      <h2 id="clear-title">선택한 시간을 초기화할까요?</h2>
      <p id="clear-description">지난 시간은 유지돼요. 초기화한 내용은 선택 제출을 눌러야 저장돼요.</p>
      <div className={styles.resetChoices}>
        <button type="button" aria-label="이번 주 초기화" disabled={pending||closed||!weekSlots.length} onClick={()=>clearSelection("week")}><strong>이번 주 초기화</strong><span>현재 보고 있는 주의 선택만 삭제</span></button>
        <button type="button" aria-label="전체 초기화" disabled={pending||closed||!futureSlots.length} onClick={()=>clearSelection("all")}><strong>전체 초기화</strong><span>모든 주의 선택 삭제</span></button>
      </div>
      <div><button type="button" data-cancel onClick={()=>setConfirmClear(false)}>취소</button></div>
    </dialog>
  </div>
    <AvailabilityCoachmarks enabled={!closed&&!pending&&view==="mine"&&!dateView&&!sidebarOpen&&!confirmClose&&!confirmClear&&!repeatWeek} request={guideRequest}/>
    {/* A touch target in the margin prevents browsers from snapping edge touches to a nearby slot. */}
    <div className={styles.scrollMargin} aria-hidden="true" onClick={event=>event.stopPropagation()}/>
  </main>;
}
