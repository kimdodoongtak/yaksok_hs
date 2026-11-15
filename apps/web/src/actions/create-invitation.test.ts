import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  issue: vi.fn(),
  consume: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/invitation/runtime", () => ({ invitationService: { issueInviteLink: mocks.issue } }));
vi.mock("@/lib/participant-access/runtime", () => ({ participantAccessService: { consumeRequest: mocks.consume } }));
import { createInvitation } from "./create-invitation";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL", "1");
  mocks.headers.mockResolvedValue(new Headers({ origin: "https://example.com", host: "example.com", "x-vercel-forwarded-for": "192.0.2.10" }));
  mocks.consume.mockResolvedValue({ ok: true });
  mocks.issue.mockResolvedValue({ inviteToken: "a".repeat(43) });
});
afterEach(() => vi.unstubAllEnvs());

it("발급 저장 오류를 노출하지 않고 재시도를 허용한다", async () => {
  mocks.issue.mockRejectedValueOnce(new Error("private database details"));
  expect(await createInvitation({ message: null })).toEqual({ message: "약속을 만들지 못했어요. 잠시 후 다시 시도해 주세요." });
  expect(mocks.redirect).not.toHaveBeenCalled();
  await expect(createInvitation({ message: "이전 실패" })).rejects.toThrow("REDIRECT:");
});

it.each([
  ["RATE_LIMITED", "요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요."],
  ["UNAVAILABLE", "약속을 만들지 못했어요. 잠시 후 다시 시도해 주세요."],
])("생성 예산 확인이 실패하면 발급하지 않는다 (%s)", async (code, message) => {
  mocks.consume.mockResolvedValue({ ok: false, code });
  expect(await createInvitation({ message: null })).toEqual({ message });
  expect(mocks.consume).toHaveBeenCalledWith("invite-create:192.0.2.10");
  expect(mocks.issue).not.toHaveBeenCalled();
});

it("생성 전용 예산을 사용하고 성공 이동을 오류로 삼키지 않는다", async () => {
  await expect(createInvitation({ message: null })).rejects.toThrow(`REDIRECT:/p/${"a".repeat(43)}`);
  expect(mocks.consume).toHaveBeenCalledWith("invite-create:192.0.2.10");
  expect(mocks.issue).toHaveBeenCalledTimes(1);
});

it("Vercel 외 환경에서는 전달 IP를 신뢰하지 않는다", async () => {
  vi.stubEnv("VERCEL", "");
  await expect(createInvitation({ message: null })).rejects.toThrow("REDIRECT:");
  expect(mocks.consume).toHaveBeenCalledWith("invite-create:unknown");
});

it.each([
  new Headers({ host: "example.com" }),
  new Headers({ origin: "https://evil.example", host: "example.com" }),
  new Headers({ origin: "https://example.com", host: "example.com", "sec-fetch-site": "cross-site" }),
])("출처가 확인되지 않은 요청은 발급하지 않는다 (%#)", async headers => {
  mocks.headers.mockResolvedValue(headers);
  expect(await createInvitation({ message: null })).toEqual({ message: "요청 출처를 확인할 수 없어요. 페이지를 새로고침해 주세요." });
  expect(mocks.issue).not.toHaveBeenCalled();
  expect(mocks.consume).not.toHaveBeenCalled();
});
