"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OverviewSnapshot } from "@/lib/candidates/view";
import { slotAt, timeLabel } from "./calendar";
import { AnimalAvatar } from "@/components/ui/animal-avatar";
import { samePeople, type AvailabilityBlock } from "./heatmap-blocks";
import { heatLevel } from "./heatmap-scale";
import styles from "./availability.module.css";

type HeldSlot={part:number;anchor:DOMRect};
function SlotPeople({id,held,day,data}:{id:string;held:HeldSlot;day:string;data:OverviewSnapshot}){
  const popup=useRef<HTMLDivElement>(null);
  const slot=slotAt(day,held.part);
  const people=(data.slotParticipantIndexes[slot]??[]).map(index=>data.participants[index]).filter(Boolean);
  useLayoutEffect(()=>{
    const node=popup.current;if(!node)return;
    const width=node.offsetWidth,height=node.offsetHeight,anchor=held.anchor;
    const right=anchor.right+8,leftSide=anchor.left-width-8;
    const fitsRight=right+width<=window.innerWidth-8,fitsLeft=leftSide>=8;
    let left=right,top=anchor.top+anchor.height/2-height/2,side="right";
    if(!fitsRight&&fitsLeft){left=leftSide;side="left";}
    else if(!fitsRight){
      left=anchor.left+anchor.width/2-width/2;
      top=anchor.top-height-8;
      side="above";
      if(top<8){top=anchor.bottom+8;side="below";}
    }
    left=Math.max(8,Math.min(window.innerWidth-width-8,left));
    top=Math.max(8,Math.min(window.innerHeight-height-8,top));
    node.style.left=`${left}px`;node.style.top=`${top}px`;
    node.style.setProperty("--anchor-x",`${Math.max(14,Math.min(width-14,anchor.left+anchor.width/2-left))}px`);
    node.style.setProperty("--anchor-y",`${Math.max(14,Math.min(height-14,anchor.top+anchor.height/2-top))}px`);
    node.dataset.side=side;
    if(left<anchor.right&&left+width>anchor.left&&top<anchor.bottom&&top+height>anchor.top)node.dataset.side="overlap";
  },[held,data]);
  if(!people.length)return null;
  return createPortal(<div ref={popup} id={id} role="tooltip" aria-label="선택한 참여자" className={styles.slotPeople} data-layout={people.length<=4?"inline":people.length<=12?"two":"three"}>
    <ul>{people.map(person=><li key={person.id}><AnimalAvatar index={data.participants.findIndex(member=>member.id===person.id)} size={26}/><span>{person.nickname}</span></li>)}</ul>
  </div>,document.body);
}
export function HeatmapCell({blocks,day,minute,stepMinutes,endMinute,startMinute,valid,data,all}:{blocks:AvailabilityBlock[];day:string;minute:number;stepMinutes:number;endMinute:number;startMinute:number;valid:boolean;data?:OverviewSnapshot;all:boolean}){
  const [held,setHeld]=useState<HeldSlot|null>(null);
  const tooltipId=useId(),holding=held!==null;
  useEffect(()=>{
    if(!holding)return;
    const hide=()=>setHeld(null);
    window.addEventListener("pointerup",hide);window.addEventListener("pointercancel",hide);
    window.addEventListener("blur",hide);window.addEventListener("scroll",hide,true);
    document.addEventListener("visibilitychange",hide);
    return ()=>{window.removeEventListener("pointerup",hide);window.removeEventListener("pointercancel",hide);window.removeEventListener("blur",hide);window.removeEventListener("scroll",hide,true);document.removeEventListener("visibilitychange",hide);};
  },[holding]);
  const parts=Array.from({length:Math.min(stepMinutes,endMinute-minute)/30},(_,i)=>minute+i*30);
  const startingBlocks=all&&valid?blocks.filter(block=>block.count>=2&&block.startMinute>=minute&&block.startMinute<minute+stepMinutes):[];
  // Convert the whole continuous interval to displayed row coordinates.
  const position=(value:number)=>{
    const row=Math.floor((value-startMinute)/stepMinutes),rowMinute=startMinute+row*stepMinutes;
    const fraction=value===rowMinute?0:(value-rowMinute)/Math.min(stepMinutes,endMinute-rowMinute);
    return (row+fraction)*42;
  };
  return <div className={styles.readCell} style={{minHeight:36}}>
    {parts.map(part=>{
      const slot=slotAt(day,part),count=data?.heatmap[slot] ?? 0,total=data?.participants.length ?? 0;
      const available=data?.selected?.slots.includes(slot),interactive=all&&valid&&count>0;
      const people=data?.slotParticipantIndexes[slot];
      const connects=(adjacent:number)=>adjacent>=startMinute&&adjacent<endMinute&&(all?samePeople(people,data?.slotParticipantIndexes[slotAt(day,adjacent)]):Boolean(available&&data?.selected?.slots.includes(slotAt(day,adjacent))));
      const label=all?`${day} ${timeLabel(part)} 가능 ${count}명 / 전체 ${total}명`:`${day} ${timeLabel(part)} ${available?"가능":"선택 없음"}`;
      return <span key={part} role={interactive?"button":"img"} tabIndex={interactive?0:undefined} aria-label={data&&valid?label:undefined} aria-describedby={held?.part===part?tooltipId:undefined}
        data-heat={data?(all?heatLevel(count,total):available?2:0):0} data-outside={!valid} data-connected-before={connects(part-30)} data-connected-after={connects(part+30)}
        onPointerDown={event=>{
          if(!interactive||!event.isPrimary||event.button!==0)return;
          event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);
          setHeld({part,anchor:event.currentTarget.getBoundingClientRect()});
        }}
        onPointerMove={event=>{if(!held)return;const box=held.anchor;if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)setHeld(null);}}
        onPointerUp={()=>setHeld(null)} onPointerCancel={()=>setHeld(null)} onLostPointerCapture={()=>setHeld(null)} onBlur={()=>setHeld(null)}
        onContextMenu={event=>{if(interactive)event.preventDefault();}}
        onKeyDown={event=>{
          if(event.key==="Escape"){setHeld(null);return;}
          if(interactive&&(event.key==="Enter"||event.key===" ")){event.preventDefault();if(!event.repeat)setHeld({part,anchor:event.currentTarget.getBoundingClientRect()});}
        }}
        onKeyUp={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setHeld(null);}}}
      >{data&&valid&&!all&&available?"✓":""}</span>;
    })}
    {startingBlocks.map(block=>{
      const time={start:timeLabel(block.startMinute),end:timeLabel(block.endMinute)};
      const height=position(block.endMinute)-position(block.startMinute)-4;
      const compact=height<42;
      return <div key={block.startMinute} className={styles.heatCandidate} style={{top:position(block.startMinute)-position(minute)+2,height}} role="img" aria-label={`${day} ${time.start}–${time.end} ${block.count}명 · 가능 구간`}>
        <span className={styles.candidateCaption} data-compact={compact}><strong>{block.count}명</strong>{height>=28&&(time.start.endsWith(":00")&&time.end.endsWith(":00")?<span className={styles.wholeHours}>{time.start.slice(0,2)}–{time.end.slice(0,2)}</span>:<span>{time.start}<br/>~{time.end}</span>)}</span>
      </div>;
    })}
    {held&&all&&valid&&data&&<SlotPeople id={tooltipId} held={held} day={day} data={data}/>}
  </div>;
}
