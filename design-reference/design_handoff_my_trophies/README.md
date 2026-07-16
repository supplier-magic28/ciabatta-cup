# Handoff: My Trophies — Trophy Case, Detail Sheet, "See My Trophy" AR

## Overview

A **My trophies** section in the cups area: a wooden trophy case holding every cup the viewing player has won.

1. **Trophy case** — old wooden cabinet (brass plaque, lit interior, two shelves) rendered on `/tournaments` beneath upcoming cups. Trophies sit on plinths with engraved brass plates. Always visible; an empty case shows dust silhouettes and "WIN A CUP TO FILL THIS SHELF".
2. **Tap → shake → detail sheet** — tapping a trophy shakes it (~400ms, pivot at its base), then a bottom sheet opens with the trophy's full story: engraving, tournament-day photo, date / location / surface / field, and "The Run" (each opponent beaten, with avatar and score).
3. **"See My Trophy"** — CTA on the sheet that opens a 3D viewer of the trophy and, on capable phones, places a slowly rotating 3D model of it on a real surface through the camera (AR).

## About the Design Files

Design references created in HTML — intended look and behavior, not production code. Recreate in the ciabatta-cup Next.js codebase using `components/tokens.ts` / `app/globals.css`, the shared vocabulary in `components/README.md`, and route conventions in `docs/DESIGN.md`.

## Fidelity

**High-fidelity** for blocks 01–02 (case + sheet): tokens, 2px ink borders, solid offset shadows and type match production exactly. Block 03 (AR screens) is **intent-fidelity**: the trophy there is flat art standing in for a real GLB render, and on iOS the placement chrome is Apple's (see AR pathway below) — match the overlays we own, not the platform's.

## Architecture fit (post-hardening, July 2026)

This feature is **read-only over existing facts** — it fits the RPC-only / immutable-facts architecture without touching it:

- No new tables, no new mutation RPCs, no migrations. Trophies are already derived: `lib/leaderboard/history.ts` → `trophies` count + `trophyAwards[] {key, name, year}` from official first-place placements (placements/completion are themselves RPC-only now — this feature only reads their results).
- The detail sheet reads the existing tournament read path (`lib/tournament/read.ts`) and the player's completed fixtures in that cup.
- Opponent avatars come through the existing avatar read path (Storage policies for active members apply — reuse whatever the leaderboard rows use).
- No comms: nothing here goes near the outbox or email ledger.
- The only new writes are static files: 3D model assets in `/public/trophies/`.

## Blocks (in `My Trophies & AR.dc.html`, top to bottom)

### 01 · The trophy case (`/tournaments`)
Section header "My trophies" + count chip (`2 ON THE SHELF` / `NOTHING YET`). The case: wood-grain cabinet, 3px ink border, 5px offset shadow, brass `MY TROPHIES` plaque, dark plank interior with a warm top light, wooden shelves. Each earned trophy stands on a plinth with an engraved brass plate:
- **Named cup award** (`trophyAwards[]`) → its trophy icon (the Claymore uses the existing `brand/ClaymoreCupIcon`) + plate `THE CLAYMORE · {year}`.
- **Plain ranked cup win** (trophies count not covered by a named award) → the generic ranked-cup mark (gold cup with a tennis ball; SVG `#rankedCup` in the prototype) + plate `RANKED CUP · {month year}`.
- One **dusty silhouette slot** labelled `NEXT CUP` always follows the last trophy (sells the chase).
- **Empty case** (zero trophies): silhouettes only + brass plate `WIN A CUP TO FILL THIS SHELF`.
Hover lifts a trophy 3px; tap plays the shake (WebAnimations, `transform-origin: 50% 100%`, ±5° → settle, ~420ms, skipped under `prefers-reduced-motion`) then opens the sheet.

### 02 · Trophy detail sheet
Bottom sheet over the cups page (grabber, swipe-down to close). Content order:
1. Header — trophy icon in a chartreuse disc, crust eyebrow `CIABATTA CLAYMORE CUP · CHAMPION`, title "The Claymore".
2. Engraving plate — brass gradient, `{PLAYER} · CHAMPION · {ROMAN YEAR}`.
3. Tournament-day photo — the cup's `cover_image_url`, **saved frame crop preserved** (same rule as the invite email photo band).
4. Meta grid — DATE · LOCATION · SURFACE (colored dot, e.g. clay rust) · FIELD (`6 players · knockout`).
5. **THE RUN** — one row per completed fixture, QF→F: round chip, opponent avatar (32px, ink ring), `d. {name}`, mono score. Final row highlighted chartreuse.
6. **SEE MY TROPHY** CTA — chartreuse, 2px ink, offset shadow, AR-cube glyph, sub-line `PLACE IT IN YOUR SPACE · USES CAMERA`.
Every field is auto-sourced; nothing is hand-entered.

