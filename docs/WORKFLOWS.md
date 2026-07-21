# Consequential workflow registry

This is the canonical **current-state** map for product lifecycles. ADRs explain
why these contracts evolved; migrations, tests, and this registry describe what
new work must preserve now. Update the relevant stable `WF-nnn` section whenever
an action, RPC, status, approval, notification, email, scoring, or recovery path
changes.

All domain actors below must have `players.status = active`. Inactive members
retain historical read access only. "Custom email" means the reconstructable
`custom_email_outbox` contract; Supabase Auth mail is the explicit exception in
WF-012. A **committed warning** means the authoritative transaction succeeded
but cache or delivery recovery remains available at `/admin/health`.

## Shared invariants

- Consequential state transitions use authenticated, row-locking PostgreSQL
  RPCs with explicit grants and database status guards.
- RLS and SQL privileges are independent. After the additive RPC/application
  rollout, enforcement revokes direct practice, RSVP, email-ledger, tournament,
  participant, fixture, placement, and completion mutation paths; transaction-
  local guards admit stage/placement/completion writes only from their RPCs.
- Creation retries use a stable operation key where the workflow creates an
  immutable match or plan. Notifications and email use per-recipient dedupe or
  idempotency keys.
- Only changes to approved scoring inputs advance `scoring_cache_state.fact_version`.
  Pending/status noise and court/surface metadata do not.
- Zeus rows are inserted in the transaction that creates the event. Custom
  email intents are durable before provider delivery; delivery is attempted
  synchronously today and can move to a worker without changing the intent.
- A sent custom-email receipt is terminal: repeating the same receipt is safe,
  but a different provider ID cannot rewrite it. Upgrade reconciliation keeps
  recent legacy claims processing and promotes conflicting legacy `sent` or
  `failed` outcomes into an already-created outbox row; all email ledgers then
  become RPC-write-only.
- Cache or provider failure never rolls back or disguises a committed sporting
  fact. The caller receives success plus a recovery warning where the UI owns a
  synchronous attempt.

## WF-001 - Ordinary member match

| Contract | Current behaviour |
| --- | --- |
| Actor/status | Active member submits against a different active member; that opponent confirms; an active organiser reviews ranked results. |
| Transaction boundary | `submit_match_v3` writes match, sets, and submitter confirmation. `confirm_match_v1`, `review_match_v2`, and `resubmit_queried_match_v3` own later transitions. |
| Transitions | Both confirmations move ranked to `pending_approval` and exhibition directly to `approved`. Organiser review moves ranked to `approved`, `queried`, or `rejected`; a queried submitter resubmits to confirmation. |
| Idempotency | Stable `matches.operation_key`; one confirmation per participant; matching terminal review retry returns the existing result. `matches.lifecycle_revision` advances only on a status transition, so each queried/corrected cycle receives a new confirmation/review identity while retries in one state and terminal approved/rejected fan-out remain deduped. |
| Approval | Ranked requires opponent confirmation plus organiser approval. Exhibition auto-approval after both confirmations is **intentional**. |
| Scoring | Only `approved` counts. Ranked: +15 each, +15 winner, and ordinary Elo. Exhibition: +10 each and no Elo. Approval/removal advances fact version. |
| Zeus/dedupe | Opponent confirmation request, active-organiser review request, and terminal outcome; queried work targets only the submitter. Per-recipient dedupe keys are transactional. |
| Email/recovery | Existing product coverage sends `ranked_match_logged` to both players; exhibition has no custom email. Intent is stored with match creation, provider attempts use the unified outbox, and failed/stale rows appear in health. |
| Post-commit result | Creation/confirmation/review return success with a delivery or cache warning when applicable. |
| Contract tests | pgTAP `core_workflows`, `core_backend_hardening`, and `transaction_invariants`; match action, submission, scoring, notification, email-ledger, and post-commit unit tests. |
| Classification | Ranked/exhibition approval and email differences are **intentional** product rules. |

