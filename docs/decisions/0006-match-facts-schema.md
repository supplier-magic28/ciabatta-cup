# ADR-0006: Match-facts schema — trigger-enforced immutability, deferred lifecycle

- **Status:** Accepted (implements ADR-0001/ADR-0003 for the matches phase)
- **Date:** 2026-07-10

## Context

Phase 3a builds the match half of the data model: `matches`, `match_sets`, and
`match_confirmations` (migration `20260710000000_matches_spine.sql`). These are
the **source-of-truth match facts** ADR-0001 is built around, so a few concrete
choices need pinning down as we translate `docs/SCHEMA.md` into a migration:

1. **How immutability is enforced.** ADR-0001 says an approved match is a frozen
   fact — never mutated; corrections are new facts. What mechanism enforces that,
   and does it apply to trusted backend contexts too?
2. **`tournament_id` / `fixture_id`.** SCHEMA lists these as nullable FKs, but the
   `tournaments` and `fixtures` tables don't exist yet (casual matches first).
3. **How much lifecycle behaviour to encode now**, given there is no UI and no
   scoring in this phase.

## Decision

**1. Immutability is enforced by triggers, and the seal is universal.**
`enforce_match_immutable()` (BEFORE UPDATE OR DELETE on `matches`) rejects any
change once `OLD.status = 'approved'`. The row still moves freely through its
pre-approval lifecycle — the UPDATE that sets `status → approved` is allowed
because `OLD.status` is still `pending_approval` — but from `approved` onward it
is sealed. Child rows are sealed too: `enforce_parent_match_immutable()` (via the
`match_is_approved()` SECURITY DEFINER helper) blocks INSERT/UPDATE/DELETE on
`match_sets` and `match_confirmations` whose parent match is approved, so an
approved score cannot be silently rewritten through a child table.

We use a **trigger** (not just RLS) for the same reason the `players` table does:
it catches paths that bypass RLS. The **deliberate difference** from the players
guard (ADR-0005) is that the match guard has **no `auth.uid() is null` backend
exemption**. ADR-0005 exempted backend contexts so an admin could be bootstrapped
from the SQL editor; there is no analogous need to *edit an approved match fact*,
and ADR-0001 says facts are never mutated by anyone — service role included. If a
repair is ever genuinely unavoidable, a migration disables the trigger
explicitly; silent edits are never allowed.

**2. `tournament_id` / `fixture_id` are plain nullable `uuid` columns for now** —
not foreign keys — because their target tables don't exist. The FK constraints
are added in the tournaments/fixtures phase. Column comments record this.

**3. Lifecycle *transitions* are deferred; the schema only *supports* them.**
This migration is schema + RLS. It does **not** automate: auto-confirming the
submitter, the "both confirmed ⇒ `pending_approval`" transition, or exhibition
auto-approve. Those are behaviour, belong with the confirm/approve surfaces, and
have no way to be exercised until that phase — so they land there, not here.

**Supporting constraints** worth noting: a match's `submitted_by` must be one of
its two participants (mirrors the RLS submit rule); `winner_id`, when set, must be
a participant; an `approved` match must have a `winner_id`; `format_note` is
allowed only for `format = 'custom'`; a set's tiebreak fields are both-or-neither.

**RLS** reuses `is_admin()`: all authenticated players read approved matches;
participants read/submit/confirm their own; the submitter may edit their own
non-approved match (e.g. after it is queried back); admins approve/query/reject.

## Consequences

- **ADR-0001 holds at the database.** An approved match and its sets are frozen
  for everyone; "corrections are new facts" is enforced, not just documented.
- **The universal seal is intentionally strict.** There is no in-band admin
  "edit an approved match" — by design. The escape hatch is an explicit migration
  that disables the trigger, which leaves a reviewable trail.
- **Scoring stays untouched.** `winner_id` is a *submitted* fact (who won the
  games), not a computed one, so recording matches needs no Elo. `computeRankings`
  remains the stub; the real formula is the next phase (tests-first, ADR-0001).
- **Follow-ups:** the tournaments/fixtures phase adds the deferred FK constraints
  on `tournament_id`/`fixture_id`; the confirm/approve phase adds the lifecycle
  transitions (and gets its own ADR if it makes a decision, e.g. how approval
  writes `rating_history`).
