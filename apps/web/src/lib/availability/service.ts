import "server-only";
import type { Prisma, PrismaClient, PromiseRecord } from "../../generated/prisma/client";
import type { SessionInput } from "../participant-access/service";
import { requireParticipantSession } from "../participant-access/session";
import { normalizeSlots } from "./policy";
import type { AvailabilitySnapshot, AvailabilityResult } from "./view";
function settingsOf(p: PromiseRecord): AvailabilitySnapshot["settings"] | null {
  if (!p.dateRangeStart || !p.dateRangeEnd || p.dailyStartMinute === null || p.dailyEndMinute === null || p.durationMinutes === null || !p.votingDeadlineAt || p.participantLimit === null) return null;
  return {dateRangeStart:p.dateRangeStart.toISOString().slice(0,10),dateRangeEnd:p.dateRangeEnd.toISOString().slice(0,10),dailyStartMinute:p.dailyStartMinute,dailyEndMinute:p.dailyEndMinute,durationMinutes:p.durationMinutes,votingDeadlineAt:p.votingDeadlineAt.toISOString(),participantLimit:p.participantLimit};
}
export function createAvailabilityService(db: PrismaClient, clock?: () => Date) {
  async function snapshot(tx: Prisma.TransactionClient, participantId: string, promise: PromiseRecord, at: Date): Promise<AvailabilitySnapshot> {
    const member = await tx.participant.findUniqueOrThrow({where:{id:participantId},include:{availableSlots:{orderBy:{slotStartAt:"asc"}}}});
    const settings=settingsOf(promise);
    if(!settings) throw new Error("설정 없음");
    return {participantId:member.id,nickname:member.nickname,role:member.role,version:member.availabilityVersion,submittedAt:member.availabilitySubmittedAt?.toISOString() ?? null,slots:member.availableSlots.map(s=>s.slotStartAt.toISOString()),settings,status:promise.status === "collecting" && promise.votingDeadlineAt! <= at ? "closed" : promise.status,serverNow:at.toISOString()};
  }
  return {
    async read(input: SessionInput): Promise<AvailabilityResult> {
      try { return await db.$transaction(async tx=>{
        const access=await requireParticipantSession(tx,input,clock);
        if(!access.ok) return access;
        if(access.promise.status === "draft" || !settingsOf(access.promise)) return {ok:false as const,code:"NOT_AVAILABLE"};
        return {ok:true as const,snapshot:await snapshot(tx,access.session.participantId,access.promise,access.at)};
      }); } catch { return {ok:false,code:"UNAVAILABLE"}; }
    },
    async submit(input: SessionInput & {baseVersion: unknown; slots: unknown; expectedParticipantId?: unknown}): Promise<AvailabilityResult> {
      try { return await db.$transaction(async tx=>{
        const access=await requireParticipantSession(tx,input,clock);
        if(!access.ok) return access;
        // 화면을 연 뒤 다른 탭에서 계정이 바뀐 경우의 전제조건이다. 저장 대상은 항상 세션으로 결정한다.
        if(input.expectedParticipantId !== undefined && input.expectedParticipantId !== access.session.participantId) return {ok:false as const,code:"UNAUTHORIZED"};
        if (access.promise.status === "collecting" && access.promise.votingDeadlineAt && access.promise.votingDeadlineAt <= access.at) {
          await tx.promiseRecord.update({where:{id:access.promise.id},data:{status:"closed"}});
          return {ok:false as const,code:"VOTING_CLOSED",snapshot:await snapshot(tx,access.session.participantId,{...access.promise,status:"closed"},access.at)};
        }
        if (access.promise.status !== "collecting" || !settingsOf(access.promise)) return {ok:false as const,code:"VOTING_CLOSED"};
        const current=await snapshot(tx,access.session.participantId,access.promise,access.at);
        const slots=normalizeSlots(input.slots,current.slots,current.settings,access.at);
        if(!slots || !Number.isSafeInteger(input.baseVersion) || Number(input.baseVersion)<0) return {ok:false as const,code:"INVALID_INPUT"};
        if (input.baseVersion !== current.version) {
          if (Number(input.baseVersion) < current.version && current.submittedAt !== null && JSON.stringify(slots) === JSON.stringify(current.slots)) return {ok:true as const,snapshot:current};
          return {ok:false as const,code:"AVAILABILITY_VERSION_CONFLICT",snapshot:current};
        }
        await tx.participantAvailableSlot.deleteMany({where:{participantId:current.participantId}});
        await tx.participantAvailableSlot.createMany({data:slots.map(slot=>({participantId:current.participantId,slotStartAt:new Date(slot)}))});
        await tx.participant.update({where:{id:current.participantId},data:{availabilityVersion:{increment:1},availabilitySubmittedAt:access.at}});
        return {ok:true as const,snapshot:await snapshot(tx,current.participantId,access.promise,access.at)};
      }); } catch { return {ok:false,code:"UNAVAILABLE"}; }
    }
  };
}
