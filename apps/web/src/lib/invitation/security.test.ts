import { expect, it } from "vitest";
import { hashPin, verifyPin } from "./security";
it("PIN을 매번 다른 salt로 저장하고 올바른 PIN만 검증한다", async () => {
  const first = await hashPin("0012");
  const second = await hashPin("0012");
  expect(first).not.toBe("0012");
  expect(first).not.toBe(second);
  expect(await verifyPin("0012", first)).toBe(true);
  expect(await verifyPin("0013", first)).toBe(false);
  expect(await verifyPin("0012", "invalid")).toBe(false);
});