### 03 · "See My Trophy" — AR flow (4 phone screens)
1. **3D viewer** — full-screen dark stage, the trophy model auto-rotating over a chartreuse glow disc, name + year, `Place in your space` pill button. This screen is also the desktop and no-AR fallback (drag to spin, pinch to zoom).
2. **Camera permission** — native prompt ("to place your trophy on a real surface in front of you"), asked once on first AR launch. Deny → stay in the viewer with a "camera needed for AR" hint.
3. **Find a surface** — camera feed, scrim chips `MOVE YOUR PHONE SLOWLY` / `POINT AT A TABLE OR THE FLOOR`, dashed chartreuse reticle lying flat on candidate planes, pulsing; snaps solid + haptic tick on lock → tap to place.
4. **Placed** — trophy anchored to the plane, **rotating slowly** (default one sway cycle ≈ 9s; tweakable), soft contact shadow, brass engraving chip up top, `PINCH TO RESIZE · DRAG TO MOVE` hint, controls: ↺ re-place, shutter (saves a photo), Done → back to the sheet.

### 04 · Workflow & build notes
Flow diagram + data mapping + the AR pathway (reproduced below) — this block in the prototype is the spec-of-record for Codex.

## AR pathway (recommended)

- **One model pair per `trophy_key`** in `/public/trophies/`: `claymore.glb` + `claymore.usdz` (<5MB, baked lighting). v1 ships one shared model per trophy; the engraved winner plate is a v2 texture pass.
- **Shell: `<model-viewer>`** (`@google/model-viewer`, lazy-loaded only on the trophy viewer route):
  `<model-viewer ar ar-modes="webxr scene-viewer quick-look" src="/trophies/{key}.glb" ios-src="/trophies/{key}.usdz" auto-rotate rotation-per-second="30deg" camera-controls>` — one tag covers the 3D viewer, the AR handoff and the fallback, with no custom WebXR code.
- **Branches**: iOS Safari → AR Quick Look (`.usdz`; Apple owns the placement chrome — screens 3–4's scan/place/shutter come free and look close to the design); Android Chrome → Scene Viewer / WebXR (`.glb`; if you later want the designed HUD verbatim, WebXR mode is where you own the overlay); no AR support → stay in the full-screen viewer (hide "Place in your space" on desktop).
- **Rotation**: slow, ~30°/s in the viewer; in AR let the platform default rule if fighting it is costly — the trophy reading as *present* beats the spin.

## Behavior rules

- Case renders from derived history only; a trophy exists the moment its cup's completion + official placement facts do (no separate award write).
- Order on the shelf: named cup awards first (newest first), then plain ranked cups; silhouette slot last.
- Shake never blocks the sheet — animation and sheet-open start together (shake ~420ms, sheet transition ~300ms).
- Sheet deep-links: `/tournaments?trophy={tournamentId}` (shareable; opens the sheet over the cups page).
- Photo band omitted entirely when the cup has no cover photo (same as email rule).
- "The Run" lists only the viewer's completed fixtures in that cup; a walkover renders `w/o` in place of a score.
- Reduced motion: no shake, no auto-rotate (static front pose), AR unaffected (platform-owned).
- Tap targets ≥44px (each trophy's hit area includes its plinth and plate).

## Design tokens

All from `components/tokens.ts` — no new tokens. The case's wood/brass are **local decorative gradients, not tokens** (wood `#7A4B2A→#4A2A16`, interior planks `#3A2312→#2B180B`, shelf `#A06A3C→#4E2C14`, brass `#D9A05B→#9C6230`, brass text `#3B2008`) — keep them scoped to this component. Everything else (ink, cream, chartreuse, crust, clay, hairlines, fonts Bricolage Grotesque / IBM Plex Mono / Work Sans) is existing vocabulary.

## Files

- `My Trophies & AR.dc.html` — prototype, all four blocks on a dark canvas (open in a browser; needs bundled `support.js`, `ios-frame.jsx`, `image-slot.js`, `players/`). The trophies shake on tap; the AR trophy sways live. The camera frames are droppable image slots (empty in captures) — the real build shows the live camera feed there.
- `PROMPT.md` — paste-ready instructions for Codex.
- `screenshots/` — reference captures, segmented per block (lower-res; the HTML is the pixel truth): `01a/01b` trophy case, `02a/02b` detail sheet, `03a` AR viewer + permission, `03b` AR scan + placed (scaled pairs), `04` build notes. The camera frames are empty image slots in captures — the real build shows the live feed.
- Tweaks on the prototype: `emptyCase` (preview the zero-trophy state), `arSpinSeconds` (AR rotation period).
