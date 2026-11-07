# Scrapbound Backlog

Scope and long-term design: [GAMEPLAN.md](GAMEPLAN.md). Priority-ordered execution: [DEVELOPMENT_QUEUE.md](DEVELOPMENT_QUEUE.md). Keep this file current as work progresses.

**Statuses:** `TODO` · `IN PROGRESS` · `BLOCKED` · `DONE`  
**Priority:** `P0` foundation · `P1` next milestone · `P2` later

## Playable prototype

- [x] **SB-000 · P0 — Add browser-history route system** — `DONE` — Navigo routes for Factory, Brain Lab, and Expeditions; direct URLs, back/forward, root redirect, 404 view, and the Wemp Nginx subpath fallback.
- [x] **SB-001 · P0 — Set up Vite app and repo workflow** — `DONE` — `npm install`, `npm test`, and `npm run build` pass.
- [x] **SB-002 · P0 — Build Three.js factory scene** — `DONE` — responsive assembly bay, animated bots, workshop props, and camera reset.
- [x] **SB-003 · P0 — Replace idle income with robot-delivery economy** — `DONE` — balances change on simulation delivery/missions only; legacy elapsed-time/offline accrual removed; repeat purchase prices retained.
- [x] **SB-004 · P0 — Add upgrades and prestige loop** — `DONE` — robot speed/salvage modifiers, lifetime-credit shard preview, cycle reset, and permanent shard bonus.
- [x] **SB-005 · P1 — Add salvage expeditions** — `DONE` — deploy a robot crew, receive resources, and unlock an endless sector progression.
- [x] **SB-006 · P1 — Add Blockly brain workshop** — `DONE` — lazy-loaded Blockly workspace, supported action blocks, starter template, local save and deploy-to-crew flow.
- [x] **SB-009 · P0 — Make program instructions drive the 3D salvage loop** — `DONE` — renderer-independent simulation, visible caches, travel/scan/collect/return cycle, cargo payout on delivery; Blockly resource target selects the job.
- [x] **SB-007 · P0 — Browser playtest and tune initial economy** — `DONE` — automated Chromium playtest covers delivery, per-robot assignment, pause/speed, mobile emulation and WebGL fallback; findings and the remaining physical-device/manual-session limitation are in [PLAYTEST.md](PLAYTEST.md).
- [x] **SB-008 · P1 — Add WebGL fallback and accessibility options** — `DONE` — added a live 2D canvas factory fallback, persistent reduced-motion preference, and low/medium/high renderer quality settings. Browser E2E covers controls and WebGL failure while keeping simulation status usable.

## Persistent single-player

- [x] **SB-010 · P0 — Choose backend and persistence contract** — `DONE` — Laravel 13 + MySQL; browser game save remains local until server-authoritative progression is implemented.
- [x] **SB-011 · P0 — Server-authoritative currency ledger** — `DONE` — transactional wallet balances, audited starter grants, internal idempotent grants/spends, authenticated wallet reads/debits, replay-conflict and insufficient-funds checks. Verified using SQLite feature tests and a temporary Nginx/MySQL account cleaned up after testing.
- [x] **SB-012 · P0 — Server-authoritative robot simulation and ledger** — `DONE` — Laravel validates bounded program IR, resolves fixed-step runs using the authenticated player's persisted roster/programs, and settles delivery-only grants idempotently with per-user run receipts/rate limits.
- [x] **SB-013 · P1 — Configurable content catalog** — `DONE` — validated versioned DB catalog for items/upgrades/cost-growth/rewards/feature flags; Laravel exposes active catalog and browser economy/simulation consumes cost and reward values.
- [x] **SB-014 · P1 — Admin content studio** — `DONE` — admin-only JSON editing/preview, schema validation, immutable draft versions, audited publish/disable, and rollback by publishing a new version copied from historical content. Moderators and players are denied. Feature tests cover role boundaries, validation, immutable history, publish, disable, rollback, and audit.
- [x] **SB-015 · P1 — Persistent robot jobs and template inventory** — `DONE` — server-persisted roster/programs, catalog-priced robot purchases, versioned compatible templates and unlock/deploy APIs; signed-in client loads jobs/wallet, persists assignments/purchases and cannot earn local-only account currency. Server simulation now uses saved ownership/programs.
- [x] **SB-016 · P1 — Timed PvE mission resolution** — `DONE` — server-owned mission launches snapshot the programmed roster and catalog reward/rule version, enforce bounded duration and sector/crew requirements, resolve deterministic seeded success/failure with replay events, reject early claims, grant successful rewards idempotently, and advance progression only on success. Signed-in browser supports launch, countdown, claim, wallet refresh, and replay display.

