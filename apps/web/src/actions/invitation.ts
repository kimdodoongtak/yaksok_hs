"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { invitationService } from "@/lib/invitation/runtime";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
export type FormState = { message: string | null };
export async function registerHost(
  inviteToken: string,
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  if (!validInviteToken(inviteToken))
    return { message: "유효하지 않은 초대 링크입니다." };
  const result = await invitationService.registerHost({
    inviteToken,
    nickname: form.get("nickname"),
    pin: form.get("pin"),
  });
  if (!result.ok) {
    if (result.code === "LINK_EXPIRED") redirect(`/p/${inviteToken}`);
    const messages: Record<string, string> = {
      INVALID_INPUT:
        "닉네임은 이모지 없이 2~12자, PIN은 숫자 4자리로 입력해 주세요.",
      ALREADY_CLAIMED:
        "다른 사람이 먼저 방장으로 등록했어요. 새로고침해 현재 상태를 확인해 주세요.",
    };
    return {
      message:
        messages[result.code] ??
        "등록할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  const jar = await cookies();
  jar.set({
    ...sessionCookie(inviteToken, result.expiresAt),
    value: result.sessionToken,
  });
  redirect(`/p/${inviteToken}/settings`);
}

export async function abandonDraft(
  inviteToken: string,
  _previous: FormState,
): Promise<FormState> {
  void _previous;
  if (!validInviteToken(inviteToken))
    return { message: "유효하지 않은 초대 링크입니다." };
  const jar = await cookies();
  const cookie = sessionCookie(inviteToken, new Date(0));
  const result = await invitationService.abandonDraft(
    inviteToken,
    jar.get(cookie.name)?.value,
  );
  if (!result.ok && result.code === "LINK_EXPIRED")
    redirect(`/p/${inviteToken}`);
  if (!result.ok && result.code !== "DRAFT_EXPIRED")
    return {
      message:
        "초안에서 나갈 수 없습니다. 새로고침해 현재 상태를 확인해 주세요.",
    };
  jar.set({ ...cookie, value: "", maxAge: 0 });
  redirect(`/p/${inviteToken}`);
}
