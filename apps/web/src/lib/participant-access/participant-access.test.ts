import { expect, it } from "vitest";
import { clientAddress, isSameOrigin } from "./request-policy";
it("변경 요청은 동일 출처만 허용하고 Origin 누락·위조 전달 헤더를 거절한다", () => {
  expect(isSameOrigin(new Headers({ host: "localhost:3001", origin: "http://localhost:3001" }))).toBe(true);
  expect(isSameOrigin(new Headers({ host: "example.com", origin: "https://evil.example" }))).toBe(false);
  expect(isSameOrigin(new Headers({ host: "example.com" }))).toBe(false);
  expect(isSameOrigin(new Headers({ host: "example.com", origin: "https://evil.example", "x-forwarded-host": "evil.example" }))).toBe(false);
  expect(isSameOrigin(new Headers({ host: "example.com", origin: "https://example.com", "sec-fetch-site": "cross-site" }))).toBe(false);
  expect(isSameOrigin(new Headers({ host: "example.com", origin: "null" }))).toBe(false);
});
it("Vercel이 아닌 환경에서 전달 IP 헤더를 신뢰하지 않는다", () => {
  expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.1", "x-vercel-forwarded-for": "203.0.113.2" }), false)).toBe("unknown");
  expect(clientAddress(new Headers({ "x-vercel-forwarded-for": "203.0.113.2" }), true)).toBe("203.0.113.2");
  expect(clientAddress(new Headers({ "x-vercel-forwarded-for": "fake, 203.0.113.2" }), true)).toBe("unknown");
});
