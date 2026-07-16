# ADR-0043: Workflow consistency, precise scoring versions, and atomic cup completion

- **Status:** Accepted
- **Date:** 2026-07-18
- **Supersedes:** ADR-0015 (deletion-eligibility dependency scope only)

## Context

The hardened core still had several cross-workflow inconsistencies. An admin
role could retain mutation authority after the profile became inactive; player
deletion checked ordinary matches but not every historical fact; RSVP resend
could erase acceptance and duplicate Zeus; scoring version triggers reacted to
non-scoring writes; queried notifications could overlap; and application code
could write tournament advancement and placements in separate steps. Practice
creation also remained a direct insert without the stable retry identity used
by the other immutable-fact creation workflows.

## Decision

An authenticated domain mutation requires an active player, and organiser
authority requires both active status and the admin role. Inactive identities
retain permitted historical reads. Hard deletion first calls a trusted blocker
projection covering every historical fact family; any blocker requires
deactivation instead.

Scoring version triggers advance only when the canonical activity projection
changes. Court/surface edits, pending submissions, and status noise do not
create drift. Owner-scoped metadata completion and queried-result fan-out use
deduped RPC/trigger contracts.

Practice creation uses a form-stable UUID and `submit_practice_v1` with a
unique player/operation-key identity. A matching retry returns the original
pending fact, and its insert trigger creates one reusable email intent. The key
is nullable only for rolling compatibility with the previously deployed
direct-insert client. A retry is matching only when activity, minutes, date,
and normalized note are identical; the same key cannot alias another claim.

RSVP v2 uses row locks and generations. Accepted is terminal; expired/new
invitations receive a new generation and generation-specific Zeus/email keys;
delivery retry changes only outbox state. Existing v1 signatures remain safe
wrappers over v2 during compatible rollout. Response locks the tournament
before the invitation row, and an independent history trigger preserves
accepted facts and legal generation evolution.

Tournament group-draw replacement, pre-lock participant substitution, cover
metadata, and championship stage installation each have a validated RPC.
`tournament_standings_v1` is the deterministic ordering shared by advancement
and completion. `canonical_tournament_placements_v1` derives the sole valid
placement order from approved fixtures; the client payload is only an exact
retry checksum. Tournament completion, the complete unique 1-N placement set,
and all result-email intents commit in one transaction; cache rebuild remains
post-commit. Backend health v5 compares participant and placement sets, not
only counts.

Match rows carry `lifecycle_revision`, incremented by status transition, so a
new correction cycle gets a new actionable notification identity while retries
in one state and terminal outcome delivery remain deduped.

RLS policy does not imply a clean-stack SQL grant. The additive invariant
migration supplies the exact rolling grants and canonical RPCs first. The
application deploys and passes health/smoke checks before a separate enforcement
migration removes direct practice, RSVP, email-ledger, tournament, participant,
fixture, placement, and completion mutation paths. Transaction-local markers
allow championship stage and finalisation writes only inside their validated
RPCs.

## Consequences

- Deactivated organisers cannot mutate data through stale role authority.
- Historical identities cannot be hard-deleted merely because they lack an
  ordinary match.
- Cache drift now signals scoring-source change rather than metadata traffic.
- Retrying a practice form cannot duplicate the claim or its logged-email
  intent, or reuse its operation key for another payload.
- RSVP retry cannot destroy player intent or create duplicate notifications.
- A cup cannot be visible as completed while placement awards are partial.
- Advancement, group-draw replacement, roster substitution, placement, and
  completion cannot be partially written by an authenticated table client.
- A second queried/correction cycle can notify again without weakening retry
  dedupe inside one lifecycle revision.
- The additive migrations depend on ADR-0042's outbox and must be applied in
  order through 129; compatibility wrappers/grants allow the app to roll
  forward before migration 130 enforces RPC-only mutation.
- Clean-stack enforcement explicitly grants the trusted service role read
  access to the current public fact model and `players.role` bootstrap, while
  invited browser identities receive only the `status`/`joined_at` columns
  constrained by RLS and the one-way activation trigger.