## Accounts and community

- [x] **SB-030 · P0 — Simple callsign/password accounts** — `DONE` — Laravel auth, hashed passwords, session rotation, HttpOnly/SameSite cookie, CSRF on mutations. Needs a configured MySQL database to run.
- [x] **SB-031 · P1 — Shared help/trade/collaboration board** — `DONE` — persistent public posts/replies, collaboration interest, owner close/match action.
- [x] **SB-036 · P1 — Add role and token foundations** — `DONE` — Spatie player/moderator/admin roles and Sanctum token model/migration; token issuance and privileged admin routes remain disabled until policy requirements are ready.
- [x] **SB-032 · P0 — Configure and verify Wemp database/API** — `DONE` — local MySQL connection/migrations and role seed verified; Nginx multi-session test passed register/login/logout, shared post visibility, join/reply; temporary accounts and posts cleaned up. `.env` remains private.
- [x] **SB-037 · P1 — Define moderator and admin authorization policies** — `DONE` — explicit Laravel abilities distinguish moderator queue/report access from admin-only community settings and catalog management; role matrix covered by feature tests. Unblocks SB-033 and SB-014 authorization work.
- [x] **SB-033 · P1 — Community moderation and abuse controls** — `DONE` — post reports, user blocks, mutual visibility/interaction filters, post/reply/join/report/block/moderation rate limits, role-gated report queue and hide/dismiss actions, audit log, and daily retention pruning (reports 180 days; audit 365 days). Feature tests cover player/moderator authorization, report flow, hidden-feed behavior, blocks, rate limits, and pruning.
- [ ] **SB-034 · P1 — Server-authoritative inventory and escrow trades** — `TODO` — integrate wallet/inventory with gameplay, atomic escrow, accept/decline/cancel/expiry, audit log. Current trade posts only coordinate offers.
- [ ] **SB-035 · P2 — Shared cooperative jobs** — `TODO` — persistent parties, join/leave rules, contribution tracking, reward settlement, notifications.

## Competitive and long-term progression

- [x] **SB-020 · P1 — Deterministic simulation core** — `DONE` — renderer-independent seeded engine, versioned bounded headless resolver input/output, and equal-input replay/validation tests. Independent of blocked SB-032.
- [x] **SB-021 · P1 — Async battle snapshots and resolver** — `DONE` — public server-owned defense snapshots, ownership-validated challenge loadouts, bounded deterministic server resolution/replay, immutable match receipts, idempotent winner-only currency settlement, and private participant history. API feature tests cover snapshots, retries, self-match rejection, program edits after publication, replay bounds, and rewards.
- [x] **SB-022 · P1 — PvP abuse controls** — `DONE` — capped challenges at five per player per hour, prevents repeat matches between the same two pilots (in either direction) for 24 hours, and serializes pair checks to close concurrent farming races. Idempotent retries return the stored result before cooldown checks; participant-only history, deterministic replay receipts, winner-only ledger reward keys, rate limits, self-match rejection, pair cooldowns, and reward uniqueness are covered by exploit-focused tests.
- [x] **SB-023 · P2 — Three.js battle replay viewer** — `DONE` — added versioned 3D arena replay from trusted battle receipts, bounded/sanitized events, play/pause and scrubbing, 1×/2×/4× speed, reduced-motion behavior, and a 2D fallback. E2E covers publishing both defenses, challenging, and operating the replay.
- [x] **SB-024 · P2 — Infinite tier and season progression** — `DONE` — configurable geometric competitive rating tiers, validated ordered milestones, environment-selectable season keys, transactional per-season win/loss standings, and a signed-in league/tier/milestone summary with top-50 leaderboard. Balance knobs live in `config/progression.php` (`SCRAPBOUND_SEASON_KEY`, tier base/growth, match points, milestones); battle rewards and standings settle atomically and idempotently with the match receipt. Feature tests cover tier growth and server-settled standings; PHP and browser suites plus production build pass.
- [x] **SB-046 · P2 — PvE arena encounters for PvP builds** — `DONE` — players can deploy their persisted owned robot/program build against bounded configurable NPC encounters; server snapshots NPC stats and loadout, resolves seeded fights, stores private replay receipts, and grants win-only idempotent credits. PvE has its own rate limit/history and does not update PvP ratings, standings, or cooldowns. Feature tests verify auth, configuration/ownership rejection, snapshots/replay persistence, idempotent rewards, and PvP-state isolation; signed-in Playwright flow passes.

