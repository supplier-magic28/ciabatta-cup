"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClaymoreCupIcon } from "@/components/brand/ClaymoreCupIcon";
import { RankedCupIcon } from "@/components/brand/RankedCupIcon";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { getRegisteredTrophyAsset } from "@/lib/trophies/assets";
import {
  TrophySoundPlayer,
  safelyPlayTrophySound,
  setTrophySoundPreference,
  useTrophySoundPreference,
} from "@/lib/trophies/audio";
import {
  canStartTrophyActivation,
  completeTrophyActivation,
  shouldPlayTrophyHoverSound,
  trophyCoverRatio,
  TROPHY_SHAKE_MS,
} from "@/lib/trophies/interaction";
import {
  eventMonthYear,
  eventYear,
  shouldCloseTrophySheet,
  toRoman,
  type TrophyAward,
  type TrophyDetail,
} from "@/lib/trophies/model";
import styles from "./TrophyCase.module.css";

const surfaceTone: Record<string, string> = {
  clay: "bg-rust",
  hard: "bg-green",
  grass: "bg-chartreuse",
  synthetic: "bg-crust",
};

function TrophyArt({ award, size=72, muted=false }: { award:TrophyAward;size?:number;muted?:boolean }) {
  const className = muted ? styles.silhouette : "";
  return award.key === "claymore"
    ? <ClaymoreCupIcon size={size} className={className}/>
    : <RankedCupIcon size={size} className={className}/>;
}

