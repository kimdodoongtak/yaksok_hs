const date=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"long",day:"numeric",weekday:"short"});
const time=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
export const resultDate=(startAt:string)=>date.format(new Date(startAt));
export function resultTime(startAt:string,endAt:string){
  const end=time.format(new Date(endAt));
  return `${time.format(new Date(startAt))} ~ ${end==="00:00"?"24:00":end}`;
}
