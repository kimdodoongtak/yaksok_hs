import { cookies } from "next/headers";
import { sessionCookie, validInviteToken } from "@/lib/invitation/cookie";
import { confirmationService } from "@/lib/confirmation/runtime";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{inviteToken:string}>}){
  const {inviteToken}=await params;
  const jar=await cookies();
  const result=validInviteToken(inviteToken)?await confirmationService.read({inviteToken,sessionToken:jar.get(sessionCookie(inviteToken,new Date(0)).name)?.value}):{ok:false as const,code:"INVALID_LINK"};
  return Response.json(result,{status:result.ok?200:result.code==="PROMISE_CANCELLED"?409:result.code==="UNAVAILABLE"?503:result.code==="UNAUTHORIZED"?401:400,headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});
}
