"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { TrophyAssetDefinition } from "@/lib/trophies/assets";
import type { TrophyAward, TrophyDetail, TrophyEngraving } from "@/lib/trophies/model";
import { eventYear } from "@/lib/trophies/model";
import styles from "./TrophyViewer.module.css";

const TrophyModelStage=dynamic(()=>import("./TrophyModelStage").then((module)=>module.TrophyModelStage),{ssr:false,loading:()=> <div className={styles.modelStage}><p className={styles.modelStatus} role="status">Preparing the 3D viewer…</p></div>});

export function TrophyViewer({award,detail,asset,engravings}:{award:TrophyAward;detail:TrophyDetail;asset:TrophyAssetDefinition;engravings:TrophyEngraving[]}){
  const isEventTrophy=asset.engravingMode==="event";
  return <main className={styles.viewer}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Your trophy · {eventYear(award)}</p><h1>{award.name}</h1></div><Link href={`/tournaments?trophy=${award.tournamentId}`} className={styles.close} aria-label="Close 3D trophy viewer">×</Link></header>
    <div className={styles.layout}>
      <section aria-label={`${award.name} 3D viewer`} className={styles.stagePanel}><TrophyModelStage asset={asset} trophyName={award.name}/></section>
      <aside className={styles.story}>
        <p className={styles.eyebrow}>The physical cup</p><h2>{isEventTrophy?"Made for this victory":"Engraved through every reign"}</h2>
        <p className={styles.intro}>{isEventTrophy?"This cup belongs to one event. Its engraving is derived from the official first-place placement.":"This collectible returns under the same trophy key. Each completed win adds another line to its derived history."}</p>
        <ol className={styles.engravings} aria-label={`${award.name} engraving history`}>{engravings.map((engraving)=><li key={engraving.tournamentId} className={engraving.selected?styles.selectedEngraving:undefined} aria-current={engraving.selected?"true":undefined}><span>{engraving.winnerName}</span><b>Champion · {engraving.year}</b><small>{engraving.eventName} · {engraving.locationName}</small></li>)}</ol>
        <div className={styles.current}><span>Currently celebrating</span><b>{detail.tournamentName}</b><small>{detail.locationName}</small></div>
      </aside>
    </div>
  </main>;
}
