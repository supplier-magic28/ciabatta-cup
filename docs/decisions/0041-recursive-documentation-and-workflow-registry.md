# ADR-0041: Recursive documentation and a canonical workflow registry

- **Status:** Accepted
- **Date:** 2026-07-18

## Context

The repository has strong architectural records, but the current behaviour of
one lifecycle can still be spread across an old ADR, a newer migration, a
Server Action, and an email helper. That makes it too easy to start work from an
outdated decision, preserve an accidental inconsistency, or finish a change
without teaching the next session what was learned. A documentation check that
only proves that files exist cannot prevent that drift.

## Decision

`docs/WORKFLOWS.md` is the canonical current-state registry for consequential
product workflows. Each workflow has a stable ID and records its actors,
transaction boundary, transitions, idempotency, approval and scoring effects,
Zeus and email delivery contracts, recovery result, tests, and any intentional
exception or active debt. ADRs remain the append-only history of why those
contracts exist; `docs/decisions/README.md` indexes their status and explicit
supersession chain.

Every task starts by classifying the subsystem it can affect and reading the
mapped current docs plus the relevant current ADR chain. Every functional task
finishes by updating `STATUS.md` and every document selected by the impact
matrix. A diff-aware documentation check enforces that mapping against the
merge base. The completion review asks: "What did this task reveal that a future
session should not rediscover?" Durable answers become a maintained document,
test, invariant, or automated check before the work is complete.

Only committed, maintained repository material may be a canonical design or
architecture reference. Untracked archives and externally supplied files may
inform a task, but durable knowledge from them must be promoted into a tracked
document, test, token, or deliberately committed reference artifact.

## Consequences

- A new session has one current lifecycle map and an explicit route into its
  historical decisions instead of reconstructing behaviour from code first.
- Workflow differences must be labelled intentional or debt; accidental
  approval, notification, scoring, and email variants become visible.
- Functional changes cannot pass the documentation-impact gate by claiming that
  documentation was unaffected.
- The documentation system improves recursively: discoveries from today's work
  reduce the investigation needed by the next task.
- The checks add maintenance work when a contract changes, but the work stays
  proportional because only diff-mapped documents are required.
