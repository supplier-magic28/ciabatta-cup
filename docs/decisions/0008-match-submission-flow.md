# ADR-0008: Match submission flow — derived winner, deferred lifecycle, app-layer writes

- **Status:** Accepted (Phase 3c-part-1; builds on ADR-0001/ADR-0006)
- **Date:** 2026-07-10

## Context

Phase 3c-part-1 builds the log-match submission flow: the screen-03 wizard plus a
server action that persists a submission as immutable match facts. It is
deliberately submission-only — no confirm/approve, no scoring, no rating writes.
A few concrete choices arise in turning the design + schema into working code.

## Decision

**1. The winner is a derived, submitted fact — not a picker, not a rating.**
The form has no "who won?" control; `winner_id` is computed from the entered set
scores: a set is won on games, or on the tie-break when games are level, and the
match winner is whoever wins more sets. This keeps `winner_id` a *fact* (it falls
out of the score the players agree on) and stays clear of scoring/Elo (ADR-0001).
A score with no clear winner — a tied set with no deciding tie-break, or an equal
set count — is **rejected** with a friendly error rather than guessed.

**2. Validation is a shared pure function mirroring the DB constraints.**
`lib/match/submission.ts#validateSubmission` enforces can't-play-yourself,
valid enums, `custom`-only `format_note`, ≥1 sane set, and both-or-neither
tie-breaks — the same rules the DB checks (migration `20260710000000`). The
client runs it for instant feedback; the **server action re-runs it** against the
real session id (Server Functions are reachable by direct POST — never trust the
client). It is pure and tested, following the scoring-engine pattern.

**3. New matches start at `pending_confirmation`, and the submitter is
auto-confirmed.** The action writes the `matches` row (`status =
pending_confirmation`), its `match_sets`, and a `match_confirmations` row for the
submitter (who has implicitly confirmed by submitting). The
"both-confirmed ⇒ `pending_approval`" transition and exhibition auto-approve stay
**deferred** (ADR-0006) — this phase records facts, it does not advance the
lifecycle. No auto-approve, no scoring, no rating writes.

**4. Writes go through the user's authenticated client (RLS applies), with
app-layer compensation instead of a transactional RPC.** Because PostgREST
inserts aren't a single transaction, a failure after the `matches` insert is
handled by **deleting the just-created match** (cascading its children; permitted
by RLS for the non-approved submitter). We accept this over adding a DB
function/migration now; a transactional RPC is the follow-up only if it proves
necessary.

## Consequences

- **Submission works end-to-end against the schema** with friendly validation,
  and the "Your matches" list makes it visible — all without touching scoring.
- **The winner-derivation rule is a modelling choice, not tennis law** (tie-break
  decisive only when games are level; supplemental otherwise). If real tennis
  edge cases ever bite, revisit here.
- **The lifecycle is half-wired by design.** Part 2 adds the opponent-confirm and
  admin approve/query surfaces and the transitions the schema already supports;
  the compensating-delete and derived-winner rules carry forward.
- **Prerequisite:** the Phase 3a migration must be applied to Supabase for this
  flow to run live — it is still file-only (see STATUS.md).
