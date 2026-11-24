import "server-only";
import type { PrismaClient } from "../../generated/prisma/client";
import type { SessionInput } from "../participant-access/service";
import { requireParticipantSession } from "../participant-access/session";
import { settingsOf } from "../availability/service";
import { calculateCandidates } from "../candidates/policy";
import type { ConfirmationResult, ConfirmResult } from "./view";
export type ConfirmInput = SessionInput & { startAt: unknown; endAt?: unknown; expectedParticipantId?: unknown };
export function createConfirmationService(db: PrismaClient, clock?: () => Date) {
  return {
    async confirm(input: ConfirmInput): Promise<ConfirmResult> {
      try { return await db.$transaction(async tx=>{
        const access=await requireParticipantSession(tx,input,clock);
        if(!access.ok)return access;
        if(input.expectedParticipantId!==undefined&&input.expectedParticipantId!==access.session.participantId)return {ok:false as const,code:"UNAUTHORIZED"};
        if(access.session.participant.role!=="host")return {ok:false as const,code:"FORBIDDEN"};
        const settings=settingsOf(access.promise);
        if(!settings)return {ok:false as const,code:"NOT_AVAILABLE"};
        const start=typeof input.startAt==="string"?new Date(input.startAt).getTime():NaN;
        // 종료 생략은 이전 클라이언트의 최소 길이 확정 요청과 호환한다.
        const end=input.endAt===undefined?start+settings.durationMinutes*60000:typeof input.endAt==="string"?new Date(input.endAt).getTime():NaN;
        if(!Number.isFinite(start)||start%1800000||!Number.isFinite(end)||end%1800000||end-start<settings.durationMinutes*60000)return {ok:false as const,code:"INVALID_INPUT"};
        if(access.promise.status==="confirmed"){
          const savedStart=access.promise.confirmedStartAt?.getTime();
          const savedEnd=access.promise.confirmedEndAt?.getTime()??(savedStart===undefined?NaN:savedStart+settings.durationMinutes*60000);
          return savedStart===start&&savedEnd===end?{ok:true as const}:{ok:false as const,code:"ALREADY_CONFIRMED"};
        }
        if(access.promise.status==="collecting"&&access.promise.votingDeadlineAt!<=access.at){
          await tx.promiseRecord.update({where:{id:access.promise.id},data:{status:"closed"}});
        } else if(access.promise.status!=="closed")return {ok:false as const,code:"NOT_CLOSED"};
        const members=await tx.participant.findMany({where:{promiseId:access.promise.id,status:"active",availabilitySubmittedAt:{not:null}},select:{id:true,availableSlots:{select:{slotStartAt:true}}}});
        const calculated=calculateCandidates(members.map(member=>({id:member.id,active:true,submitted:true,slots:member.availableSlots.map(slot=>slot.slotStartAt.toISOString())})),settings,access.at);
        if(!calculated.candidateRanges.some(candidate=>start>=Date.parse(candidate.startAt)&&end<=Date.parse(candidate.endAt)))return {ok:false as const,code:"CANDIDATE_INVALID"};
        await tx.promiseRecord.update({where:{id:access.promise.id},data:{status:"confirmed",confirmedStartAt:new Date(start),confirmedEndAt:new Date(end)}});
        return {ok:true as const};
      }); } catch {return {ok:false,code:"UNAVAILABLE"};}
    },
    async read(input: SessionInput): Promise<ConfirmationResult> {
      try { return await db.$transaction(async tx=>{
        const access=await requireParticipantSession(tx,input,clock);
        if(!access.ok)return access;
        const {promise}=access;
        if(promise.status!=="confirmed"||!promise.confirmedStartAt||!promise.durationMinutes)return {ok:false as const,code:"NOT_CONFIRMED"};
        const start=promise.confirmedStartAt,end=promise.confirmedEndAt??new Date(start.getTime()+promise.durationMinutes*60000);
        const members=await tx.participant.findMany({where:{promiseId:promise.id,status:"active",availabilitySubmittedAt:{not:null}},orderBy:[{createdAt:"asc"},{id:"asc"}],select:{id:true,nickname:true,availableSlots:{where:{slotStartAt:{gte:start,lt:end}},select:{slotStartAt:true}}}});
        const attendees=members.filter(member=>{
          const slots=new Set(member.availableSlots.map(slot=>slot.slotStartAt.getTime()));
          for(let time=start.getTime();time<end.getTime();time+=1800000)if(!slots.has(time))return false;
          return true;
        }).map(({id,nickname})=>({id,nickname}));
        return {ok:true as const,snapshot:{participantId:access.session.participantId,role:access.session.participant.role,startAt:start.toISOString(),endAt:end.toISOString(),durationMinutes:(end.getTime()-start.getTime())/60000,attendees,serverNow:access.at.toISOString()}};
      }); } catch {return {ok:false,code:"UNAVAILABLE"};}
    },
  };
}
