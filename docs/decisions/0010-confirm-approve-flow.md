# ADR-0010: Confirm/approve flow — advance via trigger, admin decisions via RLS

- **Status:** Accepted (Phase 3c-part-2; wires the lifecycle ADR-0006 deferred)
- **Date:** 2026-07-10

## Context

Phase 3a shipped the match schema with the full status enum but, per ADR-0006,
deferred the *lifecycle transitions* to "the confirm/approve phase". Part 1 built
submission (matches start `pending_confirmation`, submitter auto-confirmed). This
part wires the rest: the opponent confirms, and an admin approves / queries /
rejects. The mechanism for each transition is the decision to make, given the RLS
already in place.

## Decision

**1. The both-confirmed advance is a SECURITY DEFINER trigger.**
`advance_on_confirmation` (migration `20260710020000`) fires `AFTER INSERT` on
`match_confirmations`: when both participants have confirmed a
`pending_confirmation` match it sets `status = 'pending_approval'` (ranked) or
`'approved'` (exhibition — auto-approve, no admin step).

It must be a trigger, not a server action: the opponent who confirms has **no RLS
path to `UPDATE matches`** (only the submitter and admins do), so the transition
can't run under the opponent's client. A trigger keeps the invariant
("both confirmed ⇒ advance") in the database and composes with the immutability
guards — the update runs while `OLD.status = 'pending_confirmation'`, which
`enforce_match_immutable()` permits, and later confirmation inserts on an
auto-approved exhibition match are blocked.

**2. Admin approve / query / reject run as server actions under `is_admin()` RLS.**
Unlike the opponent, admins *can* `UPDATE matches` (`matches_update_admin`,
`is_admin()`), so `approveMatch` / `queryMatch` / `rejectMatch` use the admin's
own session client — RLS is the DB-level enforcement — plus a code role-check
(Server Actions are POST-reachable). Each guards that the match is currently
`pending_approval` before transitioning, so only the intended edges are allowed.

**3. Approve carries no scoring.** Approving only sets `status = 'approved'`.
Feeding approved ranked facts into `computeRankings` and materialising
`rating_history` / `rating_points` is the next, separate phase — kept out here to
stay reviewable.

## Consequences

- **The lifecycle is now end-to-end:** submit → opponent confirms → (ranked)
  admin approves, or (exhibition) auto-approved. The admin approvals surface lists
  `pending_approval` matches oldest-first (per SCHEMA).
- **`queried` is a one-way flag for now.** A queried match shows to the submitter
  as needing attention; re-submitting it back into the flow is deferred. There is
  also **no admin note** on a query/reject — the schema has no column for one;
  adding it (and the re-submit loop) is a later, ADR'd change if wanted.
- **Exhibition matches never reach the approvals queue** — they auto-approve on
  the second confirmation, matching "exhibition = record only".
- **Prerequisite:** migration `20260710020000` must be applied to Supabase for
  confirmation to advance status (file-only — see STATUS.md).
