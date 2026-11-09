# Robot Factory — Game Plan

> **Implementation status (2026-11-08):** Scrapbound is a Laravel 13 application (Blade routes, Laravel sessions/auth, Eloquent and migrations) with a Vite-built vanilla JavaScript/Three.js/Blockly client. Local playtest saves remain available to guests. Signed-in progression uses MySQL-backed wallets, robot jobs/programs, delivery-only server simulation, timed PvE missions, shared cooperative salvage jobs, NPC arena battles using saved PvP builds, server-owned item inventory with escrow trades, a seeded multi-zone field, persistent technology, and bounded offline settlement. Deterministic multi-bot spacing and static obstacle-aware routing are implemented; advanced grid pathfinding and congestion behavior remain future work.

> **Social direction:** accounts and a shared community board support asking for help, proposing negotiation posts, and recruiting collaborators. Targeted item-for-credit trades now use server-owned inventory, reserved escrow, atomic wallet settlement, and audit events.

> **Expansion direction:** the next larger-world vision is documented in [EXPANSION_PLAN.md](EXPANSION_PLAN.md): a bigger seeded salvage field with a central delivery depot, deterministic bot collision avoidance, a multi-unlock technology tree, expanded admin content controls, and watchable Three.js PvE/PvP battles. This is proposed design, not current implementation status.

## Product direction

Turn Robot Battle Arena into a browser-based incremental automation game. Players build programmable robots, assign them to jobs, and watch a Three.js factory/battle simulation visualize their work. The first milestone is a fun single-player loop that works without other players online. Asynchronous competition comes after the simulation and reward rules are deterministic and server-authoritative.

## Core player loop

1. **Program and deploy** robot jobs; Blockly instructions decide where bots go and what they collect.
2. **Collect and deliver** salvage: resources occupy random seeded grid cells, and bots return cargo to the central storage depot before credits or parts are paid.
3. **Grow the operation** with technology unlocks that expand the field, add visible structures/resource families, and improve production. Bounded server-resolved offline bot work is being added, with rewards still gated on actual depot delivery.
3. **Spend** delivered resources on robots, factory stations, upgrades, research, and Blockly brain templates.
4. **Automate** jobs by editing and deploying reusable programs; robot count and robot type affect throughput/capacity.
5. **Run missions**: later PvE contracts and arena tests should also be visible simulations governed by the deployed program and pay only on successful return.
6. **Improve** the robot roster, equipment, automation capacity, and Blockly programs.
7. **Prestige** when progress slows: reset the current run for Core Shards and permanent bonuses, then rebuild faster.
8. **Repeat** through scaling sectors, resource-site modifiers, collection goals, and prestige milestones.

Battles are tactical demonstrations and asynchronous contests, not a mandatory real-time PvP queue. Players can submit a robot + immutable program/equipment snapshot. The opponent can submit later; a deterministic server simulation resolves the match. A replay is watchable in Three.js whenever either player returns.

## Currencies and earning sources

| Currency | Role | Earned from | Spent on |
|---|---|---|---|
| Credits | Common, renewable | Delivered credit-cache salvage, missions, battle rewards, daily goals | Basic robots, stations, upgrades, templates |
| Parts | Crafting material | Delivered scrap-cache salvage, dismantling duplicate items, missions | Equipment, robot tiers, advanced stations |
| Core Shards | Rare prestige currency | Prestige, one-time milestones, selected high-tier contracts | Permanent bonuses, premium templates, extra automation slots |

Never sell paid power in the initial design. Do not award resources just because time passed or the player was away. Earnings come from completed, observable robot work. Prestige rewards use a bounded formula, are previewed before confirmation, and never subtract already-earned shards.

## Progression and balance

- Infinite tiers use configured base costs and growth curves, rather than hardcoded per-tier entries. Initial defaults: cost growth 1.16x; mission reward and enemy strength scale by tier; cap individual numeric values server-side.
- Production is expressed as base output × owned count × additive research bonuses × multiplicative station bonuses × prestige bonus.
- Unlocks are data-driven: content declares prerequisites, currencies, costs, output, visibility, and a version.
- Add diminishing returns and milestone unlocks so the only sensible strategy is not buying one item forever.
- Admins can disable content without deleting it; existing player inventory remains valid. Config changes are versioned and auditable.

