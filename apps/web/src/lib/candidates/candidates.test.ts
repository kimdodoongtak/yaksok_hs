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

test("같은 참석자의 연속 시작 후보를 하나로 묶고 실제 확정 시작점은 보존한다",()=>{
  const times=["09:00","09:30","10:00","10:30","11:00","11:30"];
  const result=calculateCandidates([person("a",times),person("b",times)],settings,new Date("2026-11-14T00:00:00Z"));
  expect(result.candidates).toHaveLength(5);
  expect(result.candidateRanges).toEqual([{startAt:slot("2026-11-15","09:00"),endAt:slot("2026-11-15","12:00"),count:2,participantIds:["a","b"]}]);
});

test("같은 인원수라도 명단·빈 시작점·날짜가 달라지면 후보 구간을 나눈다",()=>{
  const next=slot("2026-11-16","09:00");
  const result=calculateCandidates([
    person("c",["09:30","10:00"]),
    person("a",[],{slots:["09:00","09:30","10:00","11:00"].map(t=>slot("2026-11-15",t)).concat(next)}),
    person("b",[],{slots:["09:00","11:00"].map(t=>slot("2026-11-15",t)).concat(next)}),
  ],{...settings,dateRangeEnd:"2026-11-16",durationMinutes:30},new Date("2026-11-14T00:00:00Z"));
  expect(result.candidateRanges).toEqual([
    {startAt:slot("2026-11-15","09:00"),endAt:slot("2026-11-15","09:30"),count:2,participantIds:["a","b"]},
    {startAt:slot("2026-11-15","09:30"),endAt:slot("2026-11-15","10:30"),count:2,participantIds:["a","c"]},
    {startAt:slot("2026-11-15","11:00"),endAt:slot("2026-11-15","11:30"),count:2,participantIds:["a","b"]},
    {startAt:next,endAt:slot("2026-11-16","09:30"),count:2,participantIds:["a","b"]},
  ]);
});

test("겹치는 후보도 구간 전체 참석자를 유지하고 가능한 인원이 많은 순서로 보여 준다",()=>{
  const times=["09:00","09:30","10:00","10:30"];
  const result=calculateCandidates([person("a",times),person("b",times),person("c",["10:00","10:30"])],settings,new Date("2026-11-14T00:00:00Z"));
  expect(result.candidateRanges).toEqual([
    {startAt:slot("2026-11-15","10:00"),endAt:slot("2026-11-15","11:00"),count:3,participantIds:["a","b","c"]},
    {startAt:slot("2026-11-15","09:00"),endAt:slot("2026-11-15","10:30"),count:2,participantIds:["a","b"]},
  ]);
});

test("자정을 넘겨 구간을 합치지 않고 이미 지난 시작점도 포함하지 않는다",()=>{
  const slots=[slot("2026-11-15","23:30"),slot("2026-11-16","00:00"),slot("2026-11-16","00:30")];
  const members=[person("a",[],{slots}),person("b",[],{slots})];
  const configured={...settings,dateRangeEnd:"2026-11-16",dailyStartMinute:0,dailyEndMinute:1440,durationMinutes:30};
  const ranges=calculateCandidates(members,configured,new Date("2026-11-14T00:00:00Z")).candidateRanges;
  expect(ranges.map(({startAt,endAt})=>[startAt,endAt])).toEqual([[slots[0],slots[1]],[slots[1],slot("2026-11-16","01:00")]]);
  expect(calculateCandidates(members,configured,new Date(slots[1])).candidateRanges.map(range=>range.startAt)).toEqual([slots[2]]);
});