export function TrophyCase({ awards, details, playerName, initialTrophyId }: { awards:TrophyAward[];details:TrophyDetail[];playerName:string;initialTrophyId:string|null }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(initialTrophyId);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const openingRef = useRef<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const lastHoverSoundAt = useRef(Number.NEGATIVE_INFINITY);
  const [soundPlayer] = useState(() => new TrophySoundPlayer());
  const soundEnabled = useTrophySoundPreference();
  const selected = details.find((detail) => detail.award.tournamentId === selectedId) ?? null;

  const close = useCallback(() => {
    setSelectedId(null);
    router.replace("/tournaments", { scroll:false });
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [router]);

  useEffect(() => {
    if (!selected) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sheet = sheetRef.current;
    const focusable = () => Array.from(sheet?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])') ?? []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [close, selected]);

  const playHover = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!soundEnabled || event.pointerType === "touch" || openingRef.current) return;
    const now = event.timeStamp;
    if (!shouldPlayTrophyHoverSound(lastHoverSoundAt.current, now)) return;
    lastHoverSoundAt.current = now;
    void safelyPlayTrophySound(() => soundPlayer.playChime());
  };

  const activate = async (award: TrophyAward, event: React.MouseEvent<HTMLButtonElement>) => {
    if (!canStartTrophyActivation(openingRef.current)) return;
    openingRef.current = award.tournamentId;
    setOpeningId(award.tournamentId);
    triggerRef.current = event.currentTarget;
    if (soundEnabled) void safelyPlayTrophySound(() => soundPlayer.playClank());
    const visual = event.currentTarget.querySelector<HTMLElement>(`[data-trophy-visual]`);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    await completeTrophyActivation({
      reducedMotion,
      animationFinished: visual ? () => visual.animate([
        { transform:"translateY(-3px) rotate(0deg)" },
        { transform:"translateY(-3px) rotate(-5deg)" },
        { transform:"translateY(-3px) rotate(5deg)" },
        { transform:"translateY(-3px) rotate(-3deg)" },
        { transform:"translateY(-3px) rotate(0deg)" },
      ], { duration:TROPHY_SHAKE_MS, easing:"ease-out" }).finished : undefined,
      open: () => {
        setSelectedId(award.tournamentId);
        router.push(`/tournaments?trophy=${award.tournamentId}`, { scroll:false });
      },
    });
    openingRef.current = null;
    setOpeningId(null);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setTrophySoundPreference(next);
    if (next) void safelyPlayTrophySound(() => soundPlayer.playChime());
  };

  const slots = awards.length
    ? [...awards, { tournamentId:"next",key:"ranked_cup",name:"Next cup",startsAt:"1970-01-01",timezone:"Australia/Melbourne",named:false } satisfies TrophyAward]
    : [];
  const shelves: TrophyAward[][] = awards.length
    ? Array.from({ length:Math.ceil(slots.length / 3) }, (_, index) => slots.slice(index * 3, index * 3 + 3))
    : [[
      { tournamentId:"empty-1",key:"claymore",name:"Empty",startsAt:"1970-01-01",timezone:"Australia/Melbourne",named:false },
      { tournamentId:"empty-2",key:"ranked_cup",name:"Empty",startsAt:"1970-01-01",timezone:"Australia/Melbourne",named:false },
    ]];

  return <section className="my-10" aria-labelledby="my-trophies-title">
    <div className="mb-4 flex items-end justify-between gap-4">
      <div><p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Your cabinet</p><h2 id="my-trophies-title" className="font-heading text-3xl font-bold">My trophies</h2></div>
      <div className="flex items-center gap-3"><span className="font-mono text-[9px] uppercase tracking-[1.5px] text-muted">{awards.length ? `${awards.length} on the shelf` : "Nothing yet"}</span><button type="button" onClick={toggleSound} aria-pressed={soundEnabled} aria-label={`Trophy sounds ${soundEnabled ? "on" : "off"}. Toggle trophy sounds.`} className="min-h-11 min-w-11 border-2 border-ink bg-surface px-2 font-mono text-[8px] font-bold uppercase shadow-[2px_2px_0_var(--color-ink)]">{soundEnabled ? "Sound on" : "Sound off"}</button></div>
    </div>
    <div className={styles.cabinet}><div className={styles.plaque}>My trophies</div><div className={styles.interior}>
      {shelves.map((shelf, index) => <div className={styles.shelf} key={index}>{shelf.map((award) => {
        const placeholder = award.tournamentId.startsWith("empty") || award.tournamentId === "next";
        if (placeholder) return <div key={award.tournamentId} className="relative z-10 flex min-h-36 flex-col items-center justify-end"><TrophyArt award={award} size={award.key === "claymore" ? 60 : 66} muted/><span className={styles.nextPlate}>{award.tournamentId === "next" ? "Next cup" : "Empty shelf"}</span></div>;
        return <button key={award.tournamentId} type="button" className={`${styles.trophy} relative z-10 flex flex-col items-center justify-end`} onPointerEnter={playHover} onClick={(event) => void activate(award, event)} disabled={openingId !== null} aria-busy={openingId === award.tournamentId} aria-label={`Open ${award.name}, ${eventYear(award)} trophy details`}><span data-trophy-visual className={`${styles.trophyVisual} flex flex-col items-center justify-end`}><TrophyArt award={award}/><span className={styles.plate}>{award.name} · {award.named ? eventYear(award) : eventMonthYear(award)}</span></span></button>;
      })}</div>)}
      {!awards.length && <div className={`${styles.plaque} mt-5`}>Win a cup to fill this shelf</div>}
    </div></div>
    {selected && <TrophyDetailSheet detail={selected} playerName={playerName} close={close} sheetRef={sheetRef} dragStartRef={dragStartRef}/>}
  </section>;
}

