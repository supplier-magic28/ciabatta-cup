"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decidePlannedMatch } from "@/lib/planned/actions";
import { Button } from "@/components/ui/Button";

export function PlannedActions({id,invited,status}:{id:string;invited:boolean;status:string}){
  const[pending,start]=useTransition();const[error,setError]=useState("");const router=useRouter();
  const run=(decision:"accept"|"decline"|"cancel")=>{setError("");start(async()=>{const result=await decidePlannedMatch(id,decision);if(!result.ok)setError(result.error);else router.refresh();});};
  const message=error&&<p className="mt-2 font-mono text-[10px] text-rust" aria-live="polite">{error}</p>;
  if(status==="proposed"&&invited)return <><div className="grid grid-cols-2 gap-3"><Button loading={pending} loadingLabel="Saving..." onClick={()=>run("accept")}>Accept</Button><button disabled={pending} onClick={()=>run("decline")} className="border-2 border-rust font-mono text-rust disabled:opacity-60">{pending?"Saving...":"Decline"}</button></div>{message}</>;
  if(status==="locked_in")return <><button disabled={pending} onClick={()=>run("cancel")} className="min-h-11 font-mono text-xs uppercase text-rust underline disabled:opacity-60">{pending?"Cancelling...":"Cancel match"}</button>{message}</>;
  return null;
}
