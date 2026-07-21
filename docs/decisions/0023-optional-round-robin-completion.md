# ADR-0023: Optional round-robin tournament completion

- **Status:** Accepted
- **Date:** 2026-07-11
- **Superseded by:** ADR-0046 (director qualification-override scope only)

## Context

The first qualifier may not need the planned full-set final and third-place
match once all six round-robin results are known. The director needs to end the
event from that table without deleting already-generated fixtures or inventing
match results, while retaining the option to continue to the final stage.

## Decision

Keep tournament status as operational state and record the chosen completion
path separately as `round_robin` or `final_stage`. After all group fixtures
are approved, the director may explicitly make the standings final. A tied-wins
boundary between second and third still requires the existing on-court decider.
Unplayed final and third-place fixtures are preserved with `skipped_at`; they do
not become match facts and do not affect Elo.

Round-robin completion derives the champion and placements from group standings,
with the decider winner placed second and loser third when required. Final-stage
completion continues to derive the champion from the approved final.

## Consequences

- Early completion is explicit and atomic, never automatic.
- Once either final-stage fixture has a match, standings can no longer end the
  tournament.
- Existing generated-but-unplayed final fixtures can be safely marked skipped.
- Post-tournament email remains deferred until both paths expose stable final
  placement data.
