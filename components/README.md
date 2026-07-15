# Components

The shared UI vocabulary. Screens are assembled from these primitives, driven by
design tokens (`tokens.ts`) — edit a token and everything updates
(ARCHITECTURE.md §3). Keeping this inventory current is part of the Definition
of Done (`CLAUDE.md`).

## Inventory

**Brand**
- `brand/LoafBadge` — the Ciabatta loaf (SVG), the current-holder trophy motif.
- `brand/TrophyBadge` — compact earned-tournament trophy icon used in ladder rows.
- `brand/ClaymoreCupIcon` — reusable sword, ball, and clay trophy mark used by
  Claymore cup pages, invitations, and official winner history.
- `brand/Wordmark` — "CIABATTA CUP" wordmark, `tone` light/dark.

**UI primitives**
- `ui/BackLink` — consistent arrowed link to a deterministic parent route,
  with keyboard focus treatment for nested pages and workflows.
- `ui/Button` — primary action button (green, 2px ink border, offset shadow);
  `loading` preserves its dimensions, disables repeat submission, and exposes
  an accessible pending label.
- `ui/Field` — labelled input; `reveal` adds a password Show/Hide toggle.
- `ui/Chip` — selectable pill (2px ink border; fills green when selected). Used
  for the match type/format choices; reusable for any one-of-many selection.
- `ui/LoadingSpinner` — fixed-size solid spinner for compact pending controls;
  animation stops when reduced motion is requested.
- `ui/Skeleton` — fixed-geometry solid-opacity loading block with
  reduced-motion support.
- `ui/CropZoomControl` — accessible bounded zoom slider with explicit zoom in
  and zoom out controls for image crop editors.

**Loading**
- `loading/PageSkeletons` — route-shaped compositions for leaderboard, auth,
  compact lists, forms, profiles, tournament lists, and tournament boards.

**Calendar**
- `calendar/CalendarExperience` - responsive personal calendar composition with
  canonical-ledger scorecard, range-independent recent history, next-match rail,
  month grid, chronological list, URL-preserved instant client controls, and
  day/event details.
- `calendar/CalendarEventVisual` - shared cup-cover, paired-player-avatar,
  external-opponent shell, and compact-practice imagery used by calendar
  history, list, day, and event-detail surfaces.

**Email rendering**
- `lib/email/components` - non-React, email-client-safe shell, header/footer,
  button, pill, detail-card, and Zeus-quote primitives shared by tournament and
  planned-match lifecycle mail. Tournament mail keeps its original Zeus asset;
  planned-match mail selects the red Zeus portrait and optional quote sign-off.

**Layout**
- `layout/SiteHeader` — responsive three-area header with the wordmark,
  wrapping primary navigation, and a permanent top-right Zeus inbox action.
- `practice/PracticeForm` — owner solo-practice claim form with activity, duration, date, notes, approval callout, and pending result state.
- `practice/PracticeApprovalActions` — organiser approve +5/reject controls for
  pending practice claims, including committed-with-recovery warnings.
  tournaments, matches, admin tools, and sign-out.

**Courts and surfaces**
- `courts/CourtPicker` — shared saved-court typeahead with match counts,
  known-surface hints, and implicit free-text creation.
- `courts/SurfaceChips` — optional hard/clay/grass/synthetic selection plus the
  dashed deferred state.
- `courts/MatchMetadataEditor` — participant/admin retro-tag control that never
  reopens score approval.
- `courts/CourtMergeForm` — organiser duplicate-to-canonical merge control.

**Leaderboard**
- `leaderboard/ExpandableLeaderboard` — compact trophy/holder/points rows with
  accessible per-player history toggles and one expand/collapse-all control.

**Auth**
- `auth/SignInForm` — email + password sign-in (client, `useActionState`) with
  a validated internal return path for protected deep links.
- `auth/SignUpForm` — create-account (name + email + password).
- `auth/AcceptInviteForm` — invite-only password setup before profile
  activation (client, `useActionState`).

**Match**
- `match/DeleteExternalMatchButton` — confirmed owner-only deletion for a
  Non-Ciabatta test or mistaken result, followed by a complete rating rebuild.
- `match/LogMatchForm` also implements the owner-private non-Ciabatta variant:
  saved-name reuse, immediate approval, flat +10, and non-blocking email status.
  Both variants require the played date and accept an optional location.
- `match/LogMatchForm` — the log-match wizard (design screen 03): 3 steps
  (matchup → type & format → per-set scores), shared pure validation, and either
  participant submission or audited admin any-two-player direct finalization.
  It keeps one stable operation key across retries so repeated activation cannot
  duplicate a committed fact.
- `match/ConfirmMatchButton` — opponent-side confirm (calls `confirmMatch`); the
  DB trigger advances the status once both players confirm and the control can
  distinguish committed success from a cache-rebuild warning.
- `match/ApprovalActions` — admin Approve / Query / Reject for a `pending_approval`
  match (calls the admin match actions and surfaces post-commit recovery warnings).
- `match/RebuildRatingsButton` — admin recovery control that rebuilds ratings,
  history, and reign caches from immutable facts.