## WF-002 - Organiser-entered member match

| Contract | Current behaviour |
| --- | --- |
| Actor/status | Active organiser records a result between two distinct active members. |
| Transaction boundary | `admin_log_match_v2` validates the complete score, stores the organiser audit ID, and seals the fact in one transaction. |
| Transitions | Created directly as `approved`; no confirmation or review rows are manufactured. |
| Idempotency | Stable operation key and unique match fact; Zeus keys dedupe both recipients. |
| Approval | Immediate organiser approval is **intentional** because the acting organiser is the audit authority. |
| Scoring | Same approved ranked/exhibition activity and Elo rules as WF-001; the committed fact advances fact version once. |
| Zeus/dedupe | Both participants receive an organiser-entered result notification with no requested action. |
| Email/recovery | No custom email is currently triggered; Zeus is the product notification. |
| Post-commit result | Success may include a cache-rebuild warning. |
| Contract tests | pgTAP `core_workflows`; admin match action, validation, scoring, and notification tests. |
| Classification | Direct approval and Zeus-only delivery are **intentional** exceptions. |

## WF-003 - Non-Ciabatta external result

| Contract | Current behaviour |
| --- | --- |
| Actor/status | Active owner records a result against an owner-private external identity. |
| Transaction boundary | `log_external_match_v2` creates the optional saved opponent, immutable result, details, and sets atomically. `delete_own_external_match` is the narrow owner correction path. |
| Transitions | Created directly as `approved`; owner deletion is allowed only for this external fact type. |
| Idempotency | Stable operation key; owner-scoped delete; provider key `external-match/<match>/<player>`. |
| Approval | Immediate approval is **intentional**; there is no league opponent or organiser gate. |
| Scoring | +10 to the owner, win or loss; no Elo and no public opponent identity. Insert/delete advances fact version and rebuilds the projection. |
| Zeus/dedupe | No result-lifecycle Zeus event; a missing-metadata nudge may apply under WF-011. |
| Email/recovery | `external_match_logged` to the owner via the unified outbox. |
| Post-commit result | Success may include combined cache and delivery recovery warnings. |
| Contract tests | External match action/submission/email/history tests plus scoring materialisation contracts. |
| Classification | Immediate approval, owner deletion, privacy, and no lifecycle Zeus are **intentional**. |

## WF-004 - Planned member match and result

| Contract | Current behaviour |
| --- | --- |
| Actor/status | One active member proposes; the active opponent accepts/declines; either participant submits after the scheduled instant; the other confirms; an active organiser handles ranked approval/correction. |
| Transaction boundary | `create_planned_match_v1`, `respond_planned_match_v1`, `submit_planned_result_v2`, `approve_planned_result_v2`, correction RPCs, and `review_match_v2` each own a row-locked transition. |
| Transitions | `proposed` -> `locked_in`/`declined`/`cancelled`; result proposal -> participant confirmation; exhibition materialises approved, ranked materialises for organiser review; queried proposals use append-only superseding correction rows. |
| Idempotency | Stable plan operation key; one current proposal revision; result approval is repeatable; Zeus and email keys include plan/recipient and proposal revision where needed. |
| Approval | Exhibition completes after participant agreement. Ranked also requires organiser approval. Correction returns to participant agreement. |
| Scoring | No plan or proposal scores. Only the materialised approved fact follows WF-001. |
| Zeus/dedupe | Transactional proposal, decline/cancel, lock, approval, correction, and final-confirmed events; planned correction owns its cards so ordinary queried fan-out does not duplicate them. |
| Email/recovery | `planned_locked` and `planned_confirmed` for each member through the unified outbox; the provider attempt is non-blocking and reconstructable. |
| Post-commit result | Transition success is preserved; cache warning is returned when a materialised approved result cannot rebuild. Delivery remains recoverable. |
| Contract tests | Atomic workflow pgTAP plus planned workflow, validation, perspective, correction, delivery, and notification tests. |
| Classification | The extra organiser gate for ranked stakes is **intentional**. |

