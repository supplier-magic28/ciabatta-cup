"use client";

import {useEffect,useRef,useState} from "react";
import type {TournamentFrameShape} from "@/lib/tournament/types";

const shapes: Array<{value:TournamentFrameShape;label:string;aspect:string}>=[
  {value:"wide",label:"Wide",aspect:"aspect-[16/7]"},
  {value:"square",label:"Square",aspect:"aspect-square"},
  {value:"three_two",label:"3:2",aspect:"aspect-[3/2]"},
];

export function TournamentCoverComposer(){
  const [url,setUrl]=useState<string|null>(null);const [shape,setShape]=useState<TournamentFrameShape>("wide");
  const [zoom,setZoom]=useState(1);const [offset,setOffset]=useState({x:0,y:0});const drag=useRef<{x:number;y:number;ox:number;oy:number}|null>(null);
  useEffect(()=>()=>{if(url)URL.revokeObjectURL(url)},[url]);
  const aspect=shapes.find((item)=>item.value===shape)!.aspect;
  return <section className="order-first border-2 border-ink bg-row p-4 shadow-[4px_4px_0_var(--color-green)]">
    <div className="mb-3 flex items-end justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[2px] text-crust">Cup portrait</p><h2 className="font-heading text-xl font-bold">Set the scene</h2></div><span className="font-mono text-[9px] uppercase text-muted">Optional now · required to lock</span></div>
    <div className={`relative mx-auto w-full max-w-xl overflow-hidden border-2 ${url?"cursor-grab border-ink":"border-dashed border-muted"} ${aspect}`}
      onPointerDown={(event)=>{if(!url)return;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);drag.current={x:event.clientX,y:event.clientY,ox:offset.x,oy:offset.y}}}
      onPointerMove={(event)=>{if(!drag.current)return;setOffset({x:Math.max(-100,Math.min(100,drag.current.ox+(event.clientX-drag.current.x)/2)),y:Math.max(-100,Math.min(100,drag.current.oy+(event.clientY-drag.current.y)/2))})}}
      onPointerUp={()=>{drag.current=null}}>
      {url?<div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:`url(${url})`,transform:`translate(${offset.x/2}%,${offset.y/2}%) scale(${zoom})`}}/>:<div className="absolute inset-0 grid place-items-center bg-surface p-8 text-center font-mono text-[10px] uppercase tracking-[2px] text-muted">Add a cover when you are ready</div>}
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
      <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="w-full font-mono text-[10px]" onChange={(event)=>{const file=event.target.files?.[0];if(url)URL.revokeObjectURL(url);setUrl(file?URL.createObjectURL(file):null)}}/>
      <div className="flex gap-1">{shapes.map((item)=><button key={item.value} type="button" onClick={()=>setShape(item.value)} className={`border-2 border-ink px-3 py-2 font-mono text-[9px] uppercase ${shape===item.value?"bg-ink text-cream":"bg-surface"}`}>{item.label}</button>)}</div>
    </div>
    <label className="mt-3 grid grid-cols-[70px_1fr_42px] items-center gap-2 font-mono text-[9px] uppercase text-muted"><span>Zoom</span><input type="range" min="1" max="2.5" step="0.05" value={zoom} onChange={(event)=>setZoom(Number(event.target.value))}/><span>{Math.round(zoom*100)}%</span></label>
    <input type="hidden" name="coverFrameShape" value={shape}/><input type="hidden" name="coverZoom" value={zoom}/><input type="hidden" name="coverOffsetX" value={offset.x}/><input type="hidden" name="coverOffsetY" value={offset.y}/>
  </section>;
}
