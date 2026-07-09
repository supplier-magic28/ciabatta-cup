/**
 * Design tokens — the single source of visual truth for `components/`.
 *
 * PLACEHOLDER awaiting the design handoff. Values are intentionally empty so
 * nothing depends on guessed styling yet. When design lands, fill these in (or
 * mirror them into Tailwind's theme) and build components against them — never
 * hard-code colours/spacing in a component.
 */

export const tokens = {
  color: {
    // e.g. background, foreground, brand, rank1 ("the Ciabatta")…
  },
  space: {
    // spacing scale, e.g. xs / sm / md / lg…
  },
  radius: {
    // corner radii, e.g. sm / md / full…
  },
  font: {
    // families / sizes / weights…
  },
} as const;

export type Tokens = typeof tokens;
