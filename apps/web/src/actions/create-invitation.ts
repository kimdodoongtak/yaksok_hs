"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { invitationService } from "@/lib/invitation/runtime";
import { clientAddress, isSameOrigin } from "@/lib/participant-access/request-policy";
import { participantAccessService } from "@/lib/participant-access/runtime";

export type CreateInvitationState = { message: string | null };

export async function createInvitation(
  previous: CreateInvitationState,
): Promise<CreateInvitationState> {
  void previous;
  const requestHeaders = await headers();
  if (!isSameOrigin(requestHeaders))
    return { message: "요청 출처를 확인할 수 없어요. 페이지를 새로고침해 주세요." };
  // 생성 요청은 로그인·PIN 요청의 예산을 사용하지 않는다.
  const budget = await participantAccessService.consumeRequest(
    `invite-create:${clientAddress(requestHeaders, process.env.VERCEL === "1")}`,
  );
  if (!budget.ok)
    return { message: budget.code === "RATE_LIMITED"
      ? "요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요."
      : "약속을 만들지 못했어요. 잠시 후 다시 시도해 주세요." };
  let inviteToken: string;
  try {
    ({ inviteToken } = await invitationService.issueInviteLink());
  } catch {
    return { message: "약속을 만들지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  redirect(`/p/${inviteToken}`);
}
