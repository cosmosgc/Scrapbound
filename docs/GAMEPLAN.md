# Robot Factory — Game Plan

> **Implementation status (2026-11-09):** Scrapbound is a Laravel 13 application (Blade routes, Laravel sessions/auth, Eloquent and migrations) with a Vite-built vanilla JavaScript/Three.js/Blockly client. Guest saves remain browser-local. Signed-in progression uses server-owned wallets/jobs, delivery-settled online simulation, timed PvE, co-op salvage, NPC arena battles, escrow trades, persistent technology, and bounded offline settlement. The mining field now contains 136 solid voxel blocks; bots break blocks into pickups, reserve targets exclusively, and use role-specific automatic behavior and models. PHP/JS steering avoids live blocks and static props; global pathfinding/congestion optimization remains future work. See [VOXEL_MINING.md](VOXEL_MINING.md) for the current field and role rules.

> **Social direction:** accounts and a shared community board support asking for help, proposing negotiation posts, and recruiting collaborators. Targeted item-for-credit trades now use server-owned inventory, reserved escrow, atomic wallet settlement, and audit events.

> **Expansion direction:** see [EXPANSION_PLAN.md](EXPANSION_PLAN.md) for remaining growth areas. The central depot, seeded resource assignment, technology branches, obstacle-aware bots, admin catalog editing, and battle replay foundations are already implemented; proposed content additions and more advanced global pathfinding remain future work.

## Product direction

Turn Robot Battle Arena into a browser-based incremental automation game. Players build programmable robots, assign them to jobs, and watch a Three.js factory/battle simulation visualize their work. The first milestone is a fun single-player loop that works without other players online. Asynchronous competition comes after the simulation and reward rules are deterministic and server-authoritative.

## Core player loop

1. **Build the crew:** buy bots and unlock specialized roles through the technology tree.
2. **Mine the voxel field:** role automation sends miners to solid blocks; a break leaves a resource pile.
3. **Haul and deliver:** haulers reserve and collect piles; only depot delivery pays currency. Signed-in offline catch-up runs the same bounded server simulation.
4. **Customize:** use automatic role behaviors by default or deploy explicit Blockly programs to the whole crew or individual bots.
5. **Grow the operation** with technology that unlocks bot kinds/resources and changes spawn weights, delivery values, stock, and respawn time.
6. **Spend** delivered resources on robots, upgrades, research, and programs.
7. **Run missions and battles**, then improve the roster and prestige when progress slows.

Battles are tactical demonstrations and asynchronous contests, not a mandatory real-time PvP queue. Players can submit a robot + immutable program/equipment snapshot. The opponent can submit later; a deterministic server simulation resolves the match. A replay is watchable in Three.js whenever either player returns.

## Currencies and earning sources

| Currency | Role | Earned from | Spent on |
|---|---|---|---|
| Credits | Common, renewable | Delivered credit-block drops, missions, battle rewards, daily goals | Basic robots, stations, upgrades, templates |
| Parts | Crafting material | Delivered scrap-block drops, dismantling duplicate items, missions | Equipment, robot tiers, advanced stations |
| Core Shards | Rare prestige currency | Prestige, one-time milestones, selected high-tier contracts | Permanent bonuses, premium templates, extra automation slots |

Never sell paid power in the initial design. Online rewards require a completed depot delivery; offline rewards are calculated by bounded server-side simulation of that same delivery loop, not by a passive time multiplier. Prestige rewards use a bounded formula, are previewed before confirmation, and never subtract already-earned shards.

## Progression and balance

- Infinite tiers use configured base costs and growth curves, rather than hardcoded per-tier entries. Initial defaults: cost growth 1.16x; mission reward and enemy strength scale by tier; cap individual numeric values server-side.
- Production is expressed as base output × owned count × additive research bonuses × multiplicative station bonuses × prestige bonus.
- Unlocks are data-driven: content declares prerequisites, currencies, costs, output, visibility, and a version.
- Add diminishing returns and milestone unlocks so the only sensible strategy is not buying one item forever.
- Admins can disable content without deleting it; existing player inventory remains valid. Config changes are versioned and auditable.

