import { formatScore, type ScoreSet } from "@/lib/match/score";

export const GENERIC_TROPHY_KEY = "ranked_cup";
export const GENERIC_TROPHY_NAME = "Ranked Cup";

export type TrophyAward = {
  tournamentId: string;
  key: string;
  name: string;
  startsAt: string;
  timezone: string;
  named: boolean;
};

export type TrophyPlacementRow = { player_id: string; tournament_id: string; placement: number };
export type TrophyTournamentRow = {
  id: string; counts_as: string; starts_at?: string | null; timezone?: string | null;
  trophy_key?: string | null; trophy_name?: string | null;
};

export function deriveTrophyAwards(playerId: string, placements: readonly TrophyPlacementRow[], tournaments: readonly TrophyTournamentRow[]): TrophyAward[] {
  const tournamentById = new Map(tournaments.map((tournament) => [tournament.id, tournament]));
  return placements.flatMap((placement) => {
    const tournament = tournamentById.get(placement.tournament_id);
    if (placement.player_id !== playerId || placement.placement !== 1 || tournament?.counts_as !== "ranked") return [];
    const named = Boolean(tournament.trophy_key && tournament.trophy_name);
    return [{ tournamentId: tournament.id, key: named ? tournament.trophy_key! : GENERIC_TROPHY_KEY,
      name: named ? tournament.trophy_name! : GENERIC_TROPHY_NAME, startsAt: tournament.starts_at ?? "1970-01-01T00:00:00.000Z",
      timezone: tournament.timezone ?? "Australia/Melbourne", named }];
  }).sort((left, right) => Number(right.named) - Number(left.named) || right.startsAt.localeCompare(left.startsAt));
}

export function eventYear(award: Pick<TrophyAward, "startsAt" | "timezone">): number {
  const year = new Intl.DateTimeFormat("en-AU", { year: "numeric", timeZone: award.timezone }).formatToParts(new Date(award.startsAt)).find((part) => part.type === "year")?.value;
  return Number(year ?? new Date(award.startsAt).getUTCFullYear());
}

export function eventMonthYear(award: Pick<TrophyAward, "startsAt" | "timezone">): string {
  return new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric", timeZone: award.timezone }).format(new Date(award.startsAt)).toUpperCase();
}

export function toRoman(value: number): string {
  const numerals: Array<[number, string]> = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
  let remaining = Math.max(1, Math.floor(value)); let result = "";
  for (const [amount, numeral] of numerals) while (remaining >= amount) { result += numeral; remaining -= amount; }
  return result;
}

export type TrophyFixtureRow = { id:string;tournament_id:string;stage:string;round_number:number;slot_number:number;player1_id:string;player2_id:string;skipped_at:string|null };
export type TrophyMatchRow = { id:string;tournament_id:string|null;fixture_id:string|null;player1_id:string;player2_id:string|null;winner_id:string|null;status:string;played_at:string;match_sets:Array<{set_number:number;p1_games:number;p2_games:number;tiebreak_p1:number|null;tiebreak_p2:number|null}>|null };
export type TrophyPlayerRow = { id:string;name:string;avatarUrl:string|null };
export type TrophyRunRow = { matchId:string;stage:string;stageLabel:string;roundNumber:number;slotNumber:number;opponentId:string;opponentName:string;opponentAvatarUrl:string|null;won:boolean;score:string;isFinal:boolean };
export type TrophyEventRow = TrophyTournamentRow & {name:string;location_name:string;structure:string;default_surface:string|null;championship_path:string;cover_image_url:string|null;cover_frame_shape:string;cover_zoom:number|string;cover_offset_x:number|string;cover_offset_y:number|string};
export type TrophyDetail = {award:TrophyAward;tournamentName:string;locationName:string;surface:string|null;fieldLabel:string;participantCount:number;coverImageUrl:string|null;coverFrameShape:string;coverZoom:number;coverOffsetX:number;coverOffsetY:number;run:TrophyRunRow[]};

