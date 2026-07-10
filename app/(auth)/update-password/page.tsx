import { redirect } from "next/navigation";
import { UpdatePasswordForm } from "@/components/auth/UpdatePasswordForm";
import { createClient } from "@/lib/supabase/server";

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold tracking-[1px] text-ink">
          Choose a new password
        </h1>
        <p className="font-body text-sm leading-6 text-muted">
          Use this password the next time you sign in to the cup.
        </p>
      </div>
      <UpdatePasswordForm />
    </div>
  );
}
