"use client";
/* eslint-disable @next/next/no-img-element -- local blob previews must render before upload. */

import { useActionState, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { Button } from "@/components/ui/Button";
import { CropZoomControl } from "@/components/ui/CropZoomControl";
import { updateTournamentPhoto } from "@/lib/tournament/actions";
import { isAllowedTournamentPhoto } from "@/lib/tournament/crop";

export function TournamentPhotoControl({
  tournamentId,
  photoUrl,
  canEdit,
  frameShape="wide",cropZoom=1,cropOffsetX=0,cropOffsetY=0,
}: {
  tournamentId: string;
  photoUrl: string | null;
  canEdit: boolean;
  frameShape?:"wide"|"square"|"three_two";cropZoom?:number;cropOffsetX?:number;cropOffsetY?:number;
}) {
  const [state, submit, pending] = useActionState(updateTournamentPhoto, undefined);
  const [preview, setPreview] = useState(photoUrl);
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [sourceFile,setSourceFile]=useState<File|null>(null);
  const [crop, setCrop] = useState({ x: cropOffsetX, y: cropOffsetY });
  const [zoom, setZoom] = useState(cropZoom);
  const [shape,setShape]=useState(frameShape);
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
    setSourceFile(file);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }

  async function confirmCrop() {
    if (!source || !sourceFile) return;
    if (preview?.startsWith("blob:")&&preview!==source) URL.revokeObjectURL(preview);
    setPhoto(sourceFile);setPreview(URL.createObjectURL(sourceFile));setSource(null);setSourceFile(null);setRemovePhoto(false);setError(null);
  }

  function cancelCrop() {
    if (source) URL.revokeObjectURL(source);
    setSource(null);
    setSourceFile(null);
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
        <div className={`overflow-hidden ${shape==="square"?"aspect-square":shape==="three_two"?"aspect-[3/2]":"aspect-[16/7]"}`}><img src={preview} alt="Tournament cover" className="h-full w-full object-cover opacity-90" style={{transform:`translate(${crop.x/2}%,${crop.y/2}%) scale(${zoom})`}} /></div>
      ) : (
        <div className="flex aspect-[16/7] items-center justify-center bg-ink/20 px-4 text-center font-mono text-[10px] uppercase tracking-[1.5px] text-green-muted">
          No event photo yet
        </div>
      )}
      {canEdit && (
        <form action={save} className="absolute inset-x-3 bottom-3 flex flex-wrap gap-2">
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <input type="hidden" name="removePhoto" value={removePhoto ? "true" : "false"} />
          <input type="hidden" name="coverFrameShape" value={shape}/><input type="hidden" name="coverZoom" value={zoom}/><input type="hidden" name="coverOffsetX" value={crop.x}/><input type="hidden" name="coverOffsetY" value={crop.y}/>
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
                aspect={shape==="square"?1:shape==="three_two"?3/2:16/7}
                cropShape="rect"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
              />
            </div>
            <div className="mt-3 flex gap-2">{([['wide','Wide'],['square','Square'],['three_two','3:2']] as const).map(([value,label])=><button key={value} type="button" onClick={()=>setShape(value)} className={`border-2 border-ink px-3 py-2 font-mono text-[9px] uppercase ${shape===value?'bg-ink text-cream':'bg-surface'}`}>{label}</button>)}</div>
            <CropZoomControl zoom={zoom} onChange={setZoom} />
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
