# ADR-0022: Tournament draw lock and lifecycle email delivery

- **Status:** Accepted
- **Date:** 2026-07-11

## Context

Generating a draw marks the event scheduled but leaves the field and fixtures
editable until the first result. The director needs an explicit moment when the
confirmed field becomes final, participants receive a locked-in message, and a
later game-day message can be sent without an external recipient list.

## Decision

Store an irreversible `draw_locked_at` milestone separately from tournament
status. A database function validates that the four-player group draw exists,
then locks it; participant and group-fixture triggers enforce the lock. The lock
action attempts the `locked_in` email, while `game_day` is a separate action.

Send custom lifecycle mail through Resend from server actions. Record delivery
per tournament, player, and email kind. A unique key claims each send before
contacting the provider; failed sends release their claim and can be retried.
Each provider request also carries a deterministic Resend idempotency key so a
network or database interruption cannot duplicate the accepted message.

## Consequences

- Tournament status describes progress; draw lock is a separate permanent act.
- Only active tournament players with an email address are recipients.
- Repeated clicks send only messages without a delivery record.
- Runtime configuration requires `RESEND_API_KEY` and
  `TOURNAMENT_EMAIL_FROM`.
- Result emails and scheduled delivery remain deferred.