## WF-005 - Planned external match and result

| Contract | Current behaviour |
| --- | --- |
| Actor/status | Active owner plans against their private external identity and records the result after the scheduled instant. |
| Transaction boundary | `create_planned_match_v1` creates a locked external plan; `record_external_planned_result_v3` materialises the approved fact atomically. |
| Transitions | `locked_in` -> `confirmed` with an immutable external match; no second participant state exists. |
| Idempotency | Stable plan operation key, one materialised result, and owner email keys per plan stage. |
| Approval | Immediate approval is **intentional**. |
| Scoring | Same +10 owner-only activity award and no Elo as WF-003. |
| Zeus/dedupe | Planned lifecycle events are owner-scoped; no fictional external recipient is created. |
| Email/recovery | `planned_locked` and `planned_confirmed` to the owner through the unified outbox. |
| Post-commit result | Success may include a cache warning; delivery remains recoverable. |
| Contract tests | Planned external workflow/perspective/email tests and scoring materialisation contracts. |
| Classification | Single-owner approval and notification are **intentional**. |

## WF-006 - Practice claim and review

| Contract | Current behaviour |
| --- | --- |
| Actor/status | Active owner submits; active organiser approves or rejects. |
| Transaction boundary | `submit_practice_v1` creates the owner's pending `practice_sessions` fact; its insert trigger creates the `practice_logged` email intent in the same transaction. `review_practice_v1` row-locks and terminally reviews it. Reviewed facts are immutable. |
| Transitions | `pending` -> `approved` or `rejected`; matching review retry returns the terminal state. |
| Idempotency | The rendered form holds one UUID; `(player_id, operation_key)` is unique and an identical retry returns the original fact ID, so its transactional email intent is reused. Reusing that key with different activity/minutes/date/note is rejected. Review is idempotent. Email keys are per practice/recipient/transition. |
| Approval | Organiser review is required before scoring or drought protection. |
| Scoring | Approved practice awards +5 on `practiced_on` and resets drought timing. Only entering/leaving approved advances fact version. |
| Zeus/dedupe | No Zeus events; practice lifecycle uses email and the organiser approval queue. |
| Email/recovery | `practice_logged`, `practice_approved`, or `practice_rejected` via the unified outbox and health recovery. |
| Post-commit result | Submission and review return structured delivery warnings; approval can also return a cache-recovery warning. |
| Contract tests | Practice validation/action/email/scoring tests plus workflow-consistency and transaction-invariant pgTAP for correct actor, inactive actor, stable retry identity/payload, single fact, and single email intent. |
| Classification | Approval is required by design; creation and review retry boundaries are now consistent with other immutable-fact workflows. |

## WF-007 - Cup configuration and draw lock

