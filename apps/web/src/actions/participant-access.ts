"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { participantAccessService as service } from "@/lib/participant-access/runtime";
import { clientAddress, isSameOrigin } from "@/lib/participant-access/request-policy";
import type { AccessFailure } from "@/lib/participant-access/service";
export type AccessFormState = { message: string | null; retryAt?: string; revision: number };
type Mode = "join" | "login" | "change" | "logout";
function failure(result: AccessFailure, previous: AccessFormState): AccessFormState {
  const messages: Record<string, string> = {
    INVALID_INPUT: "닉네임은 이모지 없이 2~12자, PIN은 숫자 4자리로 입력해 주세요.",
    SAME_PIN: "현재 PIN과 다른 PIN을 입력해 주세요.",
    INVALID_CREDENTIALS: "닉네임과 PIN을 확인해 주세요.",
    PIN_LOCKED: "PIN을 5회 잘못 입력했어요. 10분 후 다시 시도해 주세요.",
    RATE_LIMITED: "요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.",
    CAPACITY_FULL: "정원이 가득 찼어요. 이미 참여했다면 다시 로그인해 주세요.",
    REGISTRATION_CLOSED: "참여 모집이 마감됐어요. 기존 참여자는 다시 로그인할 수 있어요.",
    NOT_COLLECTING: "아직 약속을 준비하고 있어요. 설정이 끝나면 참여할 수 있어요.",
    NICKNAME_TAKEN: "사용할 수 없는 닉네임이에요. 다른 이름을 입력하거나 다시 로그인해 주세요.",
    UNAUTHORIZED: "로그인이 만료됐어요. 다시 로그인해 주세요.",
    FORBIDDEN: "요청 출처를 확인할 수 없어요. 약속 페이지를 다시 열어 주세요.",
  };
  return { message: messages[result.code] ?? "처리하지 못했어요. 잠시 후 다시 시도해 주세요.", retryAt: result.retryAt?.toISOString(), revision: previous.revision + 1 };
}
async function perform(mode: Mode, inviteToken: string, previous: AccessFormState, form: FormData): Promise<AccessFormState> {
  const requestHeaders = await headers();
  if (!validInviteToken(inviteToken) || !isSameOrigin(requestHeaders)) return failure({ ok: false, code: "FORBIDDEN" }, previous);
  const jar = await cookies();
  const cookie = sessionCookie(inviteToken, new Date(0));
  const sessionToken = jar.get(cookie.name)?.value;
  const input = { inviteToken, sessionToken };
  // 취소·링크 만료를 인증 실패 및 제한 안내보다 먼저 보여 준다.
  const access = await service.read(input);
  const terminal = (code: string) => ["LINK_EXPIRED", "PROMISE_CANCELLED", "DRAFT_EXPIRED", "INVALID_LINK"].includes(code);
  if (!access.ok && terminal(access.code)) redirect(`/p/${inviteToken}`);
  if (!access.ok && access.code === "UNAVAILABLE") return failure(access, previous);
  if (mode !== "logout") {
    const budget = await service.consumeRequest(clientAddress(requestHeaders, process.env.VERCEL === "1"));
    if (!budget.ok) return failure(budget, previous);
  }
  if (mode === "join" || mode === "login") {
    const credentials = { inviteToken, nickname: form.get("nickname"), pin: form.get("pin") };
    const result = mode === "join" ? await service.join(credentials) : await service.authenticate(credentials);
    if (!result.ok) {
      if (terminal(result.code)) redirect(`/p/${inviteToken}`);
      return failure(result, previous);
    }
    jar.set({ ...sessionCookie(inviteToken, result.expiresAt), value: result.sessionToken });
    redirect(`/p/${inviteToken}`);
  }
  const result = mode === "change"
    ? await service.changePin({ ...input, currentPin: form.get("currentPin"), newPin: form.get("newPin") })
    : await service.logout(input);
  if (!result.ok && !(mode === "logout" && result.code === "UNAUTHORIZED")) {
    if (terminal(result.code)) redirect(`/p/${inviteToken}`);
    return failure(result, previous);
  }
  jar.set({ ...cookie, value: "", maxAge: 0 });
  redirect(`/p/${inviteToken}${mode === "change" ? "?notice=pin-changed" : ""}`);
}
export async function joinPromise(token: string, previous: AccessFormState, form: FormData) { return perform("join", token, previous, form); }
export async function loginParticipant(token: string, previous: AccessFormState, form: FormData) { return perform("login", token, previous, form); }
export async function changeParticipantPin(token: string, previous: AccessFormState, form: FormData) { return perform("change", token, previous, form); }
export async function logoutParticipant(token: string, previous: AccessFormState, form: FormData) { return perform("logout", token, previous, form); }
