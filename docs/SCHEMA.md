# Ciabatta Cup — Data Schema (authoritative)

This is the **authoritative conceptual data-model reference** for the schema
implemented by the ordered SQL under `supabase/migrations/`. The database and
its contract tests are enforced truth; this document explains current entity
roles and cross-table invariants. Committed design handoffs are historical
inputs, not a competing schema authority.

Applied migrations are immutable. A correction always arrives as a new,
forward-only migration and updates this document in the same task. See
ADR-0003, ADR-0036, and ADR-0041.

## Reconciliation with ADR-0001 (read this)

ADR-0001 states that scoring projections are computed from facts rather than
treated as facts themselves. Persisted projections are allowed only when they
are fully rebuildable:

- Approved `matches` + `match_sets`, approved practice, play days, and official
  tournament placements are the canonical scoring inputs for their domains.
- `players.rating_points` is the rebuildable snapshot of **public activity
  points**, not Elo and not an independently editable player attribute.
- `rating_history` is a legacy-shaped, rebuildable per-match **activity award**
  cache used by match-history reads. It is not Elo and it is not the complete
  public points timeline; practice, placements, and decay live in the canonical
  transient activity ledger.
- `ciabatta_reigns` is the rebuildable holder history from the same public
  activity-points timeline as the ladder.
- `scoring_cache_state` versions points-affecting facts and prevents a stale
  rebuild from overwriting a newer projection.

## Design principles

- **Public points are activity points.** Ranked, exhibition, external, practice,
  placement, play-day, and decay rules share one pure ledger projection.
- **Elo is separate.** Only approved, ordinary, non-tournament ranked results
  feed Elo; it remains useful for analysis and seeding.
- **Approval varies deliberately by workflow.** Ordinary ranked results require
  participant confirmation and organiser approval; exhibition, external,
  organiser-entered, and tournament result paths have explicit immediate-
  approval rules in `docs/WORKFLOWS.md`.
- **Facts are preserved.** Approved/reviewed facts are immutable. Derived
  histories and reigns are replaceable caches, not append-only authorities.
- **Static trophy models contain no private facts.** Versioned GLB/USDZ geometry
  is publicly cacheable for platform AR handoff (ADR-0044); authenticated
  viewer routes derive ownership and engraving overlays from placement facts.

---

## Entities

### players _(Phase 2 — implemented)_
Identity is managed by **Supabase Auth**; there are **no self-managed passwords**
(ADR-0002). `players.id` is a foreign key to `auth.users.id`, so a `players` row
always corresponds to an auth user. An `invited` player is a Supabase Auth
**invited** user (the `auth.users` row is created at invite time via
`inviteUserByEmail`), which is why the FK holds even before they register.
`handle_new_user()` maps `auth.users.invited_at` to the explicitly cast
`player_status` enum so invited and self-signup profiles are created atomically
with their Auth identity.

| field | type | notes |
|---|---|---|
| id | uuid PK, FK → auth.users.id | identity from Supabase Auth; no separate password store |
| email | text unique | login identifier; mirrors the auth email |
| first_name | text | e.g. "Ben" |
| last_name | text | e.g. "Cossar" |
| nickname | text nullable | e.g. "Winners Only" — optional public display label |
| use_nickname | boolean not null, default false | when true, nickname replaces the real name on player-facing surfaces |
| avatar_url | text nullable | |
| height_cm | int nullable | profile vitals |
| weight_kg | int nullable | profile vitals |
| plays | enum: right, left | nullable |
| backhand | enum: one_handed, two_handed | nullable |
| game_style | text nullable | e.g. "Aggressive baseliner" — free text or curated enum |
| role | enum: player, admin | admin = tournament director |
| status | enum: invited, active, inactive | invited = signup link sent, not yet registered |
| invited_at / joined_at | timestamptz | |
| rating_points | int, default 0 | **rebuildable snapshot of public activity points** as of the last successful cache build; ordinary Elo is separate (ADR-0029, ADR-0034) |

