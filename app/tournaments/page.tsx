import Image from "next/image";
import Link from "next/link";
import {redirect} from "next/navigation";
import {SiteHeader} from "@/components/layout/SiteHeader";
import {TrophyCase} from "@/components/trophies/TrophyCase";
import {displayName} from "@/lib/auth/displayName";
import {getSessionPlayer} from "@/lib/auth/session";
import {loadTrophyExperience,type TournamentListRow} from "@/lib/trophies/read";
import {resolveTrophyDeepLink} from "@/lib/trophies/model";

const STATUS_STYLE:Record<string,string>={draft:"text-muted",scheduled:"text-crust",live:"text-green",completed:"text-ink",cancelled:"text-rust"};
const ACTIVE=new Set(["draft","scheduled","live"]);

export default async function TournamentsPage({searchParams}:{searchParams:Promise<{trophy?:string|string[]}>}){
  const player=await getSessionPlayer();if(!player)redirect("/sign-in");
  const [{trophy},experience]=await Promise.all([searchParams,loadTrophyExperience(player.id)]);
  const requested=typeof trophy==="string"?trophy:null;
  const initialTrophyId=resolveTrophyDeepLink(requested,experience.awards);
  const upcoming=experience.tournaments.filter((tournament)=>ACTIVE.has(tournament.status)).sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
  const archive=experience.tournaments.filter((tournament)=>!ACTIVE.has(tournament.status)).sort((a,b)=>b.starts_at.localeCompare(a.starts_at));
  const playerName=displayName({firstName:player.firstName,lastName:player.lastName,email:player.email});
  return <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-12 pt-5 sm:px-6"><SiteHeader role={player.role} active="tournaments"/><div className="mb-5 flex items-end justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Competition calendar</p><h1 className="font-heading text-3xl font-bold">Tournaments</h1></div>{player.role==="admin"&&<Link href="/admin/tournaments/new" className="rounded-[6px] border-2 border-ink bg-crust px-4 py-2 font-heading text-sm font-bold text-cream shadow-[2px_2px_0_var(--color-ink)]">New cup</Link>}</div>
    <TournamentSection title="Upcoming cups" eyebrow="Next on court" tournaments={upcoming} empty="No cups are currently scheduled."/>
    <TrophyCase key={initialTrophyId??"closed"} awards={experience.awards} details={experience.details} playerName={playerName} initialTrophyId={initialTrophyId}/>
    <TournamentSection title="Cup archive" eyebrow="Completed and cancelled" tournaments={archive} empty="No cups in the archive yet."/>
  </main>;
}

function TournamentSection({title,eyebrow,tournaments,empty}:{title:string;eyebrow:string;tournaments:TournamentListRow[];empty:string}){return <section aria-labelledby={`${title.replaceAll(" ","-")}-title`}><div className="mb-4"><p className="font-mono text-[9px] uppercase tracking-[1.8px] text-muted">{eyebrow}</p><h2 id={`${title.replaceAll(" ","-")}-title`} className="font-heading text-2xl font-bold">{title}</h2></div>{!tournaments.length?<p className="border-2 border-dashed border-hairline bg-surface p-6 text-center font-body text-sm text-muted">{empty}</p>:<div className="grid gap-4 sm:grid-cols-2">{tournaments.map((tournament)=><TournamentCard key={tournament.id} tournament={tournament}/>)}</div>}</section>}

function TournamentCard({tournament}:{tournament:TournamentListRow}){const aspect=tournament.cover_frame_shape==="square"?"aspect-square":tournament.cover_frame_shape==="three_two"?"aspect-[3/2]":"aspect-[16/6]";return <Link href={`/tournaments/${tournament.id}`} className="border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_var(--color-ink)] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none">{tournament.cover_image_url&&<div className={`relative mb-5 overflow-hidden ${aspect}`}><Image src={tournament.cover_image_url} alt="" fill sizes="(max-width: 640px) 100vw, 50vw" className="object-cover" style={{transform:`translate(${Number(tournament.cover_offset_x)/2}%,${Number(tournament.cover_offset_y)/2}%) scale(${Number(tournament.cover_zoom)})`}}/></div>}<div className="flex items-start justify-between gap-3"><h3 className="font-heading text-xl font-bold">{tournament.name}</h3><span className={`font-mono text-[9px] uppercase tracking-[1.5px] ${STATUS_STYLE[tournament.status]??"text-muted"}`}>{tournament.status}</span></div><p className="mt-4 font-mono text-[11px] uppercase leading-5 text-muted">{new Intl.DateTimeFormat("en-AU",{dateStyle:"medium",timeStyle:"short",timeZone:tournament.timezone}).format(new Date(tournament.starts_at))}<br/>{tournament.location_name} · {tournament.courts} courts</p></Link>}