| Contract | Current behaviour |
| --- | --- |
| Actor/status | Active organiser creates/configures a draft cup and selects only active roster members. |
| Transaction boundary | Versioned tournament RPCs own create/configuration, `lock_tournament_draw_v2`, and the pre-play recovery boundary `unlock_tournament_draw_v1`. `replace_tournament_group_draw_v1` validates and replaces the complete group schedule; `replace_tournament_participant_v2` commits the seed-preserving substitution plus regenerated draw; `update_tournament_cover_v1` owns crop metadata. Each locks/validates its cup before mutation. |
| Transitions | `draft` configuration -> locked `scheduled`; an active organiser may return it to editable `draft` only while no match row or placement exists, then must lock again before play. The admin read model uses that same any-match boundary when exposing the control; the RPC remains authoritative. The schedule remains separately locked until deliberately reopened. After the first match fact, roster, formats, schedule, path, cover, and trophy remain permanently frozen. |
| Idempotency | Pre-play unlock returns without rewriting when already unlocked. An exact group-draw or participant-replacement retry returns without rewriting; conflicting retry payloads fail. Draw pairings and schedule slots must be complete and unique. Locked-in email keys are recipient-stable, so a substituted player receives their new intent while already-delivered recipients are not duplicated. |
| Approval | Organiser is the sole director. Draw lock is the only final-field and rules approval boundary. |
| Scoring | Configuration and lock do not affect scoring or fact version. |
| Zeus/dedupe | No general draw-lock Zeus event. RSVP Zeus is WF-009. |
| Email/recovery | Draw lock transaction enqueues `tournament_locked_in` for every roster member. Game-day delivery is an explicit organiser command. Both use the unified outbox. |
| Post-commit result | Lock remains committed if provider work fails and returns warnings; later resend claims only unsent work. Unlock commits independently of prior sent locked-in mail and exposes the lead-up editor immediately. Unlock failures distinguish an unavailable database rollout, an existing match fact, a missing cup, and organiser authorization; safe database code/message details stay server-side. |
| Contract tests | Configurable-cup, pre-play-unlock, and transaction-invariant pgTAP plus tournament logic, action, photo/crop, and email tests. The unlock contract builds the roster and preview before locking, then proves retry safety, preview/roster preservation, ordinary-player and direct-write refusal, and the match/placement freeze boundaries. |
| Classification | Organiser-only configuration, reversible pre-play recovery, and permanent freeze after the first result are **intentional**. |

## WF-008 - Cup result, advancement, and completion

| Contract | Current behaviour |
| --- | --- |
| Actor/status | Active organiser records and advances a locked scheduled/live cup. |
| Transaction boundary | `record_tournament_result_v2` seals one fixture result and derives its `played_at` from the cup's locked `starts_at`; the retained timestamp argument is compatibility-only. `tournament_standings_v1` is the deterministic shared ordering contract. `install_tournament_stage_v1` row-locks and installs the exact canonical tiebreak/semifinal/final-stage payload. For an exceptional four-player standings or top-two cup, `override_tournament_final_v1` records the director, finalists, and reason while atomically preserving the unplayed decider as skipped and installing one final with the cup's locked group format. `canonical_tournament_placements_v1` handles ordinary paths; `finalize_tournament_v1` validates ordinary or override-derived 1-N order and commits completion plus every result-email intent together. |
| Transitions | First result moves scheduled -> live; complete prerequisite stages before installing the next. Before any championship-stage match, an active organiser may replace an unplayed qualification stage with an audited director-seeded final. Finalisation moves to `completed` with a complete unique 1-N placement set. |
| Idempotency | One match per fixture. An installed stage or exact director override is a successful retry only when its full payload matches; conflicting retry payloads fail. The override closes permanently when championship scoring starts. Finalisation treats the client placement array as a checksum against database-derived standings/results; an identical completed retry succeeds and a conflicting path/set fails. Direct championship-stage, override, placement, and completion writes are privilege/trigger-rejected. |
| Approval | Tournament results are immediately organiser-approved and immutable by design. |
| Scoring | Fixture matches earn neither ordinary activity awards nor Elo, but mark tennis on the single-day cup's `starts_at` date. Legacy late-entered match timestamps are normalized only in derived projections. Atomic placements award 100/50/20/10/0... on that event date; relevant tennis-day and award changes advance fact version and cache rebuild follows commit. |
| Zeus/dedupe | No tournament-result Zeus fan-out. |
| Email/recovery | Official result mail covers every persisted placement 1-8 through the unified outbox; zero-point places still receive their recap. Health exposes failed/stale delivery. |
| Post-commit result | Result/completion stays committed when cache/email work needs organiser recovery. Health v5 flags participant/placement set mismatch, not merely unequal counts. |
| Contract tests | Configurable-cup, workflow-hardening, transaction-invariant, director-final-override, and tournament-activity-date pgTAP; tournament score, logic, standings, placements, actions, and email tests. Date coverage proves the RPC ignores caller entry time, uses the event timestamp, and advances the scoring source version once. Override coverage proves immutable group facts, preserved skipped decider, exact finalists, inherited group format, retry/legacy-format-repair/conflict behavior, scoring cutoff, and final-derived 1-4 placements/email intents. |
| Classification | Immediate approval and placement-only scoring are **intentional**; completion and all result-mail intents are one atomic contract. |

