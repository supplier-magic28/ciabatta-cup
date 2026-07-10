"use client";
/* eslint-disable @next/next/no-img-element -- local blob previews must render before upload. */

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { updateTournamentPhoto } from "@/lib/tournament/actions";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export function TournamentPhotoControl({
  tournamentId,
  photoUrl,
  canEdit,
}: {
  tournamentId: string;
  photoUrl: string | null;
  canEdit: boolean;
}) {
  const [state, submit, pending] = useActionState(updateTournamentPhoto, undefined);
  const [preview, setPreview] = useState(photoUrl);
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (!TYPES.includes(file.type) || file.size === 0 || file.size > MAX_BYTES) {
      setError("Choose a JPEG, PNG, or WebP photo under 5 MB.");
      return;
    }
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setError(null);
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setRemovePhoto(false);
  }

  function remove() {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPhoto(null);
    setPreview(null);
    setRemovePhoto(true);
  }

  function save(formData: FormData) {
    if (photo) formData.set("photo", photo);
    return submit(formData);
  }

  return (
    <div className="relative overflow-hidden border-2 border-cream/60 bg-ink/20">
      {preview ? (
        <img src={preview} alt="Tournament cover" className="aspect-[16/7] w-full object-cover opacity-90" />
      ) : (
        <div className="flex aspect-[16/7] items-center justify-center bg-ink/20 px-4 text-center font-mono text-[10px] uppercase tracking-[1.5px] text-green-muted">
          No event photo yet
        </div>
      )}
      {canEdit && (
        <form action={save} className="absolute inset-x-3 bottom-3 flex flex-wrap gap-2">
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <input type="hidden" name="removePhoto" value={removePhoto ? "true" : "false"} />
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              choosePhoto(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <Button type="button" onClick={() => input.current?.click()} loading={pending} loadingLabel="Working..." className="!w-auto bg-ink px-3 py-2 text-xs">
            {preview ? "Change photo" : "Add photo"}
          </Button>
          {preview && <Button type="button" onClick={remove} disabled={pending} className="!w-auto bg-surface px-3 py-2 text-xs text-ink">Remove</Button>}
          {photo && <Button type="submit" loading={pending} loadingLabel="Saving photo..." className="!w-auto bg-crust px-3 py-2 text-xs">Save photo</Button>}
        </form>
      )}
      {(error || (state && !state.ok)) && <p className="absolute inset-x-3 top-3 bg-ink/90 p-2 font-mono text-[10px] text-rust" role="alert">{error ?? (state && !state.ok ? state.error : "")}</p>}
      {state?.ok && <p className="absolute inset-x-3 top-3 bg-ink/90 p-2 font-mono text-[10px] text-chartreuse" role="status">{state.message}</p>}
    </div>
  );
}
