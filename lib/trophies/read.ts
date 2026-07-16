import "server-only";

import { displayName } from "@/lib/auth/displayName";
import { createClient } from "@/lib/supabase/server";
import { buildTrophyDetails, deriveTrophyAwards, type TrophyDetail, type TrophyEventRow, type TrophyFixtureRow, type TrophyMatchRow } from "./model";
export type { TrophyDetail } from "./model";

export type TournamentListRow = {
  id:string;name:string;status:string;starts_at:string;timezone:string;location_name:string;courts:number;
  structure:string;counts_as:string;default_surface:string|null;championship_path:string;
  cover_image_url:string|null;cover_frame_shape:string;cover_zoom:number|string;cover_offset_x:number|string;cover_offset_y:number|string;
  trophy_key:string|null;trophy_name:string|null;
};

export async function loadTrophyExperience(playerId:string){
  const db=await createClient();
  const [{data:tournamentData},{data:placementData}]=await Promise.all([
    db.from("tournaments").select("id,name,status,starts_at,timezone,location_name,courts,structure,counts_as,default_surface,championship_path,cover_image_url,cover_frame_shape,cover_zoom,cover_offset_x,cover_offset_y,trophy_key,trophy_name").order("starts_at",{ascending:false}),
    db.from("tournament_placements").select("player_id,tournament_id,placement").eq("player_id",playerId).eq("placement",1),
  ]);
  const tournaments=(tournamentData??[]) as TournamentListRow[];
  const awards=deriveTrophyAwards(playerId,placementData??[],tournaments);
  const ids=awards.map((award)=>award.tournamentId);
  if(!ids.length)return{tournaments,awards,details:[] as TrophyDetail[]};
  const [{data:participantData},{data:fixtureData},{data:matchData},{data:playerData}]=await Promise.all([
    db.from("tournament_participants").select("tournament_id,player_id").in("tournament_id",ids),
    db.from("fixtures").select("id,tournament_id,stage,round_number,slot_number,player1_id,player2_id,skipped_at").in("tournament_id",ids),
    db.from("matches").select("id,tournament_id,fixture_id,player1_id,player2_id,winner_id,status,played_at,match_sets(set_number,p1_games,p2_games,tiebreak_p1,tiebreak_p2)").in("tournament_id",ids).eq("status","approved"),
    db.from("players").select("id,first_name,last_name,nickname,use_nickname,avatar_url"),
  ]);
  const players=(playerData??[]).map((player)=>({id:player.id,name:displayName({firstName:player.first_name,lastName:player.last_name,nickname:player.nickname,useNickname:player.use_nickname}),avatarUrl:player.avatar_url}));
  const participants=participantData??[];const fixtures=(fixtureData??[]) as TrophyFixtureRow[];const matches=(matchData??[]) as TrophyMatchRow[];
  const details:TrophyDetail[]=buildTrophyDetails(playerId,awards,tournaments as TrophyEventRow[],participants,fixtures,matches,players);
  return{tournaments,awards,details};
}
