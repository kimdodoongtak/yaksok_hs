import type { SlotSettings } from "@/lib/availability/policy";
import type { OverviewSnapshot } from "@/lib/candidates/view";
import { datePeople, dateSlots, selectionState } from "./date-selection";
import { localDay } from "./calendar";
import styles from "./availability.module.css";

const weekdays=["일","월","화","수","목","금","토"];
export function DateGrid({days,settings,now,draft,view,closed,pending,data,error,onToggle}:{
  days:string[];settings:SlotSettings;now:string;draft:ReadonlySet<string>;view:string;
  closed:boolean;pending:boolean;data?:OverviewSnapshot;error?:boolean;onToggle:(day:string)=>void;
}){
  const unavailable=error?"조회 못함":"조회 중";
  const selected=view==="mine"?draft:new Set(data?.selected?.slots??[]);
  return <div className={styles.monthCalendar}>
    <div className={styles.monthWeekdays} aria-hidden="true">{weekdays.map(day=><span key={day}>{day}</span>)}</div>
    <div className={styles.dateGrid} role="group" aria-label="월별 가능 날짜">
      {days.map((day,index)=>{
        const slots=dateSlots(day,settings),future=slots.filter(slot=>slot>now);
        const activeSlots=view==="mine"&&!closed&&future.length?future:slots;
        const state=selectionState(activeSlots,selected);
        const valid=slots.length>0,editable=view==="mine"&&!closed&&future.length>0;
        const today=day===localDay(now);
        const status=!valid?"기간 밖":state===true?(today&&!closed&&view==="mine"?"남은 시간 가능":"전체 가능"):state==="mixed"?"일부 가능":"선택 안 함";
        const people=view==="all"&&data?datePeople(slots,data.slotParticipantIndexes):null;
        const summary=view==="all"&&valid?(people?`전체 가능 ${people.full}명 · 일부 가능 ${people.partial}명`:unavailable):view!=="mine"&&!data&&valid?unavailable:status;
        const visualState=view==="all"?(people?.full?true:people?.partial?"mixed":false):state;
        const style=index===0?{gridColumn:new Date(`${day}T00:00:00Z`).getUTCDay()+1}:undefined;
        const content=<>
          <strong data-today={today}>{Number(day.slice(8))}</strong>
          <span className={styles.dateAccessible}>{summary}</span>
          <span className={styles.dateMark} aria-hidden="true">{view==="all"&&valid?(people?`${people.full}명`:"—"):valid?(state===true?"✓":state==="mixed"?"일부":""):""}</span>
        </>;
        return view==="mine"?<button key={day} type="button" style={style} className={styles.dateCard} aria-label={`${day} 하루 선택`} aria-pressed={state} title={summary} data-state={state} disabled={pending||!editable} onClick={()=>onToggle(day)}>{content}</button>
          :<div key={day} role="group" style={style} aria-label={`${day} 가능 요약`} title={summary} className={styles.dateCard} data-state={visualState} data-unavailable={!valid}>{content}</div>;
      })}
    </div>
    <p className={styles.dateKey}>{view==="all"?"숫자: 하루 전체 가능 인원 · 점선: 일부 시간 가능":"✓ 전체 가능 · 점선: 일부 가능"}</p>
  </div>;
}
