"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OverviewResult, OverviewSnapshot } from "@/lib/candidates/view";

export function useOverview(inviteToken:string, participantId:string, week:string, selectedId:string|undefined, limit:number, revision:string, month?:string) {
  const router=useRouter();
  const [refreshId,setRefreshId]=useState(0);
  const refresh=useCallback(()=>setRefreshId(value=>value+1),[]);
  const query=new URLSearchParams({week,limit:String(limit)});
  if(month)query.set("month",month);
  if(selectedId)query.set("participantId",selectedId);
  const url=`/p/${inviteToken}/overview?${query}`;
  const key=`${url}:${participantId}:${revision}:${refreshId}`;
  const [state,setState]=useState<{key:string;data?:OverviewSnapshot;error?:boolean}>({key:""});
  useEffect(()=>{
    let disposed=false,reading=false;
    const controller=new AbortController();
    async function read(){
      if(reading || document.visibilityState==="hidden")return;
      reading=true;
      try {
        const response=await fetch(url,{cache:"no-store",signal:controller.signal});
        const result:OverviewResult=await response.json();
        if(disposed)return;
        if(result.ok){
          if(result.snapshot.participantId!==participantId){router.replace(`/p/${inviteToken}`);return;}
          setState({key,data:result.snapshot});
        } else if(["UNAUTHORIZED","INVALID_LINK","LINK_EXPIRED","PROMISE_CANCELLED","DRAFT_EXPIRED","NOT_AVAILABLE"].includes(result.code))router.replace(`/p/${inviteToken}`);
        else setState(previous=>({key,data:previous.key===key?previous.data:undefined,error:true}));
      } catch {if(!disposed)setState(previous=>({key,data:previous.key===key?previous.data:undefined,error:true}));}
      finally {reading=false;}
    }
    void read();const timer=window.setInterval(read,5000);
    window.addEventListener("focus",read);document.addEventListener("visibilitychange",read);
    return ()=>{disposed=true;controller.abort();window.clearInterval(timer);window.removeEventListener("focus",read);document.removeEventListener("visibilitychange",read);};
  },[url,key,participantId,inviteToken,router]);
  return {data:state.key===key?state.data:undefined,participants:state.data?.participants,error:state.key===key && state.error,loading:state.key!==key || (!state.data&&!state.error),refresh};
}
