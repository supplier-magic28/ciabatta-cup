/**
 * Design tokens — the source of visual truth for `components/`, from the
 * design-reference handoff. The canonical values also live as CSS variables in
 * `app/globals.css` (`@theme`), which is what Tailwind utilities resolve
 * (`bg-cream`, `text-ink`, `font-heading`, …). This module mirrors them for use
 * in TS (e.g. inline SVG fills) — keep the two in sync.
 */

export const tokens = {
  color: {
    cream: "#efe6d0", // app background
    surface: "#f7f0de", // card / input surface
    row: "#ede9d2", // highlighted row
    hairline: "#d9ccae", // hairline borders
    ink: "#1b1a16", // text, 2px borders, dark surfaces
    green: "#3e6b35", // primary, wins, ranked
    greenMuted: "#bfd3b4", // on-green muted
    chartreuse: "#c9da5a", // accent on dark
    crust: "#8c5426", // admin accent, trophy
    crustTop: "#c98a4b", // loaf gradient top
    crumb: "#f5e7cc", // crumb scores
    rust: "#a0442c", // losses, drops
    muted: "#8c8672", // muted text
    mutedDark: "#8a9188", // muted text on dark
  },
  font: {
    heading: "var(--font-heading)", // Bricolage Grotesque — headings, names, buttons
    mono: "var(--font-mono)", // IBM Plex Mono — data, labels, eyebrows
    body: "var(--font-body)", // Work Sans — body, forms
  },
  radius: {
    card: "8px", // cards / inputs (6–8px)
    pill: "18px", // chips / pills (16–20px)
  },
  border: "2px solid #1b1a16", // hard 2px ink border
  shadow: {
    ink: "3px 3px 0 #1b1a16", // solid offset shadow, never blurred
  },
} as const;

export type Tokens = typeof tokens;
