import { expect, test } from "vitest";
import { rangeChange } from "./policy";
const before={dateRangeStart:"2026-11-16",dateRangeEnd:"2026-11-18",dailyStartMinute:540,dailyEndMinute:1080};
test("날짜와 시간의 전체 슬롯 포함관계로 동일·축소·확대/이동을 구분한다",()=>{
 expect(rangeChange(before,{...before})).toBe("same");
 expect(rangeChange(before,{...before,dateRangeStart:"2026-11-17",dailyEndMinute:1050})).toBe("shrink");
 expect(rangeChange(before,{...before,dateRangeEnd:"2026-11-19"})).toBe("expand");
 expect(rangeChange(before,{...before,dateRangeStart:"2026-11-17",dailyStartMinute:510})).toBe("expand");
 expect(rangeChange(before,{...before,dateRangeStart:"2026-11-19",dateRangeEnd:"2026-11-20"})).toBe("expand");
 expect(rangeChange(before,{...before,dailyEndMinute:1440})).toBe("expand");
});