_(`password_hash` from the original handoff is intentionally removed — see ADR-0002.)_

Players may edit only their own nickname, nickname preference, and avatar URL.
Nicknames are display labels and are intentionally not unique. The avatar URL
points to a public object in the `avatars` Storage bucket; upload, replacement,
and deletion are restricted to an **active** owning player in the
`<player_id>/` folder. Final Storage policies enforce the active-member check
independently of the Server Action. Invited identities additionally receive
column grants for `status` and `joined_at`; RLS and
`enforce_player_self_update()` restrict that path to their own one-way
`invited -> active` transition. The server-only service role can update only
`role` for trusted first-organiser bootstrap through the Data API.

### matches _(Phase 3a — implemented)_
Immutable match facts (ADR-0001). Once `status = approved` a row is frozen by a
trigger (`enforce_match_immutable()`); corrections are new facts, never edits.
`tournament_id` / `fixture_id` are nullable foreign keys after Phase 4. A unique
partial index permits only one match fact per fixture (ADR-0016).
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| operation_key | uuid nullable, unique when present | stable retry identity for RPC-created facts |
| lifecycle_revision | bigint, default 0 | increments on each status change so a correction cycle gets new transactional notification identities while retries of the same state do not |
| type | enum: ranked, exhibition | |
| format | enum: one_set, best_of_3, pro_set_8, custom | custom carries free-form `format_note` |
| format_note | text nullable | |
| player1_id / player2_id | FK players | singles only for now — consider a match_players join table if doubles ever matters |
| winner_id | FK players nullable | null until scored |
| status | enum: pending_confirmation, pending_approval, approved, queried, rejected | see lifecycle below |
| submitted_by | FK players | player who submitted it, or admin who recorded a tournament result |
| played_at | timestamptz | |
| duration_minutes | int nullable | shown as "2h 14m" |
| tournament_id | FK tournaments nullable | null = casual match |
| fixture_id | FK fixtures nullable | links a tournament result to its slot |
| court_id | FK courts nullable | canonical venue; legacy `location` remains populated |
| surface | enum hard, clay, grass, synthetic nullable | metadata-only; may be tagged after approval |
| location | text nullable | canonical court name or retained legacy free text |
| admin_logged_by | FK players nullable | organiser responsible for a directly finalised member match |
| created_at / updated_at | timestamptz | |

