import { expect, test } from "vitest";
import { calculateCandidates, type CandidateMember } from "./policy";
const slot=(day:string,time:string)=>new Date(`${day}T${time}:00+09:00`).toISOString();
const settings={dateRangeStart:"2026-11-15",dateRangeEnd:"2026-11-15",dailyStartMinute:540,dailyEndMinute:720,durationMinutes:60};
const person=(id:string,times:string[],options:Partial<CandidateMember>={}):CandidateMember=>({id,active:true,submitted:true,slots:times.map(t=>slot("2026-11-15",t)),...options});
test("후보는 시간 전체의 동일 참여자 교집합이며 슬롯 인원과 다르고 방장 참석을 요구하지 않는다",()=>{
  const result=calculateCandidates([
    person("host",[]),person("a",["10:00"]),person("b",["10:00","10:30"]),person("c",["10:30"]),
    person("d",["11:00","11:30"]),person("e",["11:00","11:30"]),
  ],settings,new Date("2026-11-14T00:00:00Z"));
  expect(result.candidates).toEqual([{startAt:slot("2026-11-15","11:00"),endAt:slot("2026-11-15","12:00"),count:2}]);
  expect(result.heatmap[slot("2026-11-15","10:00")]).toBe(2);
  expect(result.heatmap[slot("2026-11-15","10:30")]).toBe(2);
});

test("active 제출 완료만 집계하고 인원 내림차순·시작 오름차순으로 전체 기간을 정렬한다",()=>{
  const later=[slot("2026-11-23","09:00"),slot("2026-11-23","09:30")];
  const result=calculateCandidates([
    person("a",["09:00","09:30","10:00"],{slots:[slot("2026-11-15","09:00"),slot("2026-11-15","09:30"),slot("2026-11-15","10:00"),...later]}),
    person("b",[],{slots:[slot("2026-11-15","09:00"),slot("2026-11-15","09:30"),slot("2026-11-15","10:00"),...later]}),
    person("c",[],{slots:later}),person("waiting",["09:00","09:30"],{submitted:false}),
    person("left",["09:00","09:30"],{active:false}),person("empty",[]),
  ],{...settings,dateRangeEnd:"2026-11-23"},new Date("2026-11-14T00:00:00Z"));
  expect(result.candidates).toEqual([
    {startAt:later[0],endAt:slot("2026-11-23","10:00"),count:3},
    {startAt:slot("2026-11-15","09:00"),endAt:slot("2026-11-15","10:00"),count:2},
    {startAt:slot("2026-11-15","09:30"),endAt:slot("2026-11-15","10:30"),count:2},
  ]);
  expect(result.heatmap[slot("2026-11-15","09:00")]).toBe(2);
});

test("KST 24시 끝을 허용하고 날짜·일일 범위 밖 집계와 과거 후보를 제외한다",()=>{
  const dates=[slot("2026-11-14","23:30"),slot("2026-11-15","22:30"),slot("2026-11-15","23:00"),slot("2026-11-15","23:30"),slot("2026-11-16","00:00")];
  const members=[person("a",[],{slots:dates}),person("b",[],{slots:dates})];
  const configured={...settings,dailyStartMinute:1380,dailyEndMinute:1440};
  const result=calculateCandidates(members,configured,new Date(slot("2026-11-15","22:30")));
  expect(result.candidates).toEqual([{startAt:slot("2026-11-15","23:00"),endAt:slot("2026-11-16","00:00"),count:2}]);
  expect(Object.keys(result.heatmap).sort()).toEqual([slot("2026-11-15","23:00"),slot("2026-11-15","23:30")]);
  expect(calculateCandidates(members,configured,new Date(slot("2026-11-15","23:00"))).candidates).toEqual([]);
  expect(calculateCandidates(members,{...configured,durationMinutes:90},new Date("2026-11-14T00:00:00Z")).candidates).toEqual([]);
});
