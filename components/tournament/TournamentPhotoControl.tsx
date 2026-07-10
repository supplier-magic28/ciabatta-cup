"use client";
/* eslint-disable @next/next/no-img-element -- local blob previews must render before upload. */

import { useActionState, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/Button";
import { updateTournamentPhoto } from "@/lib/tournament/actions";
import { createTournamentCoverFile, isAllowedTournamentPhoto, type CropAreaPixels } from "@/lib/tournament/crop";

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
  const [source, setSource] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropArea, setCropArea] = useState<CropAreaPixels | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!source) return;
    return () => URL.revokeObjectURL(source);
  }, [source]);

  useEffect(() => {
    if (!preview?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (!isAllowedTournamentPhoto(file)) {
      setError("Choose a JPEG, PNG, or WebP photo under 5 MB.");
      return;
    }
    setError(null);
    if (source) URL.revokeObjectURL(source);
    setSource(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropArea(null);
  }

  async function confirmCrop() {
    if (!source || !cropArea) return;
    try {
      const file = await createTournamentCoverFile(source, cropArea);
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
      setPhoto(file);
      setPreview(URL.createObjectURL(file));
      URL.revokeObjectURL(source);
      setSource(null);
      setRemovePhoto(false);
      setError(null);
    } catch {
      setError("That picture could not be prepared. Please choose another image.");
    }
  }

  function cancelCrop() {
    if (source) URL.revokeObjectURL(source);
    setSource(null);
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

      {source && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4" role="dialog" aria-modal="true" aria-labelledby="tournament-photo-crop-title">
          <div className="w-full max-w-2xl border-2 border-ink bg-surface p-4 shadow-[5px_5px_0_var(--color-green)]">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[2px] text-crust">Event photo</p>
                <h2 id="tournament-photo-crop-title" className="font-heading text-xl font-bold">Crop and resize photo</h2>
              </div>
              <button type="button" onClick={cancelCrop} className="font-mono text-xs uppercase text-muted underline">Cancel</button>
            </div>
            <div className="relative h-[min(62vh,420px)] w-full overflow-hidden bg-ink">
              <Cropper
                image={source}
                crop={crop}
                zoom={zoom}
                aspect={16 / 7}
                cropShape="rect"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={(_area, pixels: Area) => setCropArea(pixels)}
                onZoomChange={setZoom}
              />
            </div>
            <label className="mt-4 grid gap-2 font-mono text-[10px] uppercase tracking-[1.5px] text-muted">
              Zoom
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <Button type="button" onClick={cancelCrop} className="!w-auto bg-surface text-ink">Cancel</Button>
              <Button type="button" onClick={confirmCrop} className="!w-auto">Use cropped photo</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
