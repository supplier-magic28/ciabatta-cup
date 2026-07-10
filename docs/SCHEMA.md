# Ciabatta Cup — Data Schema (authoritative)

Derived from the approved screen designs (`design-reference/`). This is the
**authoritative data-model reference**; the copy under
`design-reference/design_handoff_ciabatta_cup/SCHEMA.md` is the raw handoff
artifact and is preserved unchanged. Field names are suggestions; relationships
and enums are the contract.

> **Built in phases.** The full model below is the destination, not a single
> migration. Players, match facts, confirmations, and rating history are now
> implemented in migration form. Tournaments, reigns, and activity land in
> later phases. See ADR-0003 and ADR-0011.

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
| nickname | text nullable | e.g. "Winners Only" — shown in quotes on profile |
| avatar_url | text nullable | |
| height_cm | int nullable | profile vitals |
| weight_kg | int nullable | profile vitals |
| plays | enum: right, left | nullable |
| backhand | enum: one_handed, two_handed | nullable |
| game_style | text nullable | e.g. "Aggressive baseliner" — free text or curated enum |
| role | enum: player, admin | admin = tournament director |
| status | enum: invited, active, inactive | invited = signup link sent, not yet registered |
| invited_at / joined_at | timestamptz | |
| rating_points | int, default 0 | **denormalised cache**; zero until the first approved ranked match, then current Elo rebuilt from facts (ADR-0003, ADR-0014) |

_(`password_hash` from the original handoff is intentionally removed — see ADR-0002.)_

### matches _(Phase 3a — implemented)_
Immutable match facts (ADR-0001). Once `status = approved` a row is frozen by a
trigger (`enforce_match_immutable()`); corrections are new facts, never edits.
`tournament_id` / `fixture_id` are nullable **plain uuid** columns until their
tables exist — the FK constraints are added in the tournaments/fixtures phase
(ADR-0006).
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| type | enum: ranked, exhibition | |
| format | enum: one_set, best_of_3, pro_set_8, custom | custom carries free-form `format_note` |
| format_note | text nullable | |
| player1_id / player2_id | FK players | singles only for now — consider a match_players join table if doubles ever matters |
| winner_id | FK players nullable | null until scored |
| status | enum: pending_confirmation, pending_approval, approved, queried, rejected | see lifecycle below |
| submitted_by | FK players | who logged it |
| played_at | timestamptz | |
| duration_minutes | int nullable | shown as "2h 14m" |
| tournament_id | FK tournaments nullable | null = casual match |
| fixture_id | FK fixtures nullable | links a tournament result to its slot |
| created_at / updated_at | timestamptz | |

**Match lifecycle**: `pending_confirmation` (opponent hasn't confirmed) → `pending_approval` (both confirmed; ranked only — exhibitions can auto-approve) → `approved` (points applied, stats count) | `queried` (admin flagged, back to submitter) | `rejected`.

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

### tournaments _(later phase — not yet built)_
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "Ciabatta Qualifier" |
| structure | enum: round_robin, knockout, groups_knockout | |
| match_format | enum (same as matches.format) + format_note | default for generated fixtures |
| counts_as | enum: ranked, exhibition | |
| status | enum: draft, open, live, completed, cancelled | open = entries accepted |
| courts | int | drives schedule generation (who plays / who rests) |
| starts_at | timestamptz | |
| final_rules | text nullable | e.g. "1st vs 2nd · one full set · TB at 6–6" |
| winner_id | FK players nullable | set on completion |
| created_by | FK players | admin |

### tournament_participants _(later phase — not yet built)_
| tournament_id FK, player_id FK, seed int nullable, entered_at | seed defaults from leaderboard rank at generation time |

### fixtures _(later phase — not yet built)_
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| tournament_id | FK | |
| stage | enum: group, quarterfinal, semifinal, final, playoff | round-robin rounds use `group` + round_number |
| round_number | int nullable | RR round 1..n |
| court | int nullable | court assignment |
| player1_id / player2_id | FK players nullable | nullable for "Winner SF1" placeholders |
| feeds_from_fixture1_id / feeds_from_fixture2_id | FK fixtures nullable | bracket wiring |
| bye_player_id | FK players nullable | top seeds get byes |
| resting_player_id | FK players nullable | RR "resting" column |
| match_id | FK matches nullable | filled when result submitted |
| status | enum: scheduled, in_progress, complete | |

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
is a single cache-replacement transaction (ADR-0011).

### ciabatta_reigns _(Phase 3e — implemented)_
Rebuildable materialisation of #1 holder periods. The first row is created by
the first approved ranked result; an open row (`ended_at` null) is the current
holder. A new holder closes the old reign at the deciding match time.
| id uuid PK, player_id FK, started_at, ended_at nullable | derived by the pure Elo replay; never authoritative over match facts |

### activity_log _(later phase — not yet built)_
| id, actor_id FK players nullable, verb enum (match_submitted, match_confirmed, match_approved, match_queried, player_invited, player_joined, tournament_created, tournament_entered, …), subject_type + subject_id, created_at | powers the admin "Recent activity" feed |

---

## Derived data (compute, don't store — or materialise as views)
- **Leaderboard**: order active players by the pure scoring output. The current
  root route derives this from match facts; `rating_points` is a rebuildable
  cache for later read surfaces. Movement, streak, and last-five remain
  progressive display features derived from approved ranked matches.
- **Records**: ranked W–L and exhibition W–L are always separate; sets/games totals from match_sets.
- **Head-to-head**: per player-pair W–L over approved matches (filterable ranked/exhibition).
- **Tournament standings** (round robin): W–L then game difference ("+9") from fixtures→matches.

## Points system (recommendation)
Elo with K=32 and floor 100 uses 1000 as the internal entry baseline. Players
display zero points and no rank until their first approved ranked match; that
result publishes their Elo. Only `ranked` + `approved` matches move points. Keep
it a pure function of match facts (materialised into `rating_history`) so it can
be re-run/rebalanced later — the group will want to argue about the algorithm.
This is `lib/scoring/computeRankings` (ADR-0014).

## Auth & permissions
- **Supabase Auth** (email + password managed by Supabase; **no `password_hash` in our schema**). `players.id` = `auth.users.id`. Invited players are created via Supabase Auth invite (tokenised link); `players.status`: invited → active on registration. See ADR-0002.
- `player`: submit/confirm matches, enter open tournaments, edit **own profile only** (not role/status/rating_points).
- `admin`: everything + approve/query results, create/manage tournaments, invite/deactivate players. Admin approval UI expects both-confirmed ranked matches surfaced oldest-first.
