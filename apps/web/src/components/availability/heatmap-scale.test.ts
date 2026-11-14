import { expect,test } from "vitest";
import { heatLegend,heatLevel } from "./heatmap-scale";
test("범례는 실제 색 단계의 인원 범위를 빠짐없이 표시하고 빈 단계는 생략한다",()=>{
  expect(heatLegend(5)).toEqual([{level:1,label:"1명"},{level:2,label:"2명"},{level:3,label:"3명"},{level:4,label:"4~5명"}]);
  expect(heatLegend(2)).toEqual([{level:2,label:"1명"},{level:4,label:"2명"}]);
  expect(heatLegend(30)).toEqual([{level:1,label:"1~7명"},{level:2,label:"8~15명"},{level:3,label:"16~22명"},{level:4,label:"23~30명"}]);
  expect(heatLegend(0)).toEqual([]);
  expect([0,1,7,8,15,16,22,23,30].map(count=>heatLevel(count,30))).toEqual([0,1,1,2,2,3,3,4,4]);
});
