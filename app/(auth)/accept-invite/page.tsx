import { redirect } from "next/navigation";
import { AcceptInviteForm } from "@/components/auth/AcceptInviteForm";
import { createClient } from "@/lib/supabase/server";

export default async function AcceptInvitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: player } = await supabase
    .from("players")
    .select("status")
    .eq("id", user.id)
    .single();
  if (!player || player.status !== "invited") redirect("/");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold tracking-[1px] text-ink">
          Join the cup
        </h1>
        <p className="font-body text-sm leading-6 text-muted">
          Choose the password you will use to sign in.
        </p>
      </div>
      <AcceptInviteForm />
    </div>
  );
}
