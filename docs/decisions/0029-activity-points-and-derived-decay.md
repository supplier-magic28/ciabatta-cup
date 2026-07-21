# ADR-0029: Activity points and permanent derived decay

- **Status:** Accepted
- **Date:** 2026-07-13
- **Superseded by:** ADR-0049 (tournament activity-date source only)

## Context

Public ladder points now reward participation, solo practice, and tournament placement. Players also need inactivity penalties without making a mutable daily counter authoritative. Ordinary Elo remains useful for seeding and historical analysis.

## Decision

The public ladder is a pure activity-points projection: ordinary ranked matches award +15 to each participant and +15 to the winner; exhibition and external matches award +10 per Ciabatta participant; approved practice awards +5; tournament placements retain their configured awards. Ordinary Elo is derived separately.

Starting with a player's first tennis day, every tennis-free Melbourne day permanently deducts one point. Every completed seven-day drought stretch deducts another ten and every completed thirty-day stretch deducts another thirty; these penalties stack. Any non-rejected match, approved practice, tournament match, or owner manual play mark resets both drought counters and prevents that day's daily deduction. Manual marks award no points. Totals are clamped at zero.

Current totals and decay-watch values are derived on read with an explicit as-of date. Persisted rating data remains a rebuildable snapshot and is refreshed after scoring mutations.

## Consequences

- Replaying immutable facts reproduces points and permanent historical deductions.
- The ladder advances at Melbourne date boundaries without a scheduled writer.
- Backdated approvals recompute the historical activity timeline.
- Practice does not protect a drought until approved; its practiced date applies once approved.
