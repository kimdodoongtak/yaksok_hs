import { cookies } from "next/headers";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { availabilityService } from "@/lib/availability/runtime";
import { submitAvailability } from "@/actions/availability";
import type { AvailabilityResult } from "@/lib/availability/view";
export const runtime="nodejs";
const responseHeaders={"Cache-Control":"private, no-store",Vary:"Cookie"};
function respond(result:AvailabilityResult){
  const status=result.ok?200:result.code==="AVAILABILITY_VERSION_CONFLICT"?409:result.code==="UNAVAILABLE"?503:result.code==="UNAUTHORIZED"?401:result.code==="FORBIDDEN"?403:400;
  return Response.json(result,{status,headers:responseHeaders});
}
type Context={params:Promise<{inviteToken:string}>};
export async function GET(_request:Request,{params}:Context){
  const {inviteToken}=await params;
  if(!validInviteToken(inviteToken))return respond({ok:false,code:"INVALID_LINK"});
  const jar=await cookies();
  return respond(await availabilityService.read({inviteToken,sessionToken:jar.get(sessionCookie(inviteToken,new Date(0)).name)?.value}));
}
// HTTP 경계의 충돌 응답은 409. 앱 폼은 같은 Server Action을 사용한다.
export async function POST(request:Request,{params}:Context){
  const {inviteToken}=await params;
  try {
    const body:unknown=await request.json();
    if(!body || typeof body!=="object" || !("baseVersion" in body) || !("slots" in body)) return respond({ok:false,code:"INVALID_INPUT"});
    return respond(await submitAvailability(inviteToken,body.baseVersion,body.slots,"expectedParticipantId" in body ? body.expectedParticipantId : undefined));
  } catch {return respond({ok:false,code:"INVALID_INPUT"});}
}