## Programmable 3D simulation

- [x] **SB-040 · P0 — Visible resource sites and robot task simulation** — `DONE` — renderer-independent fixed-step job loop; robots travel to caches, scan, collect, and return cargo.
- [x] **SB-041 · P0 — Compile and deploy Blockly actions** — `DONE` — bounded allowlisted instruction list; collection target controls which resource cache is visited.
- [x] **SB-045 · P1 — Validate program IR and cover app browser flow** — `DONE` — Zod validation, fast-check properties, and Playwright route/deploy E2E coverage.
- [x] **SB-042 · P1 — Extend robot instruction set** — `DONE` — bounded cargo/cache conditionals, explicit repeat-cycle behavior, whole-crew/per-robot assignments, and compiler/schema/simulation coverage.
- [x] **SB-043 · P1 — Deeper factory simulation feedback** — `DONE` — robot tool animation, cache stock/scanned visuals, delivery pulse and recent-delivery/status feedback without WebGL.
- [x] **SB-044 · P1 — Simulation replay and deterministic verification** — `DONE` — seeded cache stock and bounded ordered events; repeated fixed-step runs produce identical snapshots/payouts; pause and 1×/2×/4× controls.

## Progress log

| Date | Tasks | Progress / verification |
|---|---|---|
| 2026-11-06 | SB-000–SB-006 | First playable prototype scaffolded with history routes at the Wemp Nginx subpath. `npm test` passes (4 tests); production build passes; Nginx config test and HTTP checks for `/factory` and its JS asset return 200. Browser/WebGL playtest remains open. |
| 2026-11-06 | SB-030–SB-031 | Migrated auth and shared help/trade/collaboration board to Laravel. Database setup and multi-user API test remain open. |
| 2026-11-06 | SB-003, SB-009, SB-040–SB-041 | Removed time-based/offline currency and added a testable robot job simulation; Blockly deployment chooses target resource, and cargo is paid only on return. |
| 2026-11-06 | SB-036, SB-045 | Installed Sanctum, Spatie Permission, Zod, fast-check, and Playwright; integrated role/token foundations, program validation, property tests, and browser E2E coverage. |
| 2026-11-06 | SB-042 | Added whole-crew vs individual Blockly deployment, per-robot saved assignments, and simulation restore coverage. |
| 2026-11-06 | SB-042–SB-043 | Finished bounded cargo/cache conditions and repeat-cycle semantics; added cache stock/scanned state, robot tool animations, delivery events/pulse, and readable recent-delivery feedback. Verified `npm test` (12), production build, and Playwright E2E (3). |
| 2026-11-06 | SB-044, SB-007 | Added seeded ten-minute replay equivalence and completed Chromium browser coverage for delivery, per-unit delegation, pause/speed, 390×844 mobile emulation and simulated WebGL failure. Findings: [PLAYTEST.md](PLAYTEST.md); manual device/usability session remains future validation. |
| 2026-11-06 | SB-020 | Started the database-independent deterministic core task while SB-032 remains blocked: moved the simulation engine to `simulation-core.js` and added the versioned bounded resolver contract. |
| 2026-11-06 | SB-020 | Completed the headless simulation contract; `npm test` passes (15 tests) and `npm run build` passes. Downstream database-dependent rows are marked blocked pending SB-032 credentials. |
| 2026-11-06 | SB-032 | Verified private local MySQL config without exposing values, all migrations up, role seeding, Laravel feature tests, and an Nginx two-session community flow; removed only its temporary test users and cascading data. |
| 2026-11-06 | SB-011 | Added transactional wallets and auditable idempotent currency ledger. Feature and Nginx/MySQL checks verified starter balances, spend replay, and overspend rejection; temporary verification user/ledger rows were removed. |
| 2026-11-06 | SB-012 | Added Laravel program validation and bounded PHP fixed-step resolution, plus authenticated run receipts/rate limits and idempotent grants only for calculated deliveries. Nginx/MySQL run/replay check passed and temporary account data was cleaned; client wallet reconciliation awaits SB-015. |
| 2026-11-06 | SB-012 | Completed with 13 Laravel tests and Pint passing; Nginx/MySQL run resolved a delivery, ignored client-supplied crew counts, granted once, and replayed idempotently. Promoted SB-013 ahead of SB-015 because the catalog is an explicit prerequisite. |
| 2026-11-06 | SB-013 | Added validated versioned catalog storage/seeding and public active-catalog API; browser purchases and mission/salvage reward rules now consume catalog values. API confirmed version 1 on Nginx/MySQL; 16 Laravel tests, JS tests, build, and Pint pass. |
| 2026-11-06 | SB-015 | Persisted starter/owned robots, saved programs, purchase receipts, versioned compatible templates and unlocks. Signed-in E2E passed load/deploy/purchase; live Nginx/MySQL verified persisted scrap instructions determine server payouts and run replay is idempotent. Temporary verification accounts and cascading data were removed. Final checks: Laravel 20 tests, JS 15 tests, build, 10 E2E tests, and targeted Pint pass. |
| 2026-11-06 | SB-016 | Promoted to `IN PROGRESS`: its listed prerequisites SB-020/SB-011/SB-012 are now complete; SB-015 also provides server-owned rosters and wallets for mission resolution. |
| 2026-11-06 | SB-016 | Completed timed PvE missions with persistent progress/run receipts, owned programmed-roster validation, server-generated seeds, immutable catalog snapshots, duration-gated claims, deterministic outcomes/replay events, and one-time successful wallet grants. Fixed signed-in currency remaining at 120: browser run keys exceeded the API length limit, so server simulation requests were rejected; shortened keys and verified live payouts. Laravel 24 tests, 10 E2E tests, build, targeted Pint, and live Nginx/MySQL mission/claim/replay checks pass; temporary verification data removed. |
| 2026-11-06 | SB-037 | Defined explicit moderator/admin policy abilities: moderators/admins can view the moderation queue and resolve reports; only admins can manage moderation settings or the game catalog. Role-matrix tests and Pint pass. Started SB-033, now unblocked. |
| 2026-11-06 | SB-033 | Added authenticated post reports and player block/unblock, blocked-user feed/interactions filtering, board action rate limits, moderator queue and hide/dismiss actions, hidden-post filtering, and moderation audit records. Reports prune after 180 days and audits after 365 days via daily Artisan schedule. Migration applied to MySQL; 29 Laravel tests, 15 JS tests, 10 E2E tests, build, Pint, and diff check pass. SB-014 is now unblocked. |
| 2026-11-06 | SB-014 | Added admin-gated catalog studio APIs and UI for validated previews, immutable draft creation, publication, disable, and rollback by publishing a new version linked to its source. All actions create audit records; player/moderator access is denied. Migration applied; 31 Laravel tests, 15 JS tests, 10 E2E tests, build, Pint, and diff check pass. |
| 2026-11-06 | SB-008 | Added an interactive 2D factory canvas for WebGL failure, with live robot/cache snapshots and continued simulation status. Added saved reduced-motion and render-quality controls. Full Playwright suite verifies settings and fallback; production build passes. |
| 2026-11-06 | SB-021 | Added public published defense snapshots and authenticated challenges using persisted owned robots/programs; server-generated seeds drive bounded combat (10 rounds/22 replay events), immutable receipts, idempotent run-key retries, and 25-credit winner payouts through the currency ledger. Added arena UI and participant match history. Migration applied; 34 Laravel tests, 15 JS tests, 10 E2E tests, build, Pint, and diff check pass. Started SB-022 for dedicated PvP abuse hardening. |
| 2026-11-06 | SB-022 | Reduced challenge rate to five per pilot per hour; enforced a symmetric per-pair 24-hour cooldown under ordered user-row locks while preserving same-key idempotent retries. Added exploit tests for cooldown reversal, cross-user history privacy, hourly limits, deterministic replay, and a single auditable reward ledger entry. 36 Laravel tests, 15 JS tests, Pint, and diff check pass. |
| 2026-11-06 | SB-023 | Added a Three.js arena replay for the trusted `battle-v1` event stream, with play/pause, event scrubbing, 1×/2×/4× playback, reduced-motion timing, WebGL fallback, and renderer cleanup when navigating away. Expanded Playwright coverage through defense publication, challenge resolution, replay opening, and playback controls. 36 Laravel tests, 15 JS tests, 10 E2E tests, build, Pint, and diff check pass. |

### Update format

For meaningful work, add a dated log row and update affected checkboxes/statuses. Record exact verification and blockers; only check off work when its acceptance criteria are met.