## Blockly and robot jobs

Keep Blockly as the visual editor for explicit custom programs. Standard bot roles run automatic mining, hauling, or support routines without requiring a Blockly program. The supported program instruction set includes patrol, scan, collect, wait/repeat, navigation, and bounded cargo/site conditionals; deployments can target the whole crew or one robot. Programs are validated and persisted for signed-in players. The renderer never executes generated code. Never use `eval`/`new Function`.

## Three.js simulation

- Three.js is the browser renderer; simulation rules remain separate from rendering. `resources/js/simulation-core.js` is renderer-independent and testable in Node; PHP mirrors server-authoritative rules.
- The current field has 136 solid blocks; mining destroys a block and creates a separate pickup. A unique reservation prevents two bots working the same block or drop. Depleted blocks show a respawn countdown (60 seconds by default; alloy is 30 seconds with Field Refinery).
- Ground bots route around live blocks and approach a free side; the flying miner ignores ground collisions. Stalled targets are released. This is bounded local steering rather than global A*.
- Frame rate and browser sleep never directly mint resources. Online ticks are clamped and rewards follow depot delivery; signed-in offline catch-up uses bounded server-side fixed-step simulation and pays only its completed deliveries.
- Keep a reduced-motion/low-quality mode and a 2D fallback for unsupported WebGL devices.
- Server results must not depend on the player's frame rate, browser tab, or Three.js rendering.

## Asynchronous player battles

1. Attacker selects a public defense snapshot and commits a robot/program loadout.
2. Server validates ownership, energy, loadout, and content versions; it stores immutable inputs and a seed.
3. A worker/server-side deterministic resolver calculates the result and replay events. Until a worker queue exists, resolve synchronously with strict time/block budgets.
4. Both players receive results, currency rewards, rating changes, and replay access. Use idempotent match IDs and a unique reward claim to prevent duplicate payouts.
5. Defense loadouts are snapshots; later edits do not rewrite queued or completed matches.

No browser-submitted winner, damage, or currency total is trusted. Rate-limit challenges and prevent self-match farming. Start with asynchronous 1v1 defenses; add leagues/tournaments only after this is reliable.

## PvE arena battles

Players can deploy the same robot and program build they use for PvP against server-controlled NPC opponents. This is a distinct battle mode, not a PvP defense snapshot or challenge, and never requires another pilot to be online. It reuses validated owned programs and the deterministic resolver; NPC configurations define difficulty tiers, combat stats, and win rewards. The selected build and NPC rules are snapshotted into private seeded receipts with a readable replay history. PvE results do not affect PvP season ratings, standings, or challenge cooldowns. Keep these battles distinct from timed salvage expeditions, which focus on crew deployment, sector progress, and resources.

## Cooperative salvage jobs

Signed-in pilots can create an open sector contract and form a party of at most four players. A party member contributes by completing one successful server-resolved mission for the contract's sector; the server snapshots the selected co-op job on mission launch and records each contribution once. When the configured contribution goal is met, each contributor receives the same fixed credit bonus through the currency ledger. Members can leave before contributing, but the owner cannot leave and contributors remain through settlement. In-app notifications show joins, progress, and completion. Co-op jobs do not move items/currency between players.

## Accounts and player community

