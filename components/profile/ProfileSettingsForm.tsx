"use client";
/* eslint-disable @next/next/no-img-element -- blob previews are created locally before upload. */

import { useActionState, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/Button";
import { createCircularAvatarFile, isAllowedAvatar, type CropAreaPixels } from "@/lib/profile/crop";
import { updateProfileSettings } from "@/lib/profile/actions";

type Profile = {
  name: string;
  nickname: string | null;
  useNickname: boolean;
  avatarUrl: string | null;
};

export function ProfileSettingsForm({ profile }: { profile: Profile }) {
  const [state, submit, pending] = useActionState(updateProfileSettings, undefined);
  const [nickname, setNickname] = useState(profile.nickname ?? "");
  const [useNickname, setUseNickname] = useState(profile.useNickname);
  const [avatarPreview, setAvatarPreview] = useState(profile.avatarUrl);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropArea, setCropArea] = useState<CropAreaPixels | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!source) return;
    return () => URL.revokeObjectURL(source);
  }, [source]);

  useEffect(() => {
    if (!avatarPreview?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  function chooseFile(file: File | undefined) {
    if (!file) return;
    if (!isAllowedAvatar(file)) {
      setCropError("Choose a JPEG, PNG, or WebP image under 5 MB.");
      return;
    }
    setCropError(null);
    if (source) URL.revokeObjectURL(source);
    setSource(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropArea(null);
  }

  async function confirmCrop() {
    if (!source || !cropArea) return;
    try {
      const file = await createCircularAvatarFile(source, cropArea);
      if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
      URL.revokeObjectURL(source);
      setSource(null);
      setRemoveAvatar(false);
    } catch {
      setCropError("That picture could not be prepared. Please choose another image.");
    }
  }

  function cancelCrop() {
    if (source) URL.revokeObjectURL(source);
    setSource(null);
  }

  function removePicture() {
    if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(null);
    setAvatarPreview(null);
    setRemoveAvatar(true);
  }

  function save(formData: FormData) {
    if (avatarFile) formData.set("avatar", avatarFile);
    return submit(formData);
  }

  return (
    <>
      <form action={save} className="grid gap-7">
        <input type="hidden" name="removeAvatar" value={removeAvatar ? "true" : "false"} />
        <section className="border-2 border-ink bg-surface p-5 shadow-[3px_3px_0_var(--color-ink)]">
          <div className="flex flex-wrap items-center gap-5">
            {avatarPreview ? (
              // The crop output is already circular; object-cover remains a safe fallback for old uploads.
              <img src={avatarPreview} alt={`${profile.name} avatar`} width={112} height={112} className="h-28 w-28 rounded-full border-2 border-ink object-cover" />
            ) : (
              <div aria-label={`${profile.name} avatar`} className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-ink bg-row font-heading text-3xl font-bold text-green">
                {profile.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="grid gap-2">
              <p className="font-heading text-lg font-bold">Profile picture</p>
              <p className="max-w-md font-body text-sm text-muted">Choose a picture, then position it inside the circular frame.</p>
              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={() => fileInput.current?.click()} className="bg-crust">{avatarPreview ? "Change picture" : "Choose picture"}</Button>
                {avatarPreview && <Button type="button" onClick={removePicture} className="bg-surface text-ink">Remove picture</Button>}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  chooseFile(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </div>
          </div>
          {cropError && <p className="mt-3 font-mono text-xs text-rust" role="alert">{cropError}</p>}
        </section>

        <section className="border-2 border-ink bg-surface p-5 shadow-[3px_3px_0_var(--color-ink)]">
          <label htmlFor="nickname" className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Nickname</label>
          <input
            id="nickname"
            name="nickname"
            value={nickname}
            maxLength={32}
            onChange={(event) => setNickname(event.target.value)}
            className="mt-2 min-h-12 w-full border-2 border-ink bg-row px-3 font-body text-base text-ink outline-none focus:border-green"
            placeholder="e.g. Winners Only"
          />
          <fieldset className="mt-5 grid gap-3">
            <legend className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Name shown to other players</legend>
            <label className="flex items-center gap-3 font-body text-sm text-ink">
              <input type="radio" name="useNickname" value="real-name" checked={!useNickname} onChange={() => setUseNickname(false)} />
              Use real name
            </label>
            <label className="flex items-center gap-3 font-body text-sm text-ink">
              <input type="radio" name="useNickname" value="nickname" checked={useNickname} onChange={() => setUseNickname(true)} />
              Use nickname
            </label>
          </fieldset>
        </section>

        {state && !state.ok && <p className="font-mono text-xs text-rust" role="alert">{state.error}</p>}
        {state?.ok && <p className="font-mono text-xs text-crust" role="status">{state.message}</p>}
        <Button type="submit" loading={pending} loadingLabel="Saving profile..." className="w-full">Save profile</Button>
      </form>

      {source && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4" role="dialog" aria-modal="true" aria-labelledby="crop-title">
          <div className="w-full max-w-xl border-2 border-ink bg-surface p-4 shadow-[5px_5px_0_var(--color-green)]">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[2px] text-crust">Picture crop</p>
                <h2 id="crop-title" className="font-heading text-xl font-bold">Position your picture</h2>
              </div>
              <button type="button" onClick={cancelCrop} className="font-mono text-xs uppercase text-muted underline">Cancel</button>
            </div>
            <div className="relative h-[min(68vh,440px)] w-full overflow-hidden bg-ink">
              <Cropper
                image={source}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
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
            <div className="mt-4 flex justify-end gap-3">
              <Button type="button" onClick={cancelCrop} className="bg-surface text-ink">Cancel</Button>
              <Button type="button" onClick={confirmCrop}>Use picture</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
