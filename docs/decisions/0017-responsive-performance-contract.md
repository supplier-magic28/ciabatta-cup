# ADR-0017: Responsive performance contract

- **Status:** Accepted
- **Date:** 2026-07-10

## Context

Server-rendered routes and conservative match workflows protect data integrity,
but slow network responses previously left blank route transitions and controls
that did not visibly acknowledge a click. Match-heavy pages also fetched sets in
a second query after their match rows, adding a full network wave to small read
models. The application needs to feel immediate without implying that an
immutable score, approval, rating, or player change succeeded before the server
confirms it.

## Decision

Every mutation exposes an immediate, dimension-stable pending state. Pending
controls are disabled, carry `aria-busy`, retain an accessible action label, and
return to their usable state on failure. Success and error messages use polite
announcements. Data remains visually unchanged until the server action or RPC
succeeds; immutable facts and synchronously rebuilt ratings are never updated
optimistically.

App Router `loading.tsx` boundaries provide route-shaped skeletons for current
screens. Skeletons reserve the final layout's major dimensions, use a solid
opacity pulse, and stop animating under reduced-motion preferences. A shared
route error boundary provides a retry path for failed reads. Next.js link
prefetch and streaming remain the navigation mechanism; no duplicate global
progress indicator is added.

Match history, approvals, player profiles, and tournament boards embed
`match_sets` in their existing Supabase match selects and start independent
reads together. A pure adapter owns embedded-set ordering and score mapping.
Persistent caches, background jobs, and speculative indexes are deferred until
a measured production problem justifies their complexity.

## Consequences

- Users receive feedback within the next rendered frame without duplicate
  submissions or layout-changing button content.
- Slow routes show recognisable page structure and recover from read failures.
- Four match-heavy surfaces remove one dependent Supabase query wave.
- Browser budgets protect button geometry, accessibility, mobile overflow, and
  reduced-motion behaviour using the production build's compiled CSS.
- Mutations can still take as long as their server work requires, including the
  synchronous Elo rebuild after approval; the UI reports that honestly.
- Production caching and analytics remain separate, evidence-driven decisions.
