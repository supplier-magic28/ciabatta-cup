"use client";
import { useTransition } from "react";
import { decidePlannedMatch } from "@/lib/planned/actions";
import { Button } from "@/components/ui/Button";
export function PlannedActions({id,invited,status}:{id:string;invited:boolean;status:string}){const[pending,start]=useTransition();const run=(decision:"accept"|"decline"|"cancel")=>start(async()=>{await decidePlannedMatch(id,decision);});if(status==="proposed"&&invited)return <div className="grid grid-cols-2 gap-3"><Button loading={pending} onClick={()=>run("accept")}>Accept</Button><button onClick={()=>run("decline")} className="border-2 border-rust font-mono text-rust">Decline</button></div>;if(status==="locked_in")return <button onClick={()=>run("cancel")} className="font-mono text-xs uppercase text-rust underline">Cancel match</button>;return null;}