## WF-009 - Cup RSVP invitation

| Contract | Current behaviour |
| --- | --- |
| Actor/status | Active organiser invites unique active bench players before draw lock; the active invitee responds before the deadline. |
| Transaction boundary | `send_tournament_invites_v2` row-locks the cup and each RSVP, creates or reuses its generation, creates Zeus only for a new generation, and ensures the custom-email intent. `respond_to_tournament_invite_v2` locks the cup before its RSVP row, serializing acceptance with draw lock. The invitation-history trigger independently guards terminal acceptance and generation evolution. |
| Transitions | New invitation -> `sent`; `sent`/`opened` before deadline -> `accepted`; deadline -> `expired`; re-inviting an expired RSVP terminally supersedes any obsolete undelivered email intent before creating `sent` in the next generation. Accepted is terminal. Re-sending an unexpired `sent`/`opened` RSVP preserves its deadline, lifecycle timestamps, status, and generation. |
| Idempotency | Accepted retry returns accepted even if the draw locked after acceptance. Each new generation gets one Zeus and email key; delivery retry reuses that key and changes only outbox delivery state. A sent receipt is never superseded, and a live processing claim blocks generation renewal until its claim is sent, failed, or stale. |
| Approval | RSVP records interest only. It never consumes a seat; organiser roster selection and draw lock remain authoritative. |
| Scoring | No RSVP score. Trophy ownership is derived only from the completed cup's first-place fact. |
| Zeus/dedupe | One `tournament_invite` per player/cup/generation with a precise cup target. |
| Email/recovery | Generation-specific `tournament_invite` via unified outbox. Obsolete pending/failed/stale work becomes terminal `superseded`, is counted for audit, and is excluded from actionable health recovery. Deadline is parsed with explicit browser offset/tournament context. |
| Post-commit result | Recorded invitations return success plus failed-delivery count/warning. Acceptance preserves distinct not-found, expired, locked, closed, inactive, and unavailable errors. |
| Contract tests | Trophy/RSVP, workflow-hardening, and transaction-invariant pgTAP; invite email, redirect, tournament invite action, deadline, retry, and error-mapping tests. |
| Classification | RSVP/roster separation is **intentional**. Resetting accepted RSVP or duplicating Zeus on retry is forbidden. |

## WF-010 - Player invitation and hard deletion

| Contract | Current behaviour |
| --- | --- |
| Actor/status | Active organiser invites or deletes; self-deletion is forbidden. |
| Transaction boundary | Supabase Auth admin API creates/deletes the identity. `handle_new_user` atomically creates the profile. Clean-stack grants let the trusted service role bootstrap `players.role`; invitees receive only `status`/`joined_at`, with RLS and `enforce_player_self_update()` limiting activation to their own one-way transition. Before deletion, `player_deletion_blockers_v1` checks all historical fact families using trusted server context. |
| Transitions | Auth invite -> `players.status = invited` -> password completion -> `active`. Hard deletion exists only for a genuinely fact-free identity; otherwise deactivate. |
| Idempotency | Provider invite semantics prevent duplicate identities. A missing deletion target is a stable no-longer-exists result. |
| Approval | Active organiser only. |
| Scoring | Deletion is impossible once any scoring or historical fact references the identity. |
| Zeus/dedupe | None. |
| Email/recovery | Player invitation is Supabase Auth mail under WF-012, never the custom outbox. |
| Post-commit result | Provider/Auth failure is returned as failure; no separate cache or custom-email stage exists. |
| Contract tests | Player action/invite/auth activation tests and workflow-hardening deletion blocker pgTAP. |
| Classification | Fact-preserving delete refusal is an invariant, not a recoverable UX choice. |