## Blockly and robot jobs

Keep Blockly as the visual editor. The first supported instruction set is patrol → scan → collect a selected resource, plus wait/repeat. Deploying compiles only supported blocks into a bounded instruction list; assignments can target the whole crew or one robot and persist in the local save. The renderer never executes generated code. A robot can later be assigned to a factory job, PvE mission, or asynchronous battle with an immutable program snapshot. Add reusable, versioned brain templates (workspace JSON plus display name, category, unlock condition, price, and compatible job types). Never use `eval`/`new Function`.

## Three.js simulation

- Three.js is the browser renderer; simulation rules remain separate from rendering.
- The initial `resources/js/simulation.js` is renderer-independent and testable in Node. Keep expanding it toward deterministic, headless-capable fixed-step rules; render its snapshots in Three.js.
- Resource sites have visible stock/respawn; robots visibly travel, scan, gather cargo, and return to the home bay. A deployed program must change the robot's target and delivered resource.
- Frame-rate changes, browser sleep, and offline time never mint resources. Clamp simulation delta and award only on a completed delivery event.
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
- **Currencies/rewards**: delivery reward tables, mission payout ranges, simulation bounds, prestige formula; validate bounded values. Do not implement idle/offline accrual.
- **Blockly templates**: serialized workspace, version, category, prices, prerequisites, compatibility, beginner/advanced visibility.
- **Missions/jobs**: duration, requirements, reward tables, opponent rules, unlocks.
- **Economy config**: global curves and feature flags.

Require preview/validation before publish, immutable version history, audit log, and safe rollback. The current admin JSON textarea is a local prototype only and is not a production admin surface.

## Data and security plan

Use MySQL/MariaDB for authenticated progression. Add users' credit/part/shard balances, prestige count, inventories, robot assignments, mission state, content tables with published versions, a currency transaction ledger, async match snapshots/results/replay events, and admin audit entries. Apply all purchases/rewards in transactions with row locking and idempotency keys. The server calculates prices/rewards and validates content; never trust browser balances. Provide a migration script and preserve current robots/programs/challenges during transition.

Guest factory simulation and saves are browser-local (`localStorage`) for prototyping. Signed-in players load persisted robot jobs and wallets from Laravel; server-run deliveries and explicit timed mission launches settle rewards through the ledger. Client-provided balances, crew counts, mission seeds, and outcomes are not authoritative.

Laravel migrations create users, community posts, wallets/ledger entries, versioned catalogs, robot jobs/templates, deterministic simulation receipts, and timed mission progress/runs. Authenticated gameplay balances and inventories are intentionally not exposed through the community board.

## Delivery milestones

1. **Programmable salvage prototype (now)**: Laravel-served game, Three.js robot/resource motion, Blockly interpreter, delivery-based local economy, and community board.
2. **Simulation depth**: more job instructions, visible work animations, resource-site variety, deterministic replay, accessibility/performance fallback.
3. **Server-authoritative single-player**: Laravel economy ledger, validated job assignments/program versions, missions, and admin-managed catalog/templates. No passive/offline accrual.
4. **Community safety and useful collaboration**: moderation/report/block, reliable collaboration groups, notifications, and server-owned inventory.
5. **Progression depth and async PvP**: tiers, immutable match snapshots, resolver/replays, escrow-safe trades and rewards.
6. **Live operations**: leagues/seasons, admin feature flags, metrics, economy tuning, anti-abuse monitoring.

## Initial acceptance criteria

- A visitor can see a 3D animated factory and robots without a native install.
- A robot earns nothing while idle or while the page is closed; running a program visibly sends it to a matching salvage site.
- Changing a Blockly collect target changes the selected resource site and the resource delivered to the account.
- Currency changes only when a robot brings cargo back to the bay; simulation tests verify no early payout.
- Credits can buy basic production; prestige creates Core Shards and resets a run while retaining permanent prestige progress.
- Admins can edit prototype item/upgrade prices; production publishing will move to authenticated, versioned server content before launch.
- Existing Blockly workspaces remain intact and Three.js remains a renderer, not an execution engine.
- No asynchronous match can pay rewards based only on client-provided results.
