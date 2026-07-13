# ADR-0031: Shared courts and metadata-only surface tags

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

Free-text locations preserve history but cannot support court reuse, surface records, or duplicate cleanup. Surface data also needs to be added retrospectively without reopening approved scores or changing activity points and Elo.

## Decision

Locations resolve by trimmed, case-insensitive name to shared `courts` rows. Unknown names create courts implicitly; legacy location text remains populated. Organisers merge duplicates by rewriting structured foreign keys and retaining the source row as an alias whose resolver follows `merged_into`.

`surface` is optional match metadata. Either participant or an organiser may change court/surface metadata after approval. The immutable-match trigger permits only `court_id`, `surface`, legacy `location`, and the automatic `updated_at` change; score, winner, participants, status, points inputs, and every other fact remain frozen. Metadata edits are recorded in `activity_log`.

Zeus notifications have a dedicated inbox and safe internal target path. Untagged-match nudges are deduplicated to at most one per player per seven days and send no email.

## Consequences

- Court creation never blocks or loses a typed location.
- Surface records and court tallies remain derived from match facts.
- Court merges preserve old names while producing one canonical reporting identity.
- Approved result corrections still require new facts; only descriptive court/surface metadata can be repaired in place.
