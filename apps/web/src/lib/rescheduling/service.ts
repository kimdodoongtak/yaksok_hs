import "server-only";
import type { PrismaClient } from "../../generated/prisma/client";
import type { SessionInput } from "../participant-access/service";
import type { PromiseSettingsInput, PromiseSettingsValidation } from "../promise-settings/policy";
import { requireParticipantSession } from "../participant-access/session";
import { validatePromiseSettings } from "../promise-settings/policy";
import { settingsOf } from "../availability/service";
import { rangeChange, type RangeChange } from "./policy";

export type ChangeInput = SessionInput & {
  mode: "reset" | "reopen";
  expectedParticipantId: string;
  settings: PromiseSettingsInput;
  confirmedImpact: RangeChange;
  confirmedClear: boolean;
};
export type ChangeResult = { ok: true } | {
  ok: false;
  code: string;
  impact?: RangeChange;
  clearsConfirmation?: boolean;
  fieldErrors?: Extract<PromiseSettingsValidation, { ok: false }>["fieldErrors"];
};

export function createReschedulingService(db: PrismaClient, clock?: () => Date) {
  return {
    async change(input: ChangeInput): Promise<ChangeResult> {
      try {
        return await db.$transaction(async tx => {
          // 공통 약속 잠금 뒤에 시각·세션·현재 역할을 확인한다.
          const access = await requireParticipantSession(tx, input, clock);
          if (!access.ok) return access;
          if (input.expectedParticipantId !== access.session.participantId) return { ok: false as const, code: "UNAUTHORIZED" };
          if (access.session.participant.role !== "host") return { ok: false as const, code: "FORBIDDEN" };
          let status = access.promise.status;
          if (status === "collecting" && access.promise.votingDeadlineAt && access.promise.votingDeadlineAt <= access.at) {
            await tx.promiseRecord.update({ where: { id: access.promise.id }, data: { status: "closed" } });
            status = "closed";
          }
          const canReset = input.mode === "reset" && status === "collecting";
          const canReopen = input.mode === "reopen" && (status === "closed" || status === "confirmed");
          if (!canReset && !canReopen) return { ok: false as const, code: "STATE_CHANGED" };

          const validation = validatePromiseSettings(input.settings, access.at);
          if (!validation.ok) return { ok: false as const, code: "INVALID_INPUT", fieldErrors: validation.fieldErrors };
          const value = validation.value;
          const activeWhere = { promiseId: access.promise.id, status: "active" as const };
          const count = await tx.participant.count({ where: activeWhere });
          if (value.participantLimit < count) return {
            ok: false as const, code: "INVALID_INPUT",
            fieldErrors: { participantLimit: "정원은 현재 참여 중인 인원보다 작게 설정할 수 없습니다." },
          };
          const before = settingsOf(access.promise);
          if (!before) return { ok: false as const, code: "STATE_CHANGED" };
          const change = rangeChange(before, value);
          // 잠금 안에서 안내한 영향과 대조해 재확인 전에는 응답을 변경하지 않는다.
          const clearsConfirmation = status === "confirmed";
          if (input.confirmedImpact !== change || input.confirmedClear !== clearsConfirmation) return { ok: false as const, code: "IMPACT_CHANGED", impact: change, clearsConfirmation };
          if (change !== "same") {
            // 탈퇴자 기록은 조회·변경 대상에서 제외한다. 과거 슬롯도 새 범위 밖이면 삭제한다.
            const members = await tx.participant.findMany({ where: activeWhere, include: { availableSlots: true } });
            for (const member of members) {
              const outside = member.availableSlots.filter(slot => {
                const local = new Date(slot.slotStartAt.getTime() + 9 * 3600000);
                const day = local.toISOString().slice(0, 10);
                const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
                return day < value.dateRangeStart || day > value.dateRangeEnd || minute < value.dailyStartMinute || minute + 30 > value.dailyEndMinute;
              }).map(slot => slot.id);
              if (outside.length) await tx.participantAvailableSlot.deleteMany({ where: { id: { in: outside } } });
              if (change === "expand" || outside.length) await tx.participant.update({
                where: { id: member.id },
                data: { availabilityVersion: { increment: 1 }, ...(change === "expand" ? { availabilitySubmittedAt: null } : {}) },
              });
            }
          }
          await tx.promiseRecord.update({
            where: { id: access.promise.id },
            data: { ...value, status: "collecting", confirmedStartAt: null, confirmedEndAt: null, dateRangeStart: new Date(value.dateRangeStart), dateRangeEnd: new Date(value.dateRangeEnd) },
          });
          // 세션 만료 시각은 설정 변경/재조율과 독립적으로 유지한다.
          return { ok: true as const };
        });
      } catch {
        return { ok: false, code: "UNAVAILABLE" };
      }
    },
  };
}
