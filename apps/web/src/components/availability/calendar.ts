export function addDays(day:string, amount:number){
  return new Date(new Date(`${day}T00:00:00Z`).getTime()+amount*86400000).toISOString().slice(0,10);
}
export function weekStart(day:string){return addDays(day,-new Date(`${day}T00:00:00Z`).getUTCDay());}
export function timeLabel(minute:number){return `${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`;}
export function slotAt(day:string,minute:number){return new Date(`${day}T${timeLabel(minute)}:00+09:00`).toISOString();}
export function localDay(iso:string){return new Date(new Date(iso).getTime()+9*3600000).toISOString().slice(0,10);}
export function durationLabel(minutes:number){return [minutes>=60?`${Math.floor(minutes/60)}시간`:"",minutes%60?`${minutes%60}분`:""].filter(Boolean).join(" ") || "0분";}
export function addMonths(month:string,amount:number){
  const date=new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth()+amount);
  return date.toISOString().slice(0,7);
}
export function monthDays(month:string){
  const count=new Date(`${addMonths(month,1)}-01T00:00:00Z`).getTime()-new Date(`${month}-01T00:00:00Z`).getTime();
  return Array.from({length:count/86400000},(_,index)=>`${month}-${String(index+1).padStart(2,"0")}`);
}
