# Handoff: Ciabatta Cup — tennis match & tournament tracker

## Overview
Ciabatta Cup is a private tennis tracking app for a group of ~10 friends: an Elo-style ranked leaderboard, separate ranked vs exhibition records, match submission with admin approval, tournaments (round robin / knockout) with generated fixtures, and player profiles with vitals and head-to-head stats. The #1 player "holds the Ciabatta" — a bread-loaf trophy badge shown next to their name. Bread is the name + trophy motif only; the tone is otherwise a straight, data-forward competitive app.

**Start with SCHEMA.md** — this handoff's primary deliverable is the data model.

## About the design files
The bundled `.dc.html` files are **design references created in HTML** — they show intended look and behavior, not production code to copy. Recreate these designs in the target codebase's environment and patterns; if no codebase exists yet, choose an appropriate stack (the design assumes a web app, mobile-first, responsive to desktop).

- `Ciabatta Cup Screens.dc.html` — all 8 screens, mobile + desktop mockups side by side
- `Ciabatta Cup Art Directions.dc.html` — earlier art-direction exploration (context only; direction "3a Tournament Press" won, then typography was softened per the screens file)
- `players/*.png` — placeholder avatars cropped from the group's poster

## Fidelity
**High-fidelity.** Colors, type, spacing, and copy in the screens file are intentional. Recreate closely using the values below. (Exception: phone status bars / bezels are mockup chrome, not product UI.)

## Screens
Each section in the screens file is labelled 01–08, mobile first, desktop beside it.

1. **Leaderboard** (hero screen) — ranked list: rank number, movement arrow (▲ green / ▼ rust / — grey), avatar, name, W–L + streak, points. #1 row is inverted (dark card, green offset shadow) with the bread badge by the name. Green banner above: "The Ciabatta · held by {player} · {n} days". Filter chips: Ranked / Exhibition / All-time. Desktop adds columns (win %, last-5 dots) and a side rail: holder card, latest results, next tournament.
2. **Player profile** — dark hero with photo, name, nickname in quotes, rank/points/holder line; vitals grid (height, weight, plays, backhand) + style chip; separate **Ranked** and **Exhibition** record cards; points bar-trend; head-to-head bars; desktop adds streak card + match log.
3. **Log match** — 3-step flow: matchup (you vs opponent picker), type (Ranked = counts for points / Exhibition = record only), format chips (One set / Best of 3 / Pro set 8 / Custom), per-set score inputs with tiebreak, "Submit for approval". Note: ranked results need admin approval.
4. **Tournaments** — list (live with progress bar, upcoming with Enter CTA, completed with winner) + single-tournament view: standings table with qualification status, round/court schedule with resting player, final-rules card. Desktop: list rail + detail.
5. **Sign in** — email + password; brand panel with loaf-on-plinth logo and tagline "Earn your seed. Earn your bread."; CTA "Step on court"; Create account link.
6. **Admin dashboard** — stat cards (players / pending approvals / active tournaments / matches logged), pending submissions with Approve / Query actions (waiting state when opponent hasn't confirmed), live tournament card, activity feed.
7. **Create/manage tournament** — name, structure (Round robin / Knockout / Groups+KO), match format, counts-as, participant chips seeded by leaderboard, "Generate fixtures", bracket preview (byes for top seeds, Winner-of placeholders, final card).
8. **Manage players** — roster table: avatar, name (+ Admin badge), email, rank, record R/E, status (Active / Invited), actions (Edit · Deactivate / Resend · Revoke), Invite player CTA.

## Interactions & behavior
- Rank movement arrows compare current rank vs prior period; last-5 shown as win/loss dots.
- Match lifecycle drives UI state: pending confirmation → pending approval → approved (see SCHEMA.md).
- "High-def load flash": skeleton loaders use a bright sheen sweep (~1.2s ease-in-out) in the accent green over the surface color, instead of plain grey pulses.
- Buttons/cards use hard 2px ink borders with offset solid shadows (3–4px, no blur); press states can translate into the shadow.
- Mobile nav: bottom tabs Board / Matches / Cups / Profile (+ Admin for admins). Desktop: top nav.

## Design tokens
Colors:
- Cream background `#EFE6D0`; card surface `#F7F0DE`; highlighted row `#EDE9D2`; hairline `#D9CCAE`
- Ink (text/borders/dark surfaces) `#1B1A16`
- Green (primary, wins, ranked) `#3E6B35`; on-green muted `#BFD3B4`
- Chartreuse (accents on dark) `#C9DA5A`
- Crust brown (admin accent, trophy) `#8C5426`, gradient top `#C98A4B`, crumb `#F5E7CC`
- Rust (losses, drops) `#A0442C`; muted text `#8C8672`; muted-on-dark `#8A9188`

Typography (Google Fonts):
- **Bricolage Grotesque** — headings/names/buttons: 700; chips/labels: 600; mixed case (not all-caps)
- **IBM Plex Mono** — all data: scores, records, points, timestamps, small uppercase eyebrow labels (letter-spacing 1–2px)
- **Work Sans** — body/forms 400–600
- Wordmark: "CIABATTA CUP" uppercase Bricolage 700, "CUP" in green

Shape & depth: radius 6–8px (cards), 16–20px (chips/pills); borders 2px ink; shadows are solid offsets (`3px 3px 0 #1B1A16`, green/brown offsets for emphasis), never blurred.

The bread badge: small loaf (brown gradient, rounded-top rectangle, three diagonal crumb scores) — render as an SVG/icon asset in production; appears at ~22–30px wide next to the #1 name and on "The Ciabatta" cards.

## State management (minimum)
Session user + role; leaderboard (with movement); player profile stats; match submission draft (multi-step); pending approvals (admin); tournament + fixtures; invite states. All persistent — see SCHEMA.md for the source-of-truth model.

## Assets
- `players/*.png` — real photos from the group's poster; production should let players upload avatars.
- Bread trophy icon — currently CSS-drawn; recreate as SVG. A photographic loaf-on-trophy hero image may be supplied later for auth/empty states.

## Files
- `SCHEMA.md` — **data model (build this first)**
- `Ciabatta Cup Screens.dc.html` — hi-fi screens (open in a browser)
- `Ciabatta Cup Art Directions.dc.html` — art direction context
- `players/` — avatar images
