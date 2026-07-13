# ADR-0032: Transactional and realtime Zeus notifications

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

Application-side notification inserts were separate from planned-match status
writes, their errors were ignored, and an already-open receiver session had no
push or recovery mechanism. A sender could therefore see success while the
receiver saw no message, or the receiver could have a valid row but a stale
badge until navigation.

## Decision

Planned-match notification fan-out is a database trigger on shell insertion and
status transitions. Notification creation therefore succeeds or fails with the
transition, uses stable per-player dedupe keys, and includes final-result
confirmation. The notifications table is published through Supabase Realtime.
Authenticated clients subscribe with a `player_id` filter while the existing
owner-select RLS policy remains the authorization boundary.

The header refreshes on receiver inserts and read-state updates. Window focus
and visibility recovery perform a server refresh in case a websocket event was
missed while the app was suspended.

## Consequences

- A successful planned lifecycle transition cannot silently omit its receiver
  notification.
- Open receiver sessions update without manual navigation or reload.
- The database remains authoritative for fan-out; email delivery stays a
  separate non-blocking lifecycle side effect.
