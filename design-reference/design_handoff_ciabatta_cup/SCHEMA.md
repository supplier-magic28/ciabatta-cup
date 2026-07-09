# Ciabatta Cup — Data Schema

This schema is derived from the approved screen designs (see README.md + bundled HTML). It covers everything the screens display or imply. Implement in whatever DB/ORM fits the chosen stack; field names are suggestions, relationships and enums are the contract.

## Design principles
- **Two match classes**: `ranked` (moves points, needs admin approval) and `exhibition` (record only). Never mix them in stats — the UI always shows the two records separately.
- **Approval pipeline**: a submitted result → confirmed by both players → approved by an admin → points applied. Each stage is visible in the UI.
- **Everything is append-only where stats depend on it** (matches, rating history, reigns) so historical data ("cool data over time") is never lost.

---

## Entities

### players
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| email | text unique | login identifier |
| password_hash | text | email+password auth |
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
| rating_points | int, default 1000 | current Elo-style points; denormalised from rating_history |

### matches
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

### match_sets
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| match_id | FK matches | |
| set_number | int | 1-based |
| p1_games / p2_games | int | e.g. 7 / 5 |
| tiebreak_p1 / tiebreak_p2 | int nullable | e.g. 7 / 3 when set went to TB |

### match_confirmations
| match_id FK, player_id FK, confirmed_at timestamptz | one row per participant; both rows present ⇒ move to pending_approval |

### tournaments
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

### tournament_participants
| tournament_id FK, player_id FK, seed int nullable, entered_at | seed defaults from leaderboard rank at generation time |

### fixtures
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

### rating_history
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| player_id | FK | |
| match_id | FK | the approved ranked match that caused the change |
| points_before / points_after | int | delta derivable |
| rank_before / rank_after | int | powers the ▲/▼ movement arrows |
| created_at | timestamptz | |

Written **only** when a ranked match is approved. Approving in the right order keeps history clean; if an old match is approved late, recompute forward from that point.

### ciabatta_reigns
Tracks the #1 spot ("The Ciabatta") over time — powers "Held 24 days · 3rd reign".
| player_id FK, started_at, ended_at nullable | open row (ended_at null) = current holder. New row whenever rank #1 changes after an approval. |

### activity_log
| id, actor_id FK players nullable, verb enum (match_submitted, match_confirmed, match_approved, match_queried, player_invited, player_joined, tournament_created, tournament_entered, …), subject_type + subject_id, created_at | powers the admin "Recent activity" feed |

---

## Derived data (compute, don't store — or materialise as views)
- **Leaderboard**: order active players by rating_points; movement = rank now vs rank 7 days ago (from rating_history); streak + last-5 from approved ranked matches.
- **Records**: ranked W–L and exhibition W–L are always separate; sets/games totals from match_sets.
- **Head-to-head**: per player-pair W–L over approved matches (filterable ranked/exhibition).
- **Tournament standings** (round robin): W–L then game difference ("+9") from fixtures→matches.

## Points system (recommendation)
Elo with K=32, floor 100, everyone starts at 1000. Only `ranked` + `approved` matches move points. Keep it a pure function of rating_history so it can be re-run/rebalanced later — the group will want to argue about the algorithm.

## Auth & permissions
- Email + password; invited players get a tokenised signup link (players.status: invited → active).
- `player`: submit/confirm matches, enter open tournaments, edit own profile.
- `admin`: everything + approve/query results, create/manage tournaments, invite/deactivate players. Admin approval UI expects both-confirmed ranked matches surfaced oldest-first.
