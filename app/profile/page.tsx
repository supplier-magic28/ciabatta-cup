import { redirect } from "next/navigation";
import { ProfileSettingsForm } from "@/components/profile/ProfileSettingsForm";
import { displayName } from "@/lib/auth/displayName";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function ProfileSettingsPage() {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("players")
    .select("id, first_name, last_name, email, nickname, use_nickname, avatar_url")
    .eq("id", player.id)
    .single();
  if (!profile) redirect("/");

  const name = displayName({
    firstName: profile.first_name,
    lastName: profile.last_name,
    email: profile.email,
    nickname: profile.nickname,
    useNickname: profile.use_nickname,
  });
  const realName = displayName({ firstName: profile.first_name, lastName: profile.last_name, email: profile.email });

  return (
    <section>
      <p className="mb-6 font-body text-sm text-muted">Choose how the Cup sees you. Your account name stays private to these settings.</p>
      <ProfileSettingsForm
        profile={{
          name,
          nickname: profile.nickname,
          useNickname: profile.use_nickname,
          avatarUrl: profile.avatar_url,
        }}
      />
      <p className="mt-5 font-mono text-[10px] uppercase tracking-[1px] text-muted">Account name: {realName}</p>
    </section>
  );
}