const STAGE_ORDER: Record<string, number> = { group:0,tiebreak:1,quarterfinal:2,semifinal:3,playoff:4,final:5 };
const STAGE_LABEL: Record<string, string> = { tiebreak:"TB",quarterfinal:"QF",semifinal:"SF",playoff:"3P",final:"F" };

export function deriveTrophyRun(playerId:string,tournamentId:string,fixtures:readonly TrophyFixtureRow[],matches:readonly TrophyMatchRow[],players:readonly TrophyPlayerRow[]):TrophyRunRow[]{
  const playerById=new Map(players.map((player)=>[player.id,player]));
  const fixtureById=new Map(fixtures.filter((fixture)=>fixture.tournament_id===tournamentId&&!fixture.skipped_at).map((fixture)=>[fixture.id,fixture]));
  return matches.flatMap((match)=>{const fixture=match.fixture_id?fixtureById.get(match.fixture_id):undefined;
    if(match.tournament_id!==tournamentId||match.status!=="approved"||!fixture||(match.player1_id!==playerId&&match.player2_id!==playerId))return[];
    const first=match.player1_id===playerId;const opponentId=first?match.player2_id:match.player1_id;if(!opponentId)return[];const opponent=playerById.get(opponentId);
    const sets:ScoreSet[]=[...(match.match_sets??[])].sort((a,b)=>a.set_number-b.set_number).map((set)=>({p1Games:first?set.p1_games:set.p2_games,p2Games:first?set.p2_games:set.p1_games,tiebreakP1:first?set.tiebreak_p1:set.tiebreak_p2,tiebreakP2:first?set.tiebreak_p2:set.tiebreak_p1}));
    return [{matchId:match.id,stage:fixture.stage,stageLabel:fixture.stage==="group"?`R${fixture.round_number}`:STAGE_LABEL[fixture.stage]??fixture.stage.slice(0,2).toUpperCase(),roundNumber:fixture.round_number,slotNumber:fixture.slot_number,opponentId,opponentName:opponent?.name??"Opponent",opponentAvatarUrl:opponent?.avatarUrl??null,won:match.winner_id===playerId,score:formatScore(sets),isFinal:fixture.stage==="final"}];
  }).sort((a,b)=>(STAGE_ORDER[a.stage]??99)-(STAGE_ORDER[b.stage]??99)||a.roundNumber-b.roundNumber||a.slotNumber-b.slotNumber);
}

export function buildTrophyDetails(playerId:string,awards:readonly TrophyAward[],tournaments:readonly TrophyEventRow[],participants:readonly {tournament_id:string}[],fixtures:readonly TrophyFixtureRow[],matches:readonly TrophyMatchRow[],players:readonly TrophyPlayerRow[]):TrophyDetail[]{
  return awards.flatMap((award)=>{const tournament=tournaments.find((row)=>row.id===award.tournamentId);if(!tournament)return[];const participantCount=participants.filter((row)=>row.tournament_id===tournament.id).length;const format=tournament.championship_path==="top_four_finals"?"round robin + finals":tournament.championship_path==="top_two_final"?"round robin + final":tournament.structure.replaceAll("_"," ");return [{award,tournamentName:tournament.name,locationName:tournament.location_name,surface:tournament.default_surface,fieldLabel:`${participantCount} players · ${format}`,participantCount,coverImageUrl:tournament.cover_image_url,coverFrameShape:tournament.cover_frame_shape,coverZoom:Number(tournament.cover_zoom),coverOffsetX:Number(tournament.cover_offset_x),coverOffsetY:Number(tournament.cover_offset_y),run:deriveTrophyRun(playerId,tournament.id,fixtures,matches,players)}]});
}

export function resolveTrophyDeepLink(requested:string|null,awards:readonly TrophyAward[]):string|null{return requested&&awards.some((award)=>award.tournamentId===requested)?requested:null}
export function shouldCloseTrophySheet(startY:number,endY:number):boolean{return endY-startY>=64}
export function shouldAnimateTrophy(reducedMotion:boolean):boolean{return !reducedMotion}
