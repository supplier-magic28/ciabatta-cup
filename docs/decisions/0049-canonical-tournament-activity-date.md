# ADR-0049: Canonical tournament activity date

- **Status:** Accepted
- **Date:** 2026-07-22
- **Supersedes:** ADR-0016 tournament-result timestamp ownership; ADR-0029 tournament activity-date source only

## Context

Cup scores were entered by an organiser after play, and the application passed
that entry instant as `matches.played_at`. Placement awards already replayed on
the tournament start. The same cup therefore awarded points on one Melbourne
day but reset drought on another, allowing false historical decay to consume
placement points. Approved match facts cannot be rewritten to repair this.

## Decision

A cup is a single-day event and `tournaments.starts_at` is its canonical tennis
day. The tournament-result RPC keeps its deployed v2 signature but ignores the
compatibility timestamp and writes the locked event start. Activity, decay,
streak, reign, public projection, and cache rebuild inputs normalize legacy cup
match timestamps to the joined tournament start without mutating stored facts.

A non-rejected match changes the scoring source version when its tennis-day
contribution changes. Approval changes version separately only when it adds or
removes a non-tournament award; unrelated status and metadata writes remain
version-neutral.

## Consequences

- Rebuilding restores historical placement awards before only legitimate
  post-event decay, while preserving every approved score and raw timestamp.
- Ordinary match dates and ordinary Elo chronology are unchanged.
- Future cup results cannot drift according to when a director enters them.
- Multi-day cups would require a new explicit per-fixture date model and a
  superseding decision rather than overloading the single event start.
