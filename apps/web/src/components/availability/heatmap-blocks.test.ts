import { describe, expect, it } from "vitest";
import { samePeople, availabilityBlocks } from "./heatmap-blocks";
describe("연속 시간의 참여자 구획", () => {
  it("순서가 달라도 같은 사람이면 연결한다", () => {
    expect(samePeople([0, 2], [2, 0])).toBe(true);
  });
  it("인원수만 같거나 한 명이라도 바뀌면 연결하지 않는다", () => {
    expect(samePeople([0, 2], [0, 1])).toBe(false);
    expect(samePeople([0, 2], [0, 1, 2])).toBe(false);
  });
  it("빈 칸과 조회되지 않은 칸은 블록을 만들지 않는다", () => {
    expect(samePeople([], [])).toBe(false);
    expect(samePeople(undefined, [0])).toBe(false);
  });
});

describe("연속 가능 구간",()=>{
  const slot=(time:string)=>new Date(`2026-11-20T${time}:00+09:00`).toISOString();
  it("소요시간과 무관하게 같은 사람의 3시간을 하나로 묶는다",()=>{
    const people=Object.fromEntries(["13:00","13:30","14:00","14:30","15:00","15:30"].map((time,i)=>[slot(time),i%2?[1,0]:[0,1]]));
    expect(availabilityBlocks(people,"2026-11-20",540,1440)).toEqual([{startMinute:780,endMinute:960,count:2}]);
  });
  it("같은 인원수여도 사람이 바뀌거나 빈 시간이 있으면 나눈다",()=>{
    const people={[slot("13:00")]:[0,1],[slot("13:30")]:[0,2],[slot("14:30")]:[0,2]};
    expect(availabilityBlocks(people,"2026-11-20",540,1440)).toEqual([{startMinute:780,endMinute:810,count:2},{startMinute:810,endMinute:840,count:2},{startMinute:870,endMinute:900,count:2}]);
  });
  it("날짜와 하루 범위를 넘겨 합치지 않고 자정 끝을 보존한다",()=>{
    const people={[slot("23:00")]:[0,1],[slot("23:30")]:[0,1],"2026-11-20T15:00:00.000Z":[0,1]};
    expect(availabilityBlocks(people,"2026-11-20",1410,1440)).toEqual([{startMinute:1410,endMinute:1440,count:2}]);
  });
});
