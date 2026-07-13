import Link from "next/link";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
export async function ZeusNavLink(){const player=await getSessionPlayer();if(!player)return null;const db=await createClient();const {count}=await db.from("notifications").select("id",{count:"exact",head:true}).eq("player_id",player.id).is("read_at",null);return <Link href="/notifications" aria-label={`${count??0} unread Zeus notifications`} className="relative font-mono text-[10px] uppercase tracking-[1.5px] text-rust">Zeus{Boolean(count)&&<span className="absolute -right-3 -top-3 flex h-4 min-w-4 items-center justify-center rounded-full bg-rust px-1 text-[8px] text-cream">{count}</span>}</Link>}