## WF-011 - Court tagging, merge, and missing-metadata work

| Contract | Current behaviour |
| --- | --- |
| Actor/status | Active match participant or active organiser tags eligible match metadata; active organiser merges courts. |
| Transaction boundary | `resolve_court`, `tag_match_metadata`, `merge_courts`, and owner-scoped `dismiss_untagged_notification_v1` own their changes. |
| Transitions | Approved fact remains approved while only court/surface/location metadata changes. Merge re-points references and retains alias identity. The nudge is dismissed only when the owner has no eligible missing metadata. |
| Idempotency | Canonical case-insensitive court identity; repeated metadata values/merge guards are safe; weekly per-player nudge key dedupes. |
| Approval | Metadata tagging never reopens score approval. Organiser authority is required only for merge. |
| Scoring | No points, Elo, approval, or fact-version change. Surface/court records rederive from updated metadata. |
| Zeus/dedupe | Transactional weekly `untagged_matches_nudge`; owner-scoped completion RPC marks it read when work is genuinely complete. |
| Email/recovery | No email. |
| Post-commit result | Tag/merge failures are transition failures; nudge dismissal failure does not misreport the tag itself. |
| Contract tests | Court resolver/records/action/realtime migration tests and workflow-hardening pgTAP. |
| Classification | Zeus-only missing-tag reminders are **intentional**. |

## WF-012 - Supabase Auth email

| Contract | Current behaviour |
| --- | --- |
| Actor/status | Active organiser triggers player invite; any user may request password recovery; Supabase owns confirmation/invite/recovery token delivery. |
| Transaction boundary | Supabase Auth creates/verifies tokens and sessions. `/auth/confirm` exchanges the token; invite/password actions activate an invited profile only after password update succeeds. Explicit `status`/`joined_at` column grants make that guarded transition portable to clean Supabase projects without broad profile mutation access. |
| Transitions | Invited -> active after verified password setup; recovery preserves status and replaces the Auth password. |
| Idempotency | Provider token expiry/one-time-use semantics; callback validates only safe internal `next` destinations. |
| Approval | No domain approval; Auth verification is the trust boundary. |
| Scoring | None. |
| Zeus/dedupe | None. |
| Email/recovery | **Intentional provider-owned exception:** these messages do not enter `custom_email_outbox` or `/admin/health`. SMTP, templates, redirect allow-list, and click-tracking settings are operator configuration. |
| Post-commit result | Auth provider errors are returned without inventing a custom-delivery receipt. |
| Contract tests | Auth invite, redirect, confirmation-destination, recovery action, and browser redirect tests. |
| Classification | Exclusion from the custom outbox is **intentional**. |

## Workflow mismatch register

This register makes differences explicit. Remove a debt row only when the
implementation, contract tests, and affected workflow section all change in the
same task.

| State | Priority | Mismatch | Required invariant / disposition |
| --- | --- | --- | --- |
| Intentional | - | Exhibition bypasses organiser review | Both participants confirm; approval then occurs atomically (WF-001). |
| Intentional | - | External, organiser-entered, and tournament results approve immediately | Each path has a different trusted actor and immutable audited RPC (WF-002/003/008). |
| Intentional | - | RSVP acceptance does not reserve a roster seat | Only organiser roster selection plus draw lock confirms the field (WF-009). |
| Intentional | - | Missing court/surface work uses Zeus but no email | It is low-stakes metadata work with weekly dedupe (WF-011). |
| Intentional | - | Supabase Auth mail is outside the custom outbox | Provider token delivery cannot be reconstructed safely from product facts (WF-012). |

## Updating this registry

When a workflow changes, preserve its `WF-nnn` ID, update every affected row,
update the mismatch register, and link the enforcing RPC/tests. Add a new ID only
for a genuinely new lifecycle. The completion review must ask what future work
should not have to rediscover and encode that answer here, in an ADR, or in an
automated contract.
