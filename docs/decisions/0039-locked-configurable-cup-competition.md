# ADR-0039: Locked configurable cup competition

- **Status:** Accepted
- **Date:** 2026-07-18

## Context

The first tournament release assumed four named players, one short group
format, one full-set playoff format, and fixtures generated before a separate
draw lock. This prevented publishing a cup before its field was known.

## Decision

Cups are created atomically with two to eight seats and may initially have no
players or cover. Schedule, ordered roster, independent group/downstream
rulesets, and championship path change through row-locking organiser RPCs. A
reversible schedule lock gates competition configuration. Permanent draw lock
requires a cover and full field, atomically creates the complete N-player round
robin, and freezes competitive configuration. Crop metadata stays editable.

The supported score contracts are first-to-three games, one standard set, a
pro set to eight, and true best of three standard sets. Qualification ties at
the applicable cutoff are settled on court. Completion persists positions one
through N while points remain 100/50/20/10/0.

## Consequences

- Partial creation and image upload failure no longer lose the cup.
- The database, not the UI, owns configuration gates and permanence.
- Immutable match facts still drive standings and placements.
- Enum, additive, application, and enforcement steps ship separately.
