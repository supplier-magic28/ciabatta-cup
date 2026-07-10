# Design Implementation Guide

This is the maintained bridge between the application and the approved Claude
design handoff. It records what the product implements today; it does not
replace the raw handoff artifacts.

## Sources of truth

- Raw reference screens and art direction:
  `design-reference/design_handoff_ciabatta_cup/`.
- Authoritative design tokens: `components/tokens.ts` and the matching CSS
  theme in `app/globals.css`.
- Shared production UI vocabulary: `components/README.md`.

Do not edit the files in `design-reference/`. When a screen or reusable visual
pattern changes, update this guide and the component inventory in the same task.

## Screen coverage

| Handoff screen | Production route | State | Current gap |
| --- | --- | --- | --- |
| 01 Leaderboard | `/` | Partial | Holder history, reign duration, profile links, earned ratings, zero-point unranked states, records, and movement are live; filters, last-five form, and side rail are pending. |
| 02 Player profile | `/players/[playerId]` | Partial | Hero, records, points history, head-to-head, and match log are live; avatar upload/editing and richer trend interaction are pending. |
| 03 Log match | `/matches`, `/matches/new` | Partial | Submission, confirmation, history, and score validation are live; the flow is not yet a full visual recreation of every handoff state. |
| 04 Tournaments | `/tournaments`, `/tournaments/[tournamentId]` | Implemented | Event cards, live standings, qualification state, round/court schedule, results, final rules, and champion are live. Self-entry and multi-structure filtering remain deferred. |
| 05 Sign in | `/sign-in`, `/sign-up`, `/accept-invite` | Implemented | Sign-in, signup, and invite password setup use the token-driven auth shell. |
| 06 Admin dashboard | `/admin/approvals`, `/admin/players` | Partial | Approval queue and roster exist as focused routes; dashboard stats and activity feed are pending. |
| 07 Manage tournament | `/admin/tournaments/new`, `/admin/tournaments/[tournamentId]` | Partial | Four-player round-robin setup, deterministic fixture generation, reviewed admin result entry, decider planning, finals, and completion are live. Knockout preview and mid-event roster changes are deferred. |
| 08 Manage players | `/admin/players` | Partial | Invite, roster status, and safe deletion of unused players are live; edit, deactivate, resend, and revoke flows are pending. |

## Implementation rules

- Reuse tokens and shared components before adding page-specific styling.
- Keep the handoff's mobile-first information hierarchy, hard borders, solid
  offset shadows, and typography roles intact.
- A new shared component requires an entry in `components/README.md`.
- A changed route or screen state requires an update to the table above and to
  `STATUS.md` when it changes the current product capability.
