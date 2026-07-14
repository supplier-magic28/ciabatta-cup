# ADR-0036: RPC lifecycle boundaries and versioned derived caches

- **Status:** Accepted
- **Date:** 2026-07-18

## Context

Core match workflows had accumulated a mixture of application-side write
sequences, service-role participant mutations, and narrowly different score
validators. A lifecycle could commit while a cache rebuild or email failed,
yet the caller sometimes received a generic failure and retried the fact
creation. Concurrent rebuilds also had no way to prove that the facts read at
the start still matched the facts when the snapshot was installed.

## Decision

Authenticated lifecycle changes cross PostgreSQL through row-locking RPCs.
Creation operations accept a stable UUID operation key, status graphs and score
invariants are guarded in the database, and reviewed facts remain immutable.
The application uses service-role access only to read complete facts for public
derived projections and secondary delivery work, never to bypass participant
write boundaries.

Points-affecting facts increment a singleton version. Cache replacement takes
an advisory lock and accepts only a snapshot built from the current version;
the application retries one version race. A committed lifecycle is returned as
success even when cache or email work fails, with a typed recovery warning.
Lifecycle email attempts are recorded in a provider-keyed delivery ledger.

The rollout is deliberately split: an additive migration lands the new
interfaces first, application code moves to them, and a later enforcement
migration removes obsolete direct-write policies and old RPC grants.

## Consequences

- Retries cannot duplicate newly created match or planned-shell facts.
- Every result path shares one database score contract and atomic rollback.
- Cache drift is observable and stale snapshots cannot overwrite newer facts.
- Operators can distinguish a failed transition from a committed transition
  whose derived cache or email needs recovery.
- Production deploys require the documented additive, application, smoke-test,
  enforcement, health-audit, and rebuild sequence.
