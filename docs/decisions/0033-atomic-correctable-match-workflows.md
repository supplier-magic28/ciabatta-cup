# ADR-0033: Atomic, correctable match workflows

- **Status:** Accepted
- **Date:** 2026-07-16
- **Supersedes:** The partial transition mechanics in ADR-0030 and ADR-0032

## Context

Planned result submission, participant confirmation, match materialisation, and
shell advancement were separate application writes. Errors after the first
write could strand a shell, invited players were given the wrong opponent
perspective, and queried results had no path back to confirmation. Notification
fan-out covered only part of that lifecycle and did not include ordinary match
confirmation or organiser approval.

## Decision

Consequential lifecycle transitions run in authenticated, row-locking database
RPCs. A planned proposal stores scores from its submitter's perspective; the
materialisation RPC normalises sets to the immutable match's player order.
Score entry begins only after the scheduled instant. Corrections are append-only
proposal revisions authored by an organiser and must be confirmed again by the
other participant. Approved facts remain immutable.

Database triggers notify the affected participant or every active organiser for
ordinary confirmation, planned confirmation/correction, organiser review, and
terminal decisions. Repeatable proposal alerts dedupe by proposal revision.

## Consequences

- Partial match/proposal/shell commits are eliminated and retries are safe.
- Every unfinished planned match remains discoverable in the private match hub.
- Queries are recoverable without rewriting either the submitted proposal or an
  approved match fact.
- Enum additions remain in a separate ordered migration because PostgreSQL
  requires them to commit before later functions can consume the values.
