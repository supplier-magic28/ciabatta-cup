import { redirect } from "next/navigation";
import { TrophyViewer } from "@/components/trophies/TrophyViewer";
import { getSessionPlayer } from "@/lib/auth/session";
import { loadOwnedTrophyViewer } from "@/lib/trophies/read";

export default async function TrophyViewerPage({params}:{params:Promise<{tournamentId:string}>}){
  const {tournamentId}=await params;
  const player=await getSessionPlayer();
  if(!player)redirect(`/sign-in?next=${encodeURIComponent(`/tournaments/${tournamentId}/trophy`)}`);
  const viewer=await loadOwnedTrophyViewer(player.id,tournamentId);
  if(!viewer)redirect("/tournaments");
  return <TrophyViewer {...viewer}/>;
}