**Admin health**
- `health/HealthRefreshButton` — organiser-only refresh control with immediate
  checking feedback for the backend health snapshot.
- `health/RetryDeliveryButton` — guarded one-recipient retry for a failed or
  stale reconstructable lifecycle email, preserving its provider idempotency key.

**Players (admin)**
- `players/InvitePlayerForm` — admin invite form (design screen 08): name + email
  → `inviteUser` server action (`useActionState`).
- `players/DeletePlayerButton` — confirmed admin hard-delete for unused players;
  the server refuses self-deletion and any player referenced by a match.
- `players/PlayerAvatar` — Supabase Storage avatar with deterministic initials
  fallback; used by leaderboard and profiles.
- `players/ReignSummary` — hydrated current-holder duration measured by
  Melbourne calendar days, plus reign count.
- `leaderboard/PlayerProfileButton` — prefetched profile navigation with an
  immediate `Opening…` state and duplicate-activation lock.

**Tournaments**
- `tournament/CupInviteConsole` — organiser bench multi-invite and RSVP status
  surface; responses remain separate from the final roster.
- `tournament/CupInvitePanel` — invited-player commitment action with explicit
  organiser final-field authority and stable pending feedback.
- `tournament/NewTournamentForm` — partial cup creation with required schedule,
  optional 2–8 ordered seats, and recoverable cover upload.
- `tournament/TournamentCoverComposer` — source-image frame, drag position,
  and 100–250% zoom editor used before cup creation. It retains the full frame
  while normalizing uploads to a bounded WebP before the Server Action runs.
- `tournament/TournamentLeadupConsole` — schedule lock, independent formats,
  championship path, ordered 2–8 roster, persisted-seed-safe player options,
  and permanent-lock checklist.
- `tournament/TournamentLifecycleActions` — irreversible draw lock plus
  retry-safe locked-in, game-day, and completed-placement email controls.
- `tournament/TournamentAdminActions` — fixture generation plus confirmed,
  explicit standings-completion and final-stage progression controls.
- `tournament/TournamentParticipantEditor` — pre-play admin replacement that
  preserves a seed and regenerates the complete round-robin draw.
- `tournament/TournamentBoard` — shared standings and round/court schedule used
  by the player and director views, including preserved skipped fixtures.
- `tournament/TournamentResultForm` — two-step admin review for short,
  standard, pro-set, and best-of-three fixtures with atomic approval.
- `tournament/TournamentPhotoControl` — admin-only tournament cover upload,
  16:7 crop/resize, replacement, and removal control mounted in the event hero
  tile; replacement sources use the same bounded upload preparation as
  creation.

**Profile**
- `profile/ProfileTabs` — routed Settings, Streak, and History segmented tabs.
- `profile/StreakTracker` — 7/30-day tennis-ball tracker, streak statistics,
  and same-day manual mark control.
- `profile/ProfileSettingsForm` — self-owned nickname preference and circular
  avatar crop/upload settings with stable pending feedback.

- `auth/PasswordResetRequestForm` - email recovery request with generic
  delivery feedback and stable pending state.
- `auth/UpdatePasswordForm` - recovery-link password replacement; invited
  profiles activate only after the password update succeeds.

Planned next (from ARCHITECTURE.md): `Card`, `RankBadge`, `StatBlock`.
# Test inventory

- `calendar/CalendarEventVisual.test` - cup imagery plus paired member and
  neutral external-opponent visual contract coverage.
- `calendar/CalendarExperience.navigation.test` - instant History API and
  browser back/forward contract coverage without Next router navigation.

## Planned matches

- `planned/PlanMatchForm` — player/external opponent picker and upcoming-match proposal form.
- `planned/PlannedActions` — participant accept, decline, and cancellation controls.
- `planned/PlannedResultForm` — post-play stakes, score, date, location, and result submission.
- `planned/ApproveResultButton` — opponent confirmation for a proposed planned-match result.
- `planned/PlannedCorrectionForm` — organiser editor that creates an append-only
  corrected proposal revision and returns it for participant confirmation.
- `match/QueriedMatchResubmitForm` — submitter correction surface for an
  ordinary queried match, preserving participants while resetting confirmation.
- `notifications/NotificationOpenButton` — prefetched navigation action with an
  immediate spinner, duplicate-click lock, and failure feedback.
- `notifications/ZeusInboxButton` — persistent 44px Zeus-avatar inbox action
  with a server-derived unread badge and active-route treatment.
- `notifications/NotificationRealtimeBridge` — owner-filtered Supabase Realtime
  refresh bridge for receiver inserts/read-state updates, with focus recovery.
- `notifications/MarkAllReadButton` — failure-aware pending control that clears
  every unread Zeus item and refreshes the global badge.
- `notifications/NotificationRealtimeBridge.test` — receiver-specific Realtime
  filter contract coverage.
- `notifications/ZeusInboxButton.test` — zero/unread/active-state rendering,
  accessible count wording, 44px target, and `99+` visual-cap coverage.

- `ui/BackLink.test` — contract coverage for deterministic parent-link rendering.
