import { expect, it } from "vitest";
import { addMonths, monthDays } from "./calendar";
it("월 이동은 연말을 넘고 윤년의 달력은 정확한 마지막 날짜에서 끝난다",()=>{
  expect(addMonths("2026-12",1)).toBe("2027-01");
  expect(addMonths("2027-01",-1)).toBe("2026-12");
  expect(monthDays("2028-02")).toHaveLength(29);
  expect(monthDays("2028-02").at(-1)).toBe("2028-02-29");
  expect(monthDays("2027-02")).toHaveLength(28);
  expect(monthDays("2026-12").at(-1)).toBe("2026-12-31");
});
