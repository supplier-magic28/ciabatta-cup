# Ciabatta Cup — Data Schema (authoritative)

Derived from the approved screen designs (`design-reference/`). This is the
**authoritative data-model reference**; the copy under
`design-reference/design_handoff_ciabatta_cup/SCHEMA.md` is the raw handoff
artifact and is preserved unchanged. Field names are suggestions; relationships
and enums are the contract.

> **Built in phases.** The full model below is the destination, not a single
> migration. Players, match facts, confirmations, ratings, reigns, and the first
> round-robin tournament spine are implemented in migration form. Activity and
> additional tournament structures land in later phases. See ADR-0003,
> ADR-0011, and ADR-0016.

## Reconciliation with ADR-0001 (read this)

ADR-0001 states that points and rankings are **never stored** — they are computed
from immutable match facts by a pure function. `rating_points`, `rating_history`,
and `ciabatta_reigns` below appear to persist derived data. They are reconciled
as follows (ADR-0003 refines ADR-0001; it does not supersede it):

- **Match facts (`matches` + `match_sets`) are the source of truth.** Immutable,
  append-only.
- **`rating_history` is a persisted *materialisation*** of the pure Elo function
  over approved ranked matches — kept for audit, movement arrows, and read
  performance, but fully **rebuildable** by recomputing forward from match facts.
- **`rating_points` is a denormalised cache** of the latest `rating_history`
  entry per player — **rebuildable** from `rating_history`.
- Neither is authoritative over match facts; both can be dropped and recomputed.
  The pure scoring function in `lib/scoring/` is what produces them, preserving
  ADR-0001's "change the formula fearlessly" seam.

## Design principles
- **Two match classes**: `ranked` (moves points, needs admin approval) and `exhibition` (record only). Never mix them in stats — the UI always shows the two records separately.
- **Approval pipeline**: a submitted result → confirmed by both players → approved by an admin → points applied. Each stage is visible in the UI.
- **Everything is append-only where stats depend on it** (matches, rating history, reigns) so historical data ("cool data over time") is never lost.

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
| rating_points | int, default 0 | **denormalised cache**; zero-based ordinary Elo plus cumulative ranked tournament awards (ADR-0003, ADR-0025) |

_(`password_hash` from the original handoff is intentionally removed — see ADR-0002.)_

Players may edit only their own nickname, nickname preference, and avatar URL.
Nicknames are display labels and are intentionally not unique. The avatar URL
points to a public object in the `avatars` Storage bucket; upload, replacement,
and deletion are restricted to the owning player's `<player_id>/` folder.

### matches _(Phase 3a — implemented)_
Immutable match facts (ADR-0001). Once `status = approved` a row is frozen by a
trigger (`enforce_match_immutable()`); corrections are new facts, never edits.
`tournament_id` / `fixture_id` are nullable foreign keys after Phase 4. A unique
partial index permits only one match fact per fixture (ADR-0016).
| field | type | notes |
|---|---|---|
| id | uuid PK | |
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
| group_ruleset / playoff_ruleset | enum: short_first_to_3, standard_set_tiebreak_6_all | exact validation contract for generated fixtures |
| rules_note | text nullable | human event summary; not used for scoring |
| created_by | FK players | admin |
| created_at / updated_at | timestamptz | |
| cover_image_url | text nullable | optional public cover photo stored in the `tournament-images` bucket |
| draw_locked_at | timestamptz nullable | irreversible director confirmation that freezes participants and the group draw |
| completion_path | enum nullable: round_robin, final_stage | explicit source of final placements; null until completion and on legacy rows |

Tournament status is operational state. Progress and the champion are derived
from linked immutable matches rather than stored on this row.

### `tournament_email_deliveries`

Idempotency ledger for director-triggered lifecycle messages (ADR-0022).

| Column | Type | Notes |
|---|---|---|
| tournament_id / player_id / kind | composite PK | one lifecycle or placement-result delivery per participant |
| status | text | `pending` provider claim or `sent` |
| provider_message_id | text nullable | Resend message identifier |
| claimed_at / sent_at | timestamptz | send attempt and confirmed delivery timestamps |

### `tournament_placements`

Rebuildable official placement awards derived after tournament completion
(ADR-0024).

| Column | Type | Notes |
|---|---|---|
| tournament_id / player_id | composite PK | one placement per tournament player |
| placement | int 1–4 | unique within the tournament |
| points | int | fixed mapping: 100 / 50 / 20 / 10 |
| awarded_at | timestamptz | rating/reign event timestamp |

### tournament_participants _(Phase 4 — implemented)_
| tournament_id FK, player_id FK, seed int, entered_at | composite identity; seed is unique within a tournament and drives deterministic generation |

