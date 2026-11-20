import { expect, it } from "vitest";
import { toggleDate, datePeople } from "./date-selection";
const settings={dateRangeStart:"2026-11-21",dateRangeEnd:"2026-11-22",dailyStartMinute:540,dailyEndMinute:630};
const now="2026-11-20T00:00:00.000Z";
const first="2026-11-21T00:00:00.000Z", middle="2026-11-21T00:30:00.000Z", last="2026-11-21T01:00:00.000Z", other="2026-11-22T00:00:00.000Z";
it("일부 선택된 날짜는 설정 범위를 채우고 전체 선택은 그날만 해제한다",()=>{
  const original=new Set([first,other]);
  const filled=toggleDate(original,"2026-11-21",settings,now);
  expect([...filled].sort()).toEqual([first,middle,last,other]);
  expect([...original]).toEqual([first,other]);
  expect([...toggleDate(filled,"2026-11-21",settings,now)]).toEqual([other]);
});
it("오늘의 지난 선택과 현재 경계는 보존하며 남은 시간만 채우고 해제한다",()=>{
  const at=middle,original=new Set([first,other]);
  const filled=toggleDate(original,"2026-11-21",settings,at);
  expect([...filled].sort()).toEqual([first,last,other]);
  expect([...toggleDate(filled,"2026-11-21",settings,at)]).toEqual([first,other]);
  expect([...toggleDate(original,"2026-11-20",settings,now)]).toEqual([first,other]);
  expect([...toggleDate(original,"2026-11-23",settings,now)]).toEqual([first,other]);
});

it("하루 전체 인원은 슬롯별 최대 인원이 아닌 동일 참여자의 교집합이다",()=>{
  const slots=[first,middle,last];
  expect(datePeople(slots,{[first]:[0,2],[middle]:[1,2],[last]:[1,2]})).toEqual({full:1,partial:2});
  expect(datePeople(slots,{[first]:[0],[middle]:[1],[last]:[1]})).toEqual({full:0,partial:2});
  expect(datePeople([],{})).toEqual({full:0,partial:0});
});

it("24시간 날짜 선택은 자정을 넘기지 않고 48개 슬롯만 선택한다",()=>{
  const fullDay={...settings,dailyStartMinute:0,dailyEndMinute:1440};
  const selected=[...toggleDate(new Set(),"2026-11-21",fullDay,now)].sort();
  expect(selected).toHaveLength(48);
  expect(selected[0]).toBe("2026-11-20T15:00:00.000Z");
  expect(selected.at(-1)).toBe("2026-11-21T14:30:00.000Z");
});
