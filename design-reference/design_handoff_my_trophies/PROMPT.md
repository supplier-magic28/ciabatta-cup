# Prompt for Codex

Paste this (or point Codex at this file) from the ciabatta-cup repo root, with `design_handoff_my_trophies/` placed under `design-reference/`:

---

Implement the **My Trophies case + trophy detail sheet + "See My Trophy" AR viewer** at full design fidelity, following `design-reference/design_handoff_my_trophies/`.

Read in this order:
1. `README.md` — complete spec (case, sheet, AR pathway, behavior rules, architecture fit)
2. `My Trophies & AR.dc.html` — pixel + interaction reference (open in a browser; trophies shake on tap, the AR trophy sways)
3. `components/tokens.ts`, `components/README.md`, `docs/DESIGN.md` — the vocabulary to build with

Hard constraint — **read-only feature**: no new tables, no migrations, no new mutation RPCs. Everything renders from existing derived facts (`lib/leaderboard/history.ts` trophies/trophyAwards, `lib/tournament/read.ts`, the player's completed fixtures, existing avatar read path). The only new persisted artifacts are static 3D assets in `/public/trophies/`.

Scope of work:
- **Trophy case** on `/tournaments` beneath upcoming cups: "My trophies" header + count chip; wooden cabinet (local decorative gradients per README — wood/brass are NOT tokens, keep them component-scoped) with brass `MY TROPHIES` plaque, plank interior, warm top light, shelves. One plinth + engraved brass plate per trophy: named awards (Claymore → existing `brand/ClaymoreCupIcon`) then plain ranked cup wins (new generic ranked-cup SVG, `#rankedCup` in the prototype); always end with a dusty `NEXT CUP` silhouette. Zero trophies → silhouettes + `WIN A CUP TO FILL THIS SHELF` plate. Hover lifts 3px; tap = WebAnimations shake (`transform-origin: 50% 100%`, ±5°, ~420ms, skipped under `prefers-reduced-motion`) starting simultaneously with the sheet opening. Tap targets ≥44px including plinth.
- **Trophy detail sheet** (bottom sheet, grabber, swipe/tap-scrim to close, deep-linkable `/tournaments?trophy={tournamentId}`): chartreuse icon disc + crust eyebrow + trophy name; brass engraving plate `{PLAYER} · CHAMPION · {ROMAN YEAR}`; tournament-day photo from `cover_image_url` **with the saved frame crop preserved** (same rule as the invite email photo band; omit the band when null); DATE / LOCATION / SURFACE (colored dot) / FIELD meta grid; **THE RUN** — the viewer's completed fixtures QF→F (round chip, 32px avatar, `d. {name}`, mono score, `w/o` for walkovers, final row chartreuse); **SEE MY TROPHY** CTA (chartreuse, AR-cube glyph, `PLACE IT IN YOUR SPACE · USES CAMERA`).
- **3D viewer + AR** via `@google/model-viewer`, lazy-loaded on this route only: `<model-viewer ar ar-modes="webxr scene-viewer quick-look" src="/trophies/{trophy_key}.glb" ios-src="/trophies/{trophy_key}.usdz" auto-rotate rotation-per-second="30deg" camera-controls>` inside the full-screen dark stage from the design (name + year eyebrow, `Place in your space` pill). Branches: iOS → AR Quick Look (Apple owns placement chrome); Android → Scene Viewer/WebXR; no AR → viewer only, place-button hidden (always hidden on desktop). Camera permission is requested by the platform on first AR entry; denial keeps the viewer with a "camera needed for AR" hint. Auto-rotate off under `prefers-reduced-motion`. Ship placeholder `claymore.glb`/`claymore.usdz` (<5MB, baked lighting) so the pipeline is real even before final art; one shared model per `trophy_key` (engraved winner plate is v2).
- **Assets**: add the generic ranked-cup SVG as a brand component alongside `ClaymoreCupIcon`; wood/brass case styles scoped to the case component.
- Tests in the existing style: case derives correctly from history (named awards + plain ranked wins, ordering, zero-state); sheet fields map from the tournament record + fixtures (photo crop parity, band omitted when photo null, walkover rendering); deep link opens the right trophy; AR button hidden without AR support / on desktop; reduced-motion disables shake and auto-rotate; no schema or RPC surface changes.
- Constraints: tokens for everything except the scoped wood/brass decor, hard 2px ink borders, solid offset shadows (never blurred), mono data labels, ≥44px tap targets, stable pending controls per repo conventions.

---
