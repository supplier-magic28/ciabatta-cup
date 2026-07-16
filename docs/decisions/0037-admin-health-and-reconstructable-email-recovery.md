# ADR-0037: Admin health and reconstructable email recovery

- **Status:** Accepted
- **Date:** 2026-07-18
- **Superseded by:** ADR-0042 (custom-email health and recovery scope only)

## Context

ADR-0036 made cache drift, lifecycle inconsistencies, infrastructure contracts,
and email failures observable, but the organiser still needed the Supabase SQL
Editor and server logs to interpret them. The delivery ledger retained safe
diagnostics but offered no in-product recovery path.

## Decision

Expose one privacy-safe, admin-gated health snapshot through
`core_backend_health_v1()` and render it at `/admin/health`. The snapshot returns
cache versions, integrity issue identifiers, actionable delivery metadata, and
required trigger/Realtime presence; it never returns recipient addresses,
practice notes, or external-opponent names.

Failed and fifteen-minute-stale lifecycle emails may be retried only when their
content can be reconstructed from canonical match, planned-match, practice, and
player facts. The server re-reads the ledger row and recipient, reuses the
original provider idempotency key, and increments the durable attempt count. No
email body or arbitrary destination is accepted from the browser or stored for
recovery. Unknown kinds remain diagnostic and require manual handling.

## Consequences

- The organiser can measure and recover core backend health without database
  access.
- Provider idempotency makes ambiguous delivery retries safe.
- Health remains pull-based and right-sized; no scheduler, worker, or external
  monitoring service is introduced.
- Applying the additive health migration remains required before deploying the
  route that calls its RPC.