function TrophyDetailSheet({ detail, playerName, close, sheetRef, dragStartRef }: { detail:TrophyDetail;playerName:string;close:()=>void;sheetRef:React.RefObject<HTMLDivElement|null>;dragStartRef:React.MutableRefObject<number|null> }) {
  const ratio = trophyCoverRatio(detail.coverFrameShape);
  const asset = getRegisteredTrophyAsset(detail.award.key);
  return <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="trophy-sheet-title" className={styles.sheet}>
      <header className={styles.sheetHeader} onPointerDown={(event) => { dragStartRef.current = event.clientY; }} onPointerUp={(event) => { if (dragStartRef.current !== null && shouldCloseTrophySheet(dragStartRef.current, event.clientY)) close(); dragStartRef.current = null; }}>
        <div className={styles.grabber}/><div className="flex items-start gap-3 px-4 pb-4 sm:px-7"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-ink bg-chartreuse"><TrophyArt award={detail.award} size={34}/></div><div className="min-w-0 flex-1"><p className="font-mono text-[8px] uppercase tracking-[1.4px] text-crust sm:text-[9px]">{detail.tournamentName} · Champion</p><h2 id="trophy-sheet-title" className="truncate font-heading text-2xl font-bold sm:text-3xl">{detail.award.name}</h2></div><button type="button" onClick={close} className="grid h-11 w-11 shrink-0 place-items-center border-2 border-ink bg-surface font-mono text-lg" aria-label="Close trophy details">{"\u00d7"}</button></div>
      </header>
      <div className={styles.sheetBody}>
        <div className="border-2 border-ink bg-[linear-gradient(#d9a05b,#9c6230)] px-3 py-2 text-center font-mono text-[9px] font-bold uppercase tracking-[1.3px] text-[#3b2008] shadow-[2px_2px_0_var(--color-ink)] sm:text-[10px]">{playerName} · Champion · {toRoman(eventYear(detail.award))}</div>
        {detail.coverImageUrl && <div className={styles.coverFrame} style={{ aspectRatio:String(ratio), width:`min(100%, calc(38dvh * ${ratio}))` }}><Image src={detail.coverImageUrl} alt={`${detail.tournamentName} tournament day`} fill sizes="(max-width: 640px) 100vw, 768px" className="object-cover" style={{ transform:`translate(${detail.coverOffsetX / 2}%,${detail.coverOffsetY / 2}%) scale(${detail.coverZoom})` }}/></div>}
        <dl className="mt-5 grid grid-cols-1 overflow-hidden rounded-[7px] border-2 border-ink bg-surface sm:grid-cols-2"><Meta label="Date" value={new Intl.DateTimeFormat("en-AU", { dateStyle:"medium",timeZone:detail.award.timezone }).format(new Date(detail.award.startsAt))}/><Meta label="Location" value={detail.locationName}/><Meta label="Surface" value={detail.surface ?? "Not recorded"} dot={detail.surface ? surfaceTone[detail.surface] : undefined}/><Meta label="Field" value={detail.fieldLabel}/></dl>
        <div className="mt-6"><p className="font-mono text-[9px] uppercase tracking-[2px] text-muted">The run · {detail.run.length} matches</p><ul className="mt-2">{detail.run.map((row) => <li key={row.matchId} className={`${styles.runRow} ${row.isFinal ? styles.finalRow : ""}`}><span className="font-mono text-[9px] font-bold uppercase">{row.stageLabel}</span><PlayerAvatar name={row.opponentName} avatarUrl={row.opponentAvatarUrl} size={32}/><span className="min-w-0 truncate font-heading text-sm font-bold"><i className={`mr-2 not-italic ${row.won ? "text-green" : "text-rust"}`}>{row.won ? "W" : "L"}</i>vs {row.opponentName}</span><span className={styles.runScore}>{row.score || "Score unavailable"}</span></li>)}</ul></div>
        {asset?<Link href={`/tournaments/${detail.award.tournamentId}/trophy`} className="mt-6 flex min-h-16 w-full flex-col items-start gap-2 border-2 border-ink bg-chartreuse px-5 py-3 text-left shadow-[4px_4px_0_var(--color-ink)] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none sm:flex-row sm:items-center sm:gap-4"><span aria-hidden="true" className="font-mono text-2xl">◇</span><span><b className="block font-heading text-lg">See my trophy in 3D</b><small className="font-mono text-[8px] uppercase tracking-[1.4px]">Explore it here · place it with supported Android AR</small></span></Link>:<button type="button" disabled aria-disabled="true" className="mt-6 flex min-h-16 w-full flex-col items-start gap-2 border-2 border-ink bg-chartreuse px-5 py-3 text-left opacity-70 shadow-[4px_4px_0_var(--color-ink)] sm:flex-row sm:items-center sm:gap-4"><span aria-hidden="true" className="font-mono text-2xl">◇</span><span><b className="block font-heading text-lg">See my trophy · Coming soon</b><small className="font-mono text-[8px] uppercase tracking-[1.4px]">This physical trophy does not have a registered 3D model yet</small></span></button>}
        <p className="mt-5 text-center font-mono text-[8px] uppercase tracking-[1.5px] text-muted">Swipe down or press Escape to close</p>
      </div>
    </div>
  </div>;
}

function Meta({ label, value, dot }: { label:string;value:string;dot?:string }) {
  return <div className="border-b border-hairline p-3 sm:border-r"><dt className="font-mono text-[8px] uppercase tracking-[1.2px] text-muted">{label}</dt><dd className="mt-1 flex items-center gap-2 font-heading text-sm font-bold capitalize">{dot && <i className={`h-2.5 w-2.5 rounded-full border border-ink ${dot}`}/>} {value}</dd></div>;
}
