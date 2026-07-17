import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TrophyModelStage } from "@/components/trophies/TrophyModelStage";
import { getSessionPlayer } from "@/lib/auth/session";
import { getRegisteredTrophyAsset } from "@/lib/trophies/assets";
import { createClient } from "@/lib/supabase/server";
import styles from "@/components/trophies/TrophyViewer.module.css";

export default async function AdminTrophyPreviewPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const admin = await getSessionPlayer();
  const { tournamentId } = await params;
  const previewPath = `/admin/tournaments/${tournamentId}/trophy-preview`;

  if (!admin) redirect(`/sign-in?next=${encodeURIComponent(previewPath)}`);
  if (admin.role !== "admin") redirect("/");

  const db = await createClient();
  const { data: tournament } = await db
    .from("tournaments")
    .select("id,name,status,trophy_key,trophy_name")
    .eq("id", tournamentId)
    .single();
  const asset = tournament?.trophy_key
    ? getRegisteredTrophyAsset(tournament.trophy_key)
    : null;

  if (!tournament || !asset) notFound();

  const trophyName = tournament.trophy_name ?? asset.name;

  return (
    <main className={styles.viewer}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            Director preview &middot; {tournament.status}
          </p>
          <h1>{trophyName}</h1>
        </div>
        <Link
          href={`/admin/tournaments/${tournamentId}`}
          className={styles.close}
          aria-label="Close trophy preview"
        >
          &times;
        </Link>
      </header>
      <div className={styles.layout}>
        <section
          aria-label={`${trophyName} pre-event 3D preview`}
          className={styles.stagePanel}
        >
          <TrophyModelStage asset={asset} trophyName={trophyName} />
        </section>
        <aside className={styles.story}>
          <p className={styles.eyebrow}>Pre-event model check</p>
          <h2>Winner not decided</h2>
          <p className={styles.intro}>
            This director-only preview uses the exact production model and AR
            placement stage. It does not create an award, placement, or
            engraving.
          </p>
          <div className={styles.current}>
            <span>Competition</span>
            <b>{tournament.name}</b>
            <small>
              Complete the cup to award this trophy through official
              first-place facts.
            </small>
          </div>
          <ol className={styles.engravings} aria-label="Preview checklist">
            <li>
              <span>Inspect the model</span>
              <b>Drag / rotate / pinch</b>
              <small>Check the trophy silhouette, materials, and details.</small>
            </li>
            <li>
              <span>Place in your space</span>
              <b>Android floor placement</b>
              <small>
                Check real-world scale, surface anchoring, movement, and
                resizing.
              </small>
            </li>
            <li>
              <span>Return safely</span>
              <b>No sporting facts change</b>
              <small>Close returns to the director console.</small>
            </li>
          </ol>
        </aside>
      </div>
    </main>
  );
}
