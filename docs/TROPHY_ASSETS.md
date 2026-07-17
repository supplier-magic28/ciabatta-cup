# Trophy 3D asset and Android AR runbook

The release uses registered, read-only physical-trophy assets. It does
not use an AR SaaS account, API key, Supabase bucket, custom camera stream, or
iOS Quick Look. `trophy_key` is the durable identity: every completed ranked
tournament carrying `claymore` adds its first-place winner to the same derived
engraving ledger. The registered `ranked_cup` geometry is event-specific: each
unnamed ranked win uses its tournament name plus `Cup` and shows only that
event's first-place engraving.

## Rebuild the trophy assets

Install Blender, then run from the repository root:

```powershell
blender --background --python scripts/trophies/build_claymore.py
blender --background --python scripts/trophies/build_ranked_cup.py
npm run assets:trophies:check
```

The scripts are the reproducible sources for the editable files under
`design-reference/trophy-model-sources/`, versioned GLBs under
`public/trophies/`, and their WebP posters. Both builders use real-world metres,
a bottom-centred plinth, +Y-up glTF export, PBR materials, and no baked floor
shadow. Keep each version below 5 MB, 100,000 triangles, and ten materials.
Version filenames whenever geometry or materials change; never replace a
deployed version in place because trophy assets are cached as immutable for one
year.

Register a future physical cup in `lib/trophies/assets.ts` only after its model,
poster, editable source, and validator contract exist. Set `engravingMode` to
`lineage` for a reused physical cup or `event` for distinct awards that share a
model family. Unregistered awards remain in the 2D cabinet with a disabled 3D
action.

## Android release smoke

Use the production HTTPS origin on a real supported Android phone:

1. Before the Claymore tournament completes, open its director console and use
   **Preview trophy in 3D/AR** to test the exact production model and Android
   placement stage without creating a winner or engraving. Open the owned
   Ciabatta Qualifier Cup detail sheet to cover the completed-award path, then
   repeat with an owned Claymore after completion to cover its lineage ledger.
2. Confirm the poster resolves into the model, drag rotates it, pinch zooms it,
   the engraving ledger is chronological, and Close returns to the same sheet.
3. Select **Place in your space**, accept camera access, detect a horizontal
   surface, place and resize the model, exit, and re-enter.
4. Repeat with camera denied. The 3D viewer must remain usable and show the
   non-blocking AR hint.
5. Confirm WebXR is preferred and Google Scene Viewer is the fallback when
   browser WebXR is unavailable. The placement action must remain visible on an
   Android Chrome candidate while `<model-viewer>` finishes asynchronous mode
   selection; its explicit fallback launches Scene Viewer with
   `mode=ar_preferred`. Verify Google Play Services for AR and the Google app
   are current.
6. Enable reduced motion and confirm the 3D model no longer auto-rotates.

The automated suite proves asset conformance, viewer capability states,
ownership rejection, reduced motion, responsive geometry, and the absence of
direct `getUserMedia` use. It cannot prove camera permission, plane tracking,
or physical placement.

## Deferred iPhone release

`iosAr` remains false and `quick-look` is absent from the viewer. Do not enable
it until a real iPhone verifies model scale, materials, permission/placement,
and return behavior. Test model-viewer's generated USDZ first; add a versioned
explicit USDZ only if the generated result is materially worse.
