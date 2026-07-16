# ADR-0042: One durable outbox for custom product email

- **Status:** Accepted
- **Date:** 2026-07-18
- **Supersedes:** ADR-0022 (custom lifecycle-email ledger/retry scope only); ADR-0037 (custom-email health and recovery scope only)

## Context

Custom email used separate tournament and lifecycle ledgers, while RSVP mail
updated an invitation timestamp directly. Claims, failure state, recipient
validation, health visibility, and warning behaviour therefore varied by the
event that happened to send the message. Some helpers also allowed incomplete
delivery context, making safe reconstruction impossible.

## Decision

All custom product email uses one service-role-only `custom_email_outbox` keyed
by provider idempotency key. Every intent requires kind, canonical player,
entity type, and entity ID. Enqueue rejects a key reused for different context;
claim atomically moves pending, failed, or fifteen-minute-stale work to
processing; sent and failed RPCs close the attempt with a provider receipt or a
bounded safe diagnostic. Obsolete pending, failed, or stale-processing intent
can move to terminal `superseded` with `superseded_at`; a current processing
claim blocks supersession and a sent provider receipt remains terminal. A
repeated sent acknowledgement must carry the same provider receipt; it cannot
rewrite a terminal send with another ID. Health
counts superseded rows for audit but excludes them from actionable recovery.

Lifecycle database triggers/RPCs enqueue reconstructable match, planned-match,
practice, draw-lock, RSVP, and all 1-8 placement-result intents in the
authoritative transaction. Explicit lifecycle sends atomically enqueue the
complete active-roster target set before provider work begins. The application
attempts provider delivery synchronously after commit, validates the supplied
address against the current player fact, and uses the same durable claim
contract for retry. The interface intentionally leaves a worker seam without
adding worker machinery today.

Supabase Auth confirmation, invitation, and recovery mail remains provider-
owned because its token content and delivery state are not reconstructable from
product facts. Legacy delivery ledgers remain read-only historical diagnostics;
reconstructable rows are backfilled into the unified outbox. Upgrade
reconciliation preserves recent legacy claims as processing, promotes legacy
`sent` receipts and `failed` diagnostics into already-created conflicting
outbox rows, and never rewrites a receipt already sent by the unified contract.
Final enforcement revokes direct ledger mutation so all state changes pass
through the claim/mark/supersede RPC contract.

## Consequences

- Match, planned, practice, tournament, and RSVP mail share one retry and health
  contract.
- Provider retries cannot change the authoritative lifecycle or duplicate a
  message with the same idempotency key.
- A replacement RSVP generation cannot race a live delivery claim, and its
  obsolete predecessor cannot later reappear as recoverable delivery work.
- `/admin/health` can expose every actionable custom kind without storing email
  bodies or accepting destinations from the browser.
- Applying the outbox migration before workflow-consistency hardening is
  mandatory because the latter enqueues through this interface.
- Synchronous attempts remain right-sized for the current app; a future worker
  can claim the same rows without changing lifecycle APIs.
