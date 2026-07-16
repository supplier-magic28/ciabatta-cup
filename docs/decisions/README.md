# Architectural decision index

ADRs are append-only history. Read the newest applicable decision and follow
the **Superseded by** chain before acting. A superseded scope remains useful
history; it is not current authority for that scope. Status text below mirrors
the ADR files, while **Domain** is a navigation aid.

| ADR | Title | Status | Domain | Supersedes | Superseded by |
| --- | --- | --- | --- | --- | --- |
| [ADR-0001](0001-immutable-match-facts-computed-scoring.md) | Store match results as immutable facts; compute scoring from them | Accepted | Match facts, scoring | - | - |
| [ADR-0002](0002-supabase-auth-for-identity.md) | Supabase Auth for identity; no self-managed passwords | Accepted | Auth, security | - | ADR-0005 (bootstrap mechanism only) |
| [ADR-0003](0003-rating-cache-and-phased-schema.md) | Rating points are a rebuildable cache; schema built in phases | Accepted; refines ADR-0001 | Scoring, schema | - | - |
| [ADR-0004](0004-auth-implementation.md) | Auth implementation - self-service signup, profile trigger, activation | Accepted; builds on ADR-0002 | Auth | - | - |
| [ADR-0005](0005-guard-exempts-backend-context.md) | The player privilege guard exempts trusted backend contexts | Accepted | Auth, security | ADR-0002 bootstrap mechanism | - |
| [ADR-0006](0006-match-facts-schema.md) | Match-facts schema - trigger-enforced immutability, deferred lifecycle | Accepted | Match facts, schema | - | - |
| [ADR-0007](0007-elo-scoring-engine.md) | Elo scoring engine - parameters, input contract, and history shape | Accepted | Elo | - | ADR-0025 (baseline and floor only) |
| [ADR-0008](0008-match-submission-flow.md) | Match submission flow - derived winner, deferred lifecycle, app-layer writes | Accepted | Match lifecycle | - | - |
| [ADR-0009](0009-invite-players-flow.md) | Invite-players flow - invited profiles, secret-key admin client | Accepted | Auth, players | - | ADR-0013 (password step only) |
| [ADR-0010](0010-confirm-approve-flow.md) | Confirm/approve flow - advance via trigger, admin decisions via RLS | Accepted | Match lifecycle | - | - |
| [ADR-0011](0011-rating-cache-materialization-and-leaderboard.md) | Rating cache materialization and leaderboard | Accepted | Scoring cache | - | - |
| [ADR-0012](0012-ciabatta-reigns-and-profile-read-model.md) | Ciabatta reigns and profile read model | Accepted | Scoring, profiles | - | - |
| [ADR-0013](0013-invite-password-setup.md) | Invited players choose a password before activation | Accepted | Auth | ADR-0009 password-step consequence | - |
| [ADR-0014](0014-unranked-players-zero-points.md) | Unranked players display zero points | Accepted | Elo | - | ADR-0025 (baseline and floor) |
| [ADR-0015](0015-delete-unused-players.md) | Hard-delete only players without match history | Accepted | Players, fact preservation | - | ADR-0043 (deletion-eligibility dependency scope) |
| [ADR-0016](0016-organiser-operated-round-robin-tournaments.md) | Organiser-operated round-robin tournaments | Accepted | Tournaments | - | ADR-0024 (tournament scoring only) |
| [ADR-0017](0017-responsive-performance-contract.md) | Responsive performance contract | Accepted | Performance, UI | - | - |
| [ADR-0018](0018-password-recovery-workflow.md) | Password recovery workflow | Accepted | Auth | - | - |
| [ADR-0019](0019-pre-play-tournament-participant-replacement.md) | Pre-play tournament participant replacement | Accepted | Tournaments | - | - |
| [ADR-0020](0020-personal-profile-settings.md) | Personal profile settings and public display identity | Accepted | Profiles | - | - |
| [ADR-0021](0021-tournament-cover-photos.md) | Tournament cover photos | Accepted | Tournaments, storage | - | - |
| [ADR-0022](0022-tournament-draw-lock-and-lifecycle-email.md) | Tournament draw lock and lifecycle email delivery | Accepted | Tournaments, email | - | ADR-0042 (custom lifecycle-email scope) |
| [ADR-0023](0023-optional-round-robin-completion.md) | Optional round-robin tournament completion | Accepted | Tournaments | - | - |
| [ADR-0024](0024-tournament-placement-awards.md) | Tournament placement awards replace match Elo | Accepted | Tournaments, scoring | ADR-0016 tournament-scoring consequence | ADR-0025 (1000-point baseline only) |
| [ADR-0025](0025-zero-based-ladder-and-player-history.md) | Zero-based ladder and derived player history | Accepted | Elo, profiles | ADR-0007 / ADR-0014 baseline and floor; ADR-0024 1000-point baseline | - |
| [ADR-0026](0026-private-external-opponents-and-flat-awards.md) | Private external opponents and rebuildable flat awards | Accepted | External matches, privacy | - | - |
| [ADR-0027](0027-owner-deletion-of-external-test-matches.md) | Owner deletion of external test matches | Accepted | External matches | - | - |
| [ADR-0028](0028-derived-melbourne-tennis-streaks.md) | Derived Melbourne tennis streaks | Accepted | Profiles, dates | - | - |
| [ADR-0029](0029-activity-points-and-derived-decay.md) | Activity points and permanent derived decay | Accepted | Public scoring | - | - |
| [ADR-0030](0030-planned-match-shells-and-zeus-notifications.md) | Planned match shells and Zeus notifications | Accepted | Planned matches, notifications | - | ADR-0033 (partial transition mechanics) |
| [ADR-0031](0031-shared-courts-and-metadata-only-surface-tags.md) | Shared courts and metadata-only surface tags | Accepted | Courts, match metadata | - | - |
| [ADR-0032](0032-transactional-realtime-zeus-notifications.md) | Transactional and realtime Zeus notifications | Accepted | Notifications | - | ADR-0033 (partial transition mechanics) |
| [ADR-0033](0033-atomic-correctable-match-workflows.md) | Atomic, correctable match workflows | Accepted | Match lifecycle | ADR-0030 / ADR-0032 partial transition mechanics | - |
| [ADR-0034](0034-admin-match-entry-and-public-points-projection.md) | Audited admin match entry and one public points projection | Accepted | Match lifecycle, public scoring | - | - |
| [ADR-0035](0035-activity-ladder-ciabatta-reigns.md) | Activity-ladder Ciabatta reigns | Accepted | Public scoring | - | - |
| [ADR-0036](0036-rpc-lifecycle-boundaries-and-versioned-caches.md) | RPC lifecycle boundaries and versioned derived caches | Accepted | Reliability, scoring cache | - | - |
| [ADR-0037](0037-admin-health-and-reconstructable-email-recovery.md) | Admin health and reconstructable email recovery | Accepted | Operations, email | - | ADR-0042 (custom-email scope) |
| [ADR-0038](0038-canonical-activity-ledger-calendar.md) | Canonical activity ledger for personal calendar | Accepted | Public scoring, calendar | - | - |
| [ADR-0039](0039-locked-configurable-cup-competition.md) | Locked configurable cup competition | Accepted | Tournaments | - | - |
| [ADR-0040](0040-cup-trophies-and-rsvp-invites.md) | Ordinary cups own trophies and RSVP invitations | Accepted | Tournaments, invitations | - | - |
| [ADR-0041](0041-recursive-documentation-and-workflow-registry.md) | Recursive documentation and a canonical workflow registry | Accepted | Documentation, process | - | - |
| [ADR-0042](0042-unified-custom-email-outbox.md) | One durable outbox for custom product email | Accepted | Email, reliability | ADR-0022 / ADR-0037 (custom-email scopes) | - |
| [ADR-0043](0043-workflow-consistency-and-tournament-atomicity.md) | Workflow consistency, precise scoring versions, and atomic cup completion | Accepted | Authorization, reliability, scoring, tournaments | ADR-0015 (deletion-eligibility dependency scope) | - |
| [ADR-0044](0044-public-versioned-trophy-assets-for-ar.md) | Public versioned trophy assets for AR handoff | Accepted | Auth, static assets, AR | - | - |

## Adding a decision

Copy `adr-template.md`, use the next four-digit ID, and never reuse an ID. If a
decision changes, add a new ADR and state the exact older scope it supersedes in
both ADRs' index metadata; do not rewrite the historical reasoning.