**Match lifecycle**: `pending_confirmation` (opponent hasn't confirmed) → `pending_approval` (both confirmed; ranked only — exhibitions can auto-approve) → `approved` (points applied, stats count) | `queried` (admin flagged, back to submitter) | `rejected`.

Admin-recorded tournament results use a transactional RPC: insert at
`pending_approval`, insert the score, then transition to `approved`. They do not
claim participant confirmations. The transaction finishes before the existing
immutable-fact triggers seal the match (ADR-0016).

Approved facts permit one narrow metadata exception (ADR-0031): either
participant or an organiser may update `court_id`, `surface`, and the matching
legacy `location`. The trigger still rejects every score, participant, winner,
scoring-input, and lifecycle change.

### courts _(Phase 8 — implemented)_

| field | type | notes |
|---|---|---|
| id | uuid PK | canonical or retained alias identity |
| name | text | trimmed, case-insensitively unique shared display name |
| created_by | FK players nullable | first logger; null for historical backfill |
| merged_into | FK courts nullable | organiser merge target; resolvers follow the chain |
| created_at | timestamptz | |

Authenticated users read courts and implicitly create one by submitting a new
location. Only organisers merge them. A merge rewrites structured court foreign
keys while retaining the source name as an alias.

### match_sets _(Phase 3a — implemented)_
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| match_id | FK matches | |
| set_number | int | 1-based |
| p1_games / p2_games | int | e.g. 7 / 5 |
| tiebreak_p1 / tiebreak_p2 | int nullable | e.g. 7 / 3 when set went to TB |

### match_confirmations _(Phase 3a, lifecycle automated in Phase 3c)_
| match_id FK, player_id FK, confirmed_at timestamptz | one row per participant; both rows trigger lifecycle advance |

Once both rows exist, a database trigger advances a ranked result to
`pending_approval` and an exhibition result to `approved` (ADR-0010).

### tournaments _(Phase 4 — implemented for round robin)_
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "Ciabatta Qualifier" |
| structure | enum: round_robin, knockout, groups_knockout | only round_robin is exposed in the first UI |
| counts_as | enum: ranked, exhibition | |
| status | enum: draft, scheduled, live, completed, cancelled | first result moves scheduled → live |
| courts | int | drives schedule generation (who plays / who rests) |
| starts_at | timestamptz | |
| timezone | text | IANA timezone used to display `starts_at` |
| location_name | text | event venue |
| court_id | FK courts nullable | structured venue identity |
| default_surface | surface nullable | stamped onto each tournament result fact |
| group_ruleset / playoff_ruleset | enum: short_first_to_3, standard_set_tiebreak_6_all, pro_set_8, best_of_3_standard | independent contracts stamped onto fixtures |
| rules_note | text nullable | human event summary; not used for scoring |
| created_by | FK players | admin |
| created_at / updated_at | timestamptz | |
| cover_image_url | text nullable | optional public cover photo stored in the `tournament-images` bucket |
| draw_locked_at | timestamptz nullable | director confirmation that freezes participants and the group draw; an organiser may clear it through `unlock_tournament_draw_v1` only before any tournament match row or placement exists |
| completion_path | enum nullable: round_robin, final_stage | explicit source of final placements; null until completion and on legacy rows |
| seat_count | int 2–8 | configured capacity; all seats must be filled at draw lock |
| schedule_locked_at | timestamptz nullable | reversible pre-draw configuration gate |
| championship_path | enum: standings, top_two_final, top_four_finals | locked path, separate from eventual completion fact |
| cover_frame_shape / cover_zoom / cover_offset_x / cover_offset_y | crop metadata | editable presentation over the normalized source image |
| trophy_key / trophy_name | text nullable pair | collectible identity owned by this ordinary cup |

Tournament status is operational state. Progress and the champion are derived
from linked immutable matches rather than stored on this row.

Cover/crop mutation is owned by `update_tournament_cover_v1`; authenticated
clients have no direct tournament-table write grant after RPC enforcement.

### `tournament_email_deliveries`

Legacy idempotency ledger for director-triggered lifecycle messages
(ADR-0022). Migration `20260718127000_unified_email_delivery_outbox.sql`
backfills reconstructable rows into `custom_email_outbox`; new delivery work
uses the unified table. Keep this table for historical diagnostics until a
separate, verified retirement migration exists.

| Column | Type | Notes |
|---|---|---|
| tournament_id / player_id / kind | composite PK | one lifecycle or placement-result delivery per participant |
| status | text | `pending` provider claim or `sent` |
| provider_message_id | text nullable | Resend message identifier |
| claimed_at / sent_at | timestamptz | send attempt and confirmed delivery timestamps |

### `tournament_placements`

Official placement facts derived from completed fixtures (ADR-0024). They can be
recomputed from immutable tournament results, but completion and the complete
1-N set are now committed atomically by `finalize_tournament_v1`; a completed
cup without exactly one placement per participant is an integrity failure.

| Column | Type | Notes |
|---|---|---|
| tournament_id / player_id | composite PK | one placement per tournament player |
| placement | int 1–8 | unique within the tournament |
| points | int | 100 / 50 / 20 / 10 for positions 1–4, zero thereafter |
| awarded_at | timestamptz | rating/reign event timestamp |

`canonical_tournament_placements_v1` derives the sole valid ordered placement
set from the locked cup, complete approved fixtures, configured championship
path, canonical standings, and any required decider/finals. The application
supplies the same set only as an idempotency checksum; it never chooses which
placement facts the finalizer inserts. Direct placement writes and direct
completed/completion-path updates are rejected outside the finalizer's
transaction-local marker.

### `tournament_final_overrides`

One optional audited director decision per four-player `standings` or
`top_two_final` cup.
`finalist_one_id` and `finalist_two_id` are roster foreign keys; `reason`,
`created_by`, and `created_at` preserve who bypassed the qualification decider
and why. Only `override_tournament_final_v1` may insert the row. It is available
after all group results and before any championship-stage match, preserves the
unplayed decider as skipped, and installs one `best_of_3_standard` final.
First/second come from that approved final; non-finalists retain canonical
group-table order for third/fourth. The ordinary finalizer validates this
override-derived placement checksum atomically.

### tournament_participants _(Phase 4 — implemented)_
| tournament_id FK, player_id FK, seed int, entered_at | composite identity; seed is unique within a tournament and drives deterministic generation |

Organisers atomically replace the complete ordered roster while the draw is
unlocked and before the first result. Active unique players must fit the 2–8
seats; draw lock rejects empty seats and freezes the order. A locked scheduled
cup can return to editable draft through `unlock_tournament_draw_v1` only while
it has no match rows or placement facts. The admin read model exposes this same
any-match boundary; the row-locking RPC remains authoritative.
`replace_tournament_group_draw_v1`
validates and replaces the complete circle-schedule pairing set in one locked
transaction. `replace_tournament_participant_v2` preserves the outgoing seed,
validates the regenerated complete group draw, and commits roster plus fixtures
together. Direct authenticated participant/fixture writes are revoked after the
application moves to those RPCs.

### `tournament_invites`

Cup RSVP records are separate from the organiser-owned participant roster.
Each `(tournament_id, player_id)` row stores `sent`, `opened`, `accepted`, or
`expired` state, `hold_until`, lifecycle timestamps, and a positive
`generation`. A first invitation starts at generation 1 and re-inviting an
expired RSVP advances it. Accepted is terminal. Re-sending an unexpired
`sent`/`opened` RSVP preserves its deadline, timestamps, state, and generation;
delivery retry changes only the outbox. Generation-specific Zeus and email keys
dedupe new invitations and retry attempts. Acceptance records player intent but
never consumes a seat or confirms the field; the organiser selects the roster
and organiser draw lock is the final confirmation before play.

The invitation-history trigger prevents any accepted-row mutation, generation
rollback/jumps, and a new generation unless the predecessor is expired. Response
RPCs lock the tournament before the RSVP row so draw lock and acceptance use one
serialization order; an already-accepted retry remains accepted even after the
draw subsequently locks.

### `custom_email_outbox`

The service-role-only durable intent and delivery state for all custom product
email. Supabase Auth confirmation/invite/recovery mail is intentionally
provider-owned and excluded.

| Column | Type | Notes |
|---|---|---|
| idempotency_key | text PK | stable provider and application retry identity |
| kind | constrained text | reconstructable template/event kind |
| player_id | FK players, restrict delete | canonical recipient identity |
| entity_type / entity_id | text / uuid | canonical reconstruction context |
| status | pending, processing, sent, failed, superseded | atomic delivery state machine; `superseded` is terminal non-actionable audit state |
| attempt_count | int | increments on a successful claim |
| provider_message_id / last_error | text nullable | provider receipt or bounded safe diagnostic |
| created_at / updated_at / claimed_at / sent_at / superseded_at | timestamptz | stale-claim, terminal outcome, and operator diagnostics |

`enqueue_custom_email_v1` rejects incomplete or conflicting delivery context.
`claim_custom_email_v1` atomically claims pending/failed or fifteen-minute-stale
work and refuses terminal sent/superseded rows. `mark_custom_email_sent_v1` and
`mark_custom_email_failed_v1` close an attempt. `supersede_custom_email_v1`
terminally closes pending, failed, or fifteen-minute-stale obsolete work while
preserving sent receipts; a live processing claim blocks supersession. Health
counts superseded audit rows separately but never presents them as actionable.
Match, planned-match, practice, draw-lock, RSVP, and tournament-completion
transitions create intent transactionally. Explicit game-day or locked-in
resend commands first enqueue the complete active-roster batch in one RPC.
Provider delivery occurs only after the intent transaction commits.

A repeated sent acknowledgement is valid only with the same provider receipt;
a different receipt cannot rewrite a terminal sent row. During upgrade,
`reconcile_legacy_email_outbox_v1` imports missing legacy rows, promotes
conflicting legacy `sent`/`failed` outcomes into outbox rows that migration 127
already created, and preserves recent legacy claims as `processing` rather than
exposing them immediately for duplicate recovery. The unified and legacy ledgers are select-only outside
their security-definer claim/mark/reconciliation interfaces after enforcement.

### fixtures _(Phase 4 — implemented for round robin)_
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| tournament_id | FK | |
| stage | enum: group, tiebreak, quarterfinal, semifinal, final, playoff | first release uses group, tiebreak, final, playoff |
| round_number / slot_number | int | logical round and court wave |
| court_number | int | court assignment within the wave |
| ruleset | tournament_ruleset | controls score validation and match format mapping |
| player1_id / player2_id | FK players | both must be registered tournament participants |
| skipped_at | timestamptz nullable | preserves an unplayed final/playoff fixture skipped by round-robin completion |

A fixture does not store result status, winner, score, or `match_id`. Its
result is the single `matches` row whose `fixture_id` points back to it.
`skipped_at` is operational history for an unplayed final-stage slot, never a
match result. Odd-field rests are derived as the participant absent from that
round rather than stored as fake fixtures. Future bracket wiring remains
deferred.

Post-group tiebreak, semifinal, final, and playoff fixtures are installed by
`install_tournament_stage_v1`, which locks the cup, validates active lifecycle,
participant membership, complete approved group prerequisites, the configured
qualification path, exact canonical pairings/schedule slots, and prerequisite
decider/semifinal winners. It returns safely only when the already-installed
stage exactly matches the retry payload. Application code may display pairings
but cannot partially write an authoritative championship stage.

### rating_history _(Phase 3d — implemented)_
Persisted, legacy-shaped materialisation of public award movement caused by
approved ordinary match facts. It is a rebuildable match-history cache, not
ordinary Elo, not the complete public activity timeline, and not a source of
truth. Match facts remain authoritative; the canonical ledger separately
includes practice, placement, play-day, and decay effects.
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| player_id | FK | |
| match_id | FK | the approved ordinary ranked, exhibition, or external match that caused the award |
| points_before / points_after | int | delta derivable |
| rank_before / rank_after | int | powers the ▲/▼ movement arrows |
| created_at | timestamptz | |

Rebuilt from every approved ordinary match whenever a scoring fact changes.
This keeps match-award history correct even if an old result is approved late;
the database write is a single cache-replacement transaction (ADR-0011). Its
intentional whole-table replacement uses an explicit `where true` predicate so hosted
safe-update enforcement accepts the operation without weakening that guard.

### ciabatta_reigns _(Phase 3e — implemented)_
Rebuildable materialisation of public activity-points #1 holder periods
(ADR-0035). The first positive leader opens the first row; an open row
(`ended_at` null) is the current holder. The incumbent keeps the Ciabatta on an
equal-points tie and a new row begins only when another player moves strictly
ahead. Tournament placement points are replayed on the tournament date.
| id uuid PK, player_id FK, started_at, ended_at nullable | derived by the pure Melbourne-day activity-points replay; never authoritative over source facts |

### activity_log _(Phase 8 — minimally implemented)_
| id, actor_id FK players nullable, verb text, match_id FK nullable, metadata jsonb, created_at | audit seam; currently records `match_surface_tagged` old/new metadata |

---

## Derived data (compute, don't store — or materialise as rebuildable caches)

- **Public leaderboard**: order active players by the canonical activity-points
  replay at an explicit Melbourne as-of date. The leaderboard, player profiles,
  calendar scorecard, points history, cache build, and Ciabatta holder consume
  the same source-aware ledger.
- **Records**: ranked W–L and exhibition W–L are always separate; sets/games totals from match_sets.
- **Head-to-head**: per player-pair W–L over approved matches (filterable ranked/exhibition).
- **Tournament standings** (round robin): `tournament_standings_v1` is the one
  database definition used by stage and placement validation. It orders wins,
  game difference, head-to-head wins within an otherwise equal wins/game-
  difference cohort, seed, then UUID. A wins tie across the configured
  qualification cutoff requires an on-court decider. The director may make
  standings final or continue through the configured final stage;
  `completion_path` records which facts derive the official placements.
- **Ordinary Elo**: only non-tournament approved ranked matches participate.
  Tournament fixtures never move Elo. Placement awards belong only to the
  activity-points projection.
- **Surface records**: per-surface W–L, win percentage, and match count over
  approved tagged ranked and tournament facts. Untagged eligible facts are
  excluded and counted separately.

## Planned matches and Zeus notifications _(Phase 7–8 — implemented)_

`planned_matches` stores stake-free participants, schedule, status, legacy
location, and optional `court_id`. `planned_match_results` stores the post-play
proposal plus optional `court_id` and `surface`; those values flow to the final
match fact through the external, exhibition, or ranked approval path.

`notifications` is owner-private and includes a safe internal `target_path`,
optional planned-match link, read timestamp, and optional per-player dedupe key.
The `/notifications` Zeus inbox marks an item read when its navigation action is
opened. `untagged_matches_nudge` targets `/matches/untagged` and is created no
more than weekly per player.

Planned-match lifecycle notifications are inserted by a database trigger in
the same transaction as the shell status transition. Stable per-player dedupe
keys make the fan-out retry-safe, including final `result_confirmed` messages.
`notifications` belongs to the `supabase_realtime` publication; Postgres
Changes remains restricted by owner-select RLS and the client also filters by
the signed-in player's ID.

Notification read/open changes use authenticated RPCs rather than participant
service-role writes. Missing-metadata nudges are generated transactionally by
Postgres when an eligible match becomes approved, with a weekly dedupe key.

ADR-0033 replaces the original multi-write result handoff with authenticated,
row-locking RPCs. Score entry starts after `planned_matches.scheduled_at`;
participant submissions are stored in submitter perspective and normalised to
`matches.player1_id` when materialised. `awaiting_result_correction` identifies
an organiser correction queue. Corrected proposals are new rows linked through
`supersedes_id` and `corrected_by`, and require participant confirmation again.

`notifications.match_id` precisely links ordinary confirmation and organiser
approval alerts. Database fan-out covers ordinary confirmation, every active
organiser awaiting a ranked review, terminal decisions, planned corrections,
and final planned confirmation. Repeatable result approvals dedupe by proposal
revision rather than only by planned shell.

## Scoring projections

The public ladder uses the activity economy defined in ADR-0029: ranked
participation +15 and win +15; exhibition and external participation +10;
approved practice +5; tournament placements 100/50/20/10 for places 1-4 and
zero thereafter; permanent Melbourne-day daily and drought decay; and a zero
floor. Manual play days award no points but reset drought timing.

Ordinary Elo is a separate pure K=32 projection with zero entry and zero floor.
Only non-tournament `ranked` + `approved` matches move it. An equal first match
gives the winner 16 and leaves the loser at zero. `computeRankings` owns Elo;
`buildRatingCache` owns the public activity ledger, activity snapshot, and
reigns. Tournament fixtures never receive ordinary match awards or Elo in
addition to their official placement award.

## Auth & permissions
- **Supabase Auth** (email + password managed by Supabase; **no `password_hash` in our schema**). `players.id` = `auth.users.id`. Invited players are created via Supabase Auth invite (tokenised link); `players.status`: invited → active on registration. See ADR-0002.
- `player`: an **active** player may submit/confirm casual matches, respond to
  invitations, and edit the allowed fields of their own profile. Invited and
  inactive identities retain only the reads required for activation/history;
  they cannot perform domain mutations.
- `admin`: everything + approve/query results, create/manage tournaments,
  atomically record tournament fixtures, and invite/deactivate players. Admin
  approval UI expects both-confirmed player submissions surfaced oldest-first;
  director-recorded tournament matches are approved inside their transaction.
- Admins may hard-delete only unused, non-self identities with no match,
  practice, play-day, tournament, planned-match, placement, invitation, or
  other historical fact references; historical players must be deactivated so
  immutable facts retain their
  participant identity (ADR-0015).
- RLS policy and SQL privilege are separate gates. Migration 129 supplies the
  exact clean-stack read/rolling-write grants required by the compatible app;
  migration 130 then revokes direct practice, RSVP, legacy email-ledger,
  tournament, participant, fixture, and placement mutation grants. Canonical
  security-definer RPCs retain explicit execute grants and own those writes.
  Migration 130 also gives the server-only service role read access to the
  current public fact model and the narrow `players.role` bootstrap column;
  future tables still require an explicit reviewed grant.

## Non-Ciabatta opponents _(Phase 6 — implemented)_

`match_type` includes `unranked_external`. These facts have `player2_id = null`,
an `external_won` boolean, and are transactionally finalized as `approved`
without confirmation or admin review. Each approved fact contributes a
rebuildable flat +10 to its submitter, but never enters Elo, ranked/exhibition
records, streaks, last-five form, or rank-movement arrows.

`external_opponents` holds an owner's case-insensitively deduplicated saved-name
list. `external_match_details` holds the immutable private name used by one
match. Both use owner-only RLS; the public match row contains no opponent name,
so other authenticated players receive only “Non-Ciabatta opponent”. External
awards are also materialized as one `rating_history` row with unchanged rank.
The submitting owner may delete an external fact through the dedicated RPC;
its derived history is removed transactionally and the app rebuilds all rating
caches. Approved league and tournament facts remain immutable.

All player-logged matches store a compulsory `played_at` date selected by the
submitter. `matches.location` is optional trimmed text (maximum 160 characters)
for a court or venue. Tournament-created facts continue to derive `played_at`
from their event workflow and may leave `location` null.

## play_days _(Phase 7 — implemented)_

Manual streak marks only; match-derived days are never copied here.

| field | type | notes |
|---|---|---|
| player_id | FK players | composite primary key; owner-only RLS |
| played_on | date | insert/delete restricted to Melbourne today |
| created_at | timestamptz | audit timestamp |

The streak projection unions these marks with every participating match except
rejected submissions. H2H and history projections continue to use approved
facts only. No current streak, best streak, or H2H aggregate is stored.
## Admin match logging and public projection

`matches.admin_logged_by` identifies an organiser who used the guarded
`admin_log_match_v2` RPC to record a match for any two active members. The RPC
stores the score before sealing the match as `approved`; it creates no
participant confirmations or approval-queue work. `submitted_by` remains
player 1 for score orientation, while `admin_logged_by` is the audit authority.

Public current points, rank, and point timelines are one pure activity replay
loaded server-side from complete match, placement, approved-practice, and
play-day facts. Only derived totals/events leave that boundary. Leaderboard and
public profiles use the same career projection; exhibition W-L is the all-time
non-ranked record and external opponent identities remain owner-private.

## Canonical activity-points inputs

`players.rating_points` is a rebuildable snapshot of public activity points, not authoritative Elo. Public points are derived from approved ordinary matches (+15 participation each, +15 winner bonus), approved exhibition/external participation (+10), approved `practice_sessions` (+5), tournament placements, and permanent derived inactivity deductions. Ordinary Elo remains a separate pure projection for seeding/history.

`practice_sessions` stores an owner claim (`serves`, `wall_hits`, or `other`),
1–300 minutes, Melbourne-calendar practice date, optional 500-character note,
pending/approved/rejected review metadata, and a nullable `operation_key`.
`(player_id, operation_key)` is unique when a key exists. The practice page
generates one stable UUID for the rendered form and `submit_practice_v1` returns
the same pending fact for an identical retry by that owner; the insert trigger
therefore creates only one `practice_logged` intent. Reusing the key with a
different activity, duration, date, or normalized note is rejected. The
nullable key preserves rolling
compatibility with the previously deployed direct-insert client. Owners select
their own claims; organisers select and terminally review all. Reviewed facts
are immutable.

`play_days` marks are tennis dates for streak and decay purposes but carry no point award. Decay begins at first tennis activity, charges −1 per missed Melbourne day plus stacked −10 per completed seven-day stretch and −30 per completed thirty-day stretch, and is floored at zero.

The activity replay also returns a transient source-aware ledger (ADR-0038):
ranked participation/win, exhibition, Non-Ciabatta, approved practice,
tournament placement, and all three decay categories. Daily summaries record
awards, decay, applied zero-floor movement, and resulting points. It is not a
database table: calendar, leaderboard, profiles, history, and cache rebuilding
consume the same projection. Cup fixtures never earn ordinary awards in
addition to placement points.

## Core reliability boundaries (ADR-0036)

`matches.operation_key`, `planned_matches.operation_key`, and the player-scoped
`practice_sessions.operation_key` provide stable retry identities for creation
RPCs. Ordinary, organiser, external, and planned result paths call
`assert_standard_match_payload_v1`, which enforces
sequential unique sets, score bounds, paired tie-breaks, an overall winner,
declared-winner agreement, Melbourne played-date gating, and custom-format
notes. Database triggers guard ordinary-match, planned-shell, and proposal
status graphs; approved result facts remain terminal and immutable.

`scoring_cache_state` is a singleton containing `fact_version`,
`built_version`, and the last successful rebuild time. Triggers increment the
fact version only when the canonical activity projection changes: an approved
match enters/leaves or changes a scoring input, approved practice enters/leaves
or changes its player/date, a placement changes, or a play day changes. Pending
submissions, lifecycle status noise, and court/surface metadata do not create
false drift. `replace_rating_cache_with_reigns_v2` takes an advisory lock and
refuses a snapshot built from a stale version.

`lifecycle_email_deliveries` is the legacy match/planned/practice diagnostic
ledger. Reconstructable rows are backfilled into `custom_email_outbox`; when a
migration-127 trigger has already created the same key, migration 129 promotes
the legacy `sent` receipt or `failed` diagnostic into that existing row instead
of leaving delivered mail actionable. A receipt already recorded as `sent` by
the unified outbox remains immutable. New delivery state is written only
through the unified claim/sent/failed RPCs. Email remains a synchronous
non-blocking provider attempt today, while the durable intent permits a future
worker without changing lifecycle transactions.

Migrations 127-129 are the additive boundary. Because migration 127 begins
unified intent writes before the legacy application stops acknowledging its own
ledger, production mutations remain frozen across the three migrations and the
application cutover. Migration 130 is the deliberately separate enforcement
boundary: it removes direct
practice/RSVP and broad cup writes, makes legacy and unified email ledgers
read-only outside RPCs, and guards stage/placement/completion mutations with
transaction-local markers set only by validated RPCs.

## Organiser health and recovery (ADR-0037)

`core_backend_health_v5()` is the current authenticated organiser-only,
read-only JSON projection over cache versions, lifecycle inconsistencies,
completed-cup participant/placement **set equality**, unified actionable email
deliveries, required triggers, and notification Realtime publication. The SQL
Editor may call the same function in its trusted postgres context. The payload
contains entity identifiers and bounded delivery errors but excludes email
addresses, practice notes, and external-opponent identities.

Pending, failed, and fifteen-minute-stale `custom_email_outbox` rows can be retried
from `/admin/health` only for known reconstructable kinds. The server reloads
canonical entity and recipient facts and reuses the row's idempotency key; no
message body or destination is stored in the ledger or accepted from the
browser. Unknown delivery kinds remain visible for manual recovery.