Admins may replace a participant before the first linked match result. The
replacement preserves the seed and redraws the pre-play fixtures. The existing
participant lock trigger rejects all participant changes once a tournament has
any match, protecting the immutable result history.

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

### rating_history _(Phase 3d — implemented)_
Persisted materialisation of the pure scoring function. It is a rebuildable
cache, not a source of truth; match facts remain authoritative.
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| player_id | FK | |
| match_id | FK | the approved ranked match that caused the change |
| points_before / points_after | int | delta derivable |
| rank_before / rank_after | int | powers the ▲/▼ movement arrows |
| created_at | timestamptz | |

Rebuilt from every approved ranked match whenever one is approved. This keeps
the history correct even if an old result is approved late; the database write
is a single cache-replacement transaction (ADR-0011). Its intentional
whole-table replacement uses an explicit `where true` predicate so hosted
safe-update enforcement accepts the operation without weakening that guard.

### ciabatta_reigns _(Phase 3e — implemented)_
Rebuildable materialisation of #1 holder periods. The first row is created by
the first approved ranked result; an open row (`ended_at` null) is the current
holder. A new holder closes the old reign at the deciding match time.
| id uuid PK, player_id FK, started_at, ended_at nullable | derived by the pure Elo replay; never authoritative over match facts |

### activity_log _(Phase 8 — minimally implemented)_
| id, actor_id FK players nullable, verb text, match_id FK nullable, metadata jsonb, created_at | audit seam; currently records `match_surface_tagged` old/new metadata |

---

## Derived data (compute, don't store — or materialise as views)
- **Leaderboard**: order active players by the pure scoring output. The current
  root route derives this from match facts; `rating_points` is a rebuildable
  cache for later read surfaces. Movement, streak, and last-five remain
  progressive display features derived from approved ranked matches.
- **Records**: ranked W–L and exhibition W–L are always separate; sets/games totals from match_sets.
- **Head-to-head**: per player-pair W–L over approved matches (filterable ranked/exhibition).
- **Tournament standings** (round robin): W–L, game difference, head-to-head,
  then seed from fixtures→approved matches. A tie on wins crossing second/third
  creates an on-court decider. The director may make that table final or continue
  to a final and third-place match; `completion_path` records which facts derive
  the official placements.
- **Ladder ratings**: ordinary approved ranked matches use Elo. Tournament-linked
  matches do not move Elo; completed tournament placements add fixed cumulative
  awards to the player's existing ladder rating.
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

## Points system
Ordinary Elo uses K=32 with a zero entry baseline and zero floor. An equal first
match gives the winner 16 and leaves the loser at zero. Only non-tournament
`ranked` + `approved` matches move Elo; ranked tournament placements add fixed
100/50/20/10 awards directly. The calculation stays pure and rebuildable from
facts in `lib/scoring/computeRankings` and `buildRatingCache` (ADR-0025).

## Auth & permissions
- **Supabase Auth** (email + password managed by Supabase; **no `password_hash` in our schema**). `players.id` = `auth.users.id`. Invited players are created via Supabase Auth invite (tokenised link); `players.status`: invited → active on registration. See ADR-0002.
- `player`: submit/confirm casual matches, read tournaments, and edit **own
  profile only** (not role/status/rating_points).
- `admin`: everything + approve/query results, create/manage tournaments,
  atomically record tournament fixtures, and invite/deactivate players. Admin
  approval UI expects both-confirmed player submissions surfaced oldest-first;
  director-recorded tournament matches are approved inside their transaction.
- Admins may hard-delete only unused player identities with no match references;
  historical players must be deactivated so immutable facts retain their
  participant identity (ADR-0015).

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
# Activity-points delta (2026-07-13)

`players.rating_points` is a rebuildable snapshot of public activity points, not authoritative Elo. Public points are derived from approved ordinary matches (+15 participation each, +15 winner bonus), approved exhibition/external participation (+10), approved `practice_sessions` (+5), tournament placements, and permanent derived inactivity deductions. Ordinary Elo remains a separate pure projection for seeding/history.

`practice_sessions` stores an owner claim (`serves`, `wall_hits`, or `other`), 1–300 minutes, Melbourne-calendar practice date, optional 500-character note, and pending/approved/rejected review metadata. Owners insert/select their own pending facts; organisers select and terminally review all. Reviewed facts are immutable.

`play_days` marks are tennis dates for streak and decay purposes but carry no point award. Decay begins at first tennis activity, charges −1 per missed Melbourne day plus stacked −10 per completed seven-day stretch and −30 per completed thirty-day stretch, and is floored at zero.
