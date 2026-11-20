import type { SlotSettings } from "@/lib/availability/policy";
import { slotAt } from "./calendar";

export function dateSlots(day:string,settings:SlotSettings):string[] {
  if(day<settings.dateRangeStart||day>settings.dateRangeEnd)return [];
  return Array.from({length:(settings.dailyEndMinute-settings.dailyStartMinute)/30},(_,i)=>slotAt(day,settings.dailyStartMinute+i*30));
}
export function selectionState(slots:readonly string[],selected:ReadonlySet<string>):boolean|"mixed" {
  const count=slots.filter(slot=>selected.has(slot)).length;
  return count===0?false:count===slots.length?true:"mixed";
}
export function toggleDate(selected:ReadonlySet<string>,day:string,settings:SlotSettings,now:string):Set<string> {
  const slots=dateSlots(day,settings).filter(slot=>slot>now),remove=selectionState(slots,selected)===true;
  const next=new Set(selected);
  for(const slot of slots){if(remove)next.delete(slot);else next.add(slot);}
  return next;
}
export function datePeople(slots:readonly string[],indexes:Record<string,number[]>):{full:number;partial:number} {
  const counts=new Map<number,number>();
  for(const slot of slots)for(const index of new Set(indexes[slot]??[]))counts.set(index,(counts.get(index)??0)+1);
  const full=[...counts.values()].filter(count=>count===slots.length).length;
  return {full,partial:counts.size-full};
}
