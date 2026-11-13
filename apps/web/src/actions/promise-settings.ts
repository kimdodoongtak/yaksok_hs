"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import type { PromiseSettingsField } from "@/lib/promise-settings/policy";
import { promiseSettingsService } from "@/lib/promise-settings/runtime";

export type PromiseSettingsFormState = {
  message: string | null;
  fieldErrors: Partial<Record<PromiseSettingsField, string>>;
  values: Record<PromiseSettingsField, string>;
};

function formValues(form: FormData): PromiseSettingsFormState["values"] {
  const value = (name: PromiseSettingsField) =>
    typeof form.get(name) === "string" ? String(form.get(name)) : "";
  return {
    participantLimit: value("participantLimit"),
    dateRangeStart: value("dateRangeStart"),
    dateRangeEnd: value("dateRangeEnd"),
    dailyStart: value("dailyStart"),
    dailyEnd: value("dailyEnd"),
    durationMinutes: value("durationMinutes"),
    votingDeadline: value("votingDeadline"),
  };
}

export async function startCollection(
  inviteToken: string,
  _previous: PromiseSettingsFormState,
  form: FormData,
): Promise<PromiseSettingsFormState> {
  void _previous;
  const values = formValues(form);
  if (!validInviteToken(inviteToken)) {
    return {
      message: "유효하지 않은 초대 링크입니다.",
      fieldErrors: {},
      values,
    };
  }

  const jar = await cookies();
  const cookie = sessionCookie(inviteToken, new Date(0));
  const sessionToken = jar.get(cookie.name)?.value;
  const result = await promiseSettingsService.startCollection({
    inviteToken,
    sessionToken,
    settings: {
      ...values,
    },
  });

  if (!result.ok) {
    if (result.code === "LINK_EXPIRED" || result.code === "DRAFT_EXPIRED")
      redirect(`/p/${inviteToken}`);
    if (result.code === "NOT_DRAFT") redirect(`/p/${inviteToken}/settings`);
    if (result.code === "INVALID_INPUT") {
      return {
        message: "입력한 내용을 확인해 주세요.",
        fieldErrors: result.fieldErrors ?? {},
        values,
      };
    }
    return {
      message:
        result.code === "UNAUTHORIZED"
          ? "방장 세션이 만료됐어요. 초대 링크에서 다시 시작해 주세요."
          : "모집을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      fieldErrors: {},
      values,
    };
  }

  if (!sessionToken) {
    return {
      message: "방장 세션을 확인할 수 없습니다.",
      fieldErrors: {},
      values,
    };
  }
  jar.set({
    ...sessionCookie(inviteToken, result.expiresAt),
    value: sessionToken,
  });
  redirect(`/p/${inviteToken}/settings?invitation=ready`);
}