- Use simple callsign + password accounts, hashed server-side. Keep the first version password-only; do not collect email, real names, or unnecessary profile data.
- Laravel authentication uses hashed passwords, same-origin session cookies, and CSRF protection for mutations. Spatie roles provide a server-side `player`/`moderator`/`admin` foundation; privileged tools still require explicit policies and tests. Sanctum token support is installed for potential non-browser clients, but no token endpoint is exposed while the browser uses sessions.
- The community board supports public help requests, offers/wants, and collaboration plans; signed-in players can reply, express interest/join, and close their own post.
- All posts and replies are public to board visitors. Do not add direct messages or expose personal contact information in this first version. Add report/block/moderation tools before opening beyond a trusted test group.
- **Escrow trades are server-authoritative.** A seller targets one recipient and offers catalog-tradable items for credits; items are reserved at offer creation. Only the recipient can accept/decline and only the seller can cancel. Acceptance settles item and wallet mutations in one database transaction; expiry timestamps are checked when offers are viewed or acted on, and expired offers release escrow. Database triggers prohibit audit updates/deletes; no background scheduler is required for trade expiry.
- Collaborations initially record interest and public discussion; they do not yet share robots, rewards, or account resources.

## Admin content studio

Restrict every write endpoint to admins server-side. Admin sections should manage:

- **Items/equipment**: stable key, localized name/description, slot, stats, price/currency, unlocks, enabled flag.
- **Upgrades/research**: cost curves, effects, prerequisites, repeatability, caps.
- **Currencies/rewards**: delivery reward tables, mission payout ranges, simulation bounds, prestige formula; validate bounded values. Offline catch-up is bounded server simulation, not passive interest.
- **Blockly templates**: serialized workspace, version, category, prices, prerequisites, compatibility, beginner/advanced visibility.
- **Missions/jobs**: duration, requirements, reward tables, opponent rules, unlocks.
- **Economy config**: global curves and feature flags.

Require preview/validation before publish, immutable version history, audit log, and safe rollback. The admin Catalog Studio includes structured catalog editors, Advanced JSON, typed technology-effect and prerequisite editors, and a draggable honeycomb node layout stored in catalog drafts.

## Data and security plan

Use MySQL/MariaDB for authenticated progression. Add users' credit/part/shard balances, prestige count, inventories, robot assignments, mission state, content tables with published versions, a currency transaction ledger, async match snapshots/results/replay events, and admin audit entries. Apply all purchases/rewards in transactions with row locking and idempotency keys. The server calculates prices/rewards and validates content; never trust browser balances. Provide a migration script and preserve current robots/programs/challenges during transition.

Guest factory simulation and saves are browser-local (`localStorage`) for prototyping. Signed-in players load persisted robot jobs and wallets from Laravel; server-run deliveries and explicit timed mission launches settle rewards through the ledger. Client-provided balances, crew counts, mission seeds, and outcomes are not authoritative.

Laravel migrations create users, community posts, wallets/ledger entries, versioned catalogs, robot jobs/templates, deterministic simulation receipts, and timed mission progress/runs. Authenticated gameplay balances and inventories are intentionally not exposed through the community board.

## Delivery milestones

1. **Implemented foundation:** voxel mining/hauling, automatic bot roles, custom Blockly programs, server-authoritative deliveries and bounded offline catch-up.
2. **Implemented progression/social systems:** technology/catalog editing, missions, co-op jobs, moderation, inventory escrow, PvE/PvP resolvers and replays.
3. **Next expansion:** more terrain/zone variety, stronger global pathfinding and congestion handling, additional role/content branches, and live-operations monitoring.

## Initial acceptance criteria

- A visitor can see a 3D animated factory and robots without a native install.
- Automatic miners visibly break blocks into drops; haulers retrieve them and currency is granted only on depot delivery.
- Explicit Blockly programs remain deployable and can select a resource target; role automation is available without a program.
- Currency changes only when a robot brings cargo back to the bay; simulation tests verify no early payout.
- Credits can buy basic production; prestige creates Core Shards and resets a run while retaining permanent prestige progress.
- Admins can edit prototype item/upgrade prices; production publishing will move to authenticated, versioned server content before launch.
- Existing Blockly workspaces remain intact and Three.js remains a renderer, not an execution engine.
- No asynchronous match can pay rewards based only on client-provided results.
