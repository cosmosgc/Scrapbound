# Scrapbound Expansion Plan

> **Status:** The larger-world foundation is in progress: the simulation now uses a larger bounded field, seeded varied salvage sites, and a central delivery point. Remaining implementation phases below are proposed; see [DEVELOPMENT_QUEUE.md](DEVELOPMENT_QUEUE.md) for active work.

## Product goal

Grow the compact workshop into a larger, readable salvage field. Robots leave a central storage hub to work resource sites that appear at varied locations, avoid one another while navigating, and return to the hub before any delivered currency is awarded. Players expand their operation through a branching technology tree. Admins can safely tune the tree, bots, resources, and battle content. PvE and PvP encounters become watchable Three.js simulations driven by trusted server results.

## Target player loop

1. Scout a large salvage field and inspect resource sites randomly assigned to valid grid cells in each seeded world.
2. Assign bots jobs and work programs; bots travel around obstacles and one another to collect bounded cargo while the operation continues between visits.
3. Return cargo to the central storage depot. Only a completed depot delivery settles credits or other currencies, including bounded offline catch-up.
4. Spend delivered resources on technology nodes that unlock multiple things: bot models, modules, resource zones, capacities, programs, and later branches.
5. Configure the newly unlocked operation, then watch its throughput, improve bottlenecks, and expand the idle production ceiling.
6. Enter PvE or PvP battles and watch a Three.js presentation of the server-resolved encounter, with replay controls.

## 1. Larger salvage scene and resource spawning

### Design

- Expand the playable ground plane into readable zones rather than merely scaling up the current assembly bay. Preserve camera controls, responsive layouts, reduced-motion mode, and a useful 2D fallback.
- Put one unmistakable **central storage depot** at the scene's operational center. It is the delivery target for every bot carrying sellable or transferable cargo; collection alone does not grant currency.
- Spawn resource sites by selecting distinct cells from a bounded world grid using a seeded shuffle. Site definitions include resource type, stock, radius, spawn weight, respawn policy, and allowed zone; exclude the depot, central platform, walls, inaccessible terrain, and other reserved areas. Cell size and grid origin are part of the simulation version.
- Assign resource types with a seeded weighted draw from the definitions unlocked for that account and zone. Technology can change which types are eligible and their relative spawn weights, while the seed fixes the outcome for the world snapshot.
- A resource definition should include stable ID, display/icon data, rarity, eligible zones, base spawn weight, stock and respawn ranges, and delivery outputs (currency and/or inventory items). This makes new salvage families content additions rather than new hard-coded simulation branches.
- Make the world seed and site layout reproducible for a given run/snapshot. “Random” means seeded variation, not client-selected payout or unbounded coordinates. Show each site’s resource, remaining stock, and respawn state.
- Keep the visual scene separate from the rules. Renderer frames may interpolate movement, but cannot create resources, deliveries, or rewards.

### Acceptance checks

- Different seeds produce varied but valid site layouts; replaying the same seed and rules produces the same layout and outcomes.
- Spawned sites never overlap the depot or invalid terrain and always remain reachable by the supported navigation system.
- A bot collecting cargo has no currency payout until it reaches the depot and completes delivery; interrupted or duplicate delivery claims cannot pay twice.
- Existing local guest play remains available, while signed-in balances and rewards remain server-authoritative.
- Every generated site occupies a valid grid cell with no duplicate cell occupancy, and repeated seeds reproduce the same selected cells in both JavaScript and PHP.
- Unlocked spawn-table changes produce a new deterministic layout from the same world seed plus the versioned progression/content snapshot; they never move or reroll sites on every UI refresh.

## 2. Incremental idle operation and offline progress

The incremental loop should come from bots doing visible, understandable work—not an unexplained passive wallet multiplier. Programs, resource stock, cargo capacity, travel, and depot deliveries continue to define how production is earned. Upgrades and technology nodes raise throughput, add production options, or expand safe offline capacity.

### Offline settlement contract

- Persist each account’s authoritative world seed and last-settled server timestamp. The browser must never provide elapsed time, payout totals, or a replacement world seed when claiming catch-up.
- On return, resolve only the elapsed interval since the last settlement, clamped to a configurable maximum offline window. Use fixed simulation steps (or a measured deterministic equivalent) and the player’s server-persisted roster/programs.
- Offline simulation uses the same seeded grid sites, stock/respawn, cargo, navigation, and central depot rules as online play. Unreturned cargo is not paid; a bot only earns when the resolver records its arrival/delivery at storage.
- Settle all currency changes and advance the last-settled timestamp atomically. Repeated requests, concurrent tabs, retries, and stale timestamps cannot pay twice or skip time; store an idempotent settlement receipt.
- Apply explicit caps to offline duration, simulated steps, crew processed, total rewards, and resolver work. Show the player elapsed time credited, capped time, deliveries, and any cargo still in transit.
- Give a small starter offline cap, then let technology nodes extend the cap or efficiency within a published server-defined maximum. Avoid claiming progress beyond the cap.
- Guest saves may simulate while open and store their own local snapshot, but must not create signed-in/server currencies.

### Acceptance checks

- Client clock changes, fabricated elapsed values, changed client seeds, and repeated settlement calls cannot mint additional rewards.
- A server-side clock interval below the cap gives the same result for a given world snapshot, program snapshot, and deterministic step budget; excessive gaps clamp to the configured maximum.
- Offline earnings contain only completed depot deliveries. Cargo in transit and impossible/stalled routes remain unpaid and visible in the catch-up summary.
- Settlement timestamp, wallet ledger entries, and replay receipt commit atomically and remain correct under simultaneous requests.
- Existing players with no offline history receive a safe initial timestamp and no retroactive windfall.

## 3. Bot navigation and collision avoidance

### Design

- Bots should maintain safe separation from other bots and static obstacles while heading toward resource sites and the depot.
- Use deterministic, bounded steering/path planning in the simulation layer (for example, a navigation grid with local separation/avoidance); Three.js only animates the resulting positions.
- Define collision radius, clearance, movement speed, and blocked-path behavior as bounded bot/world data. Bots must not pass through the depot, terrain barriers, or each other to improve payout.
- Resolve congestion deliberately: queue, yield, or choose another valid route near the depot and busy resource sites. Detect stalled/deadlocked bots and recover without duplicating cargo or delivery events.
- Keep decisions reproducible with fixed-step updates and stable tie-breaking so the browser renderer and server/headless resolver agree.

### Acceptance checks

- Automated simulations with crossing paths and crowded depots show no overlap beyond the documented tolerance and no indefinite stalls.
- Equal seed, bot assignments, and tick sequence produce identical paths/events regardless of rendering frame rate.
- Bots still reach alternate valid routes when another bot blocks the shortest path; impossible routes report a visible, bounded failure state.

## 4. Technology tree progression

### Design

Replace the flat “buy an upgrade” presentation with a graph of prerequisite-linked nodes. Nodes can change both player capabilities and the visible world: research may place a structure in the factory, open a field zone, or cause new resource families to appear there. A single node may unlock or affect several systems, for example:

- a bot chassis plus its catalog entry;
- cargo capacity, movement, scanning, or specialized tool modules;
- a new resource family or grade with higher configured base value, potentially balanced by scarcity, distance, or hazards;
- resource spawn tables, site variants, zones, stock/respawn behavior, or salvage contracts, including nodes that boost one resource's spawn weight while reducing another's;
- bounded delivery-value multipliers for selected resources, zones, or grades, in addition to raw base-value increases;
- visible scene changes such as a refinery, extractor, power relay, research lab, upgraded storage depot, roads/bridges, lighting, vegetation, debris cleanup, or a newly opened biome;
- Blockly instructions, templates, or additional automation slots;
- additional branches, production stations, or PvE encounters.

World-changing unlocks need a visible representation tied to owned unlock state and the active content version. For example, a node can add a refinery beside the depot and enable rare crystal sites in a new zone. The scene projects validated progression state; it is never the source of ownership or payouts. Higher-value resources use server-owned reward definitions and bounded delivery settlement; visual rarity or client-edited site values cannot change payouts.

### Spawn and value effects

- Resolve spawn eligibility first (unlocked resource, allowed zone, valid grid cells), then apply server-configured node weight effects to the seeded weighted draw. A node may add a resource, multiply its weight, or alter its stock/respawn range; all values are bounded and versioned.
- Resolve delivery value from the server-owned resource definition and the player's effective owned-node effects, then apply configured per-resource/per-run caps and rounding. Clients may preview this calculation but cannot submit a multiplier or payout amount.
- Keep spawn chance and delivered value as separate upgrade knobs: a higher spawn weight means more frequent finds, while a value multiplier affects only cargo actually collected and delivered to the depot.
- Example branch (illustrative, not balanced): **Geological Survey** unlocks alloy sites in the north zone; **Deep Veins** increases alloy spawn weight; **Sorting Rig** adds a visible depot attachment and improves delivered alloy value. A single node may combine scene, spawn, and payout unlocks.

Each node should have a stable ID, display copy, icon/category, prerequisite IDs, cost by currency, bounded declarative effects, unlock IDs, repeatability/cap, visibility rules, and content version. Allowlisted effects should cover player stats, bot/module unlocks, scene entities/variants, field-zone access, resource definitions/spawn weights/stock/respawn, bounded delivered-value multipliers, program capabilities, offline-cap increases, and encounter availability. Effects must come from a server-side vocabulary—never executable code from the editor or catalog. The graph validator rejects duplicate IDs, unknown prerequisites/unlocks, cycles, unsupported effects, invalid currency/costs, unsafe scene placements, unbounded resource values/multipliers, and unreachable published nodes.

### Purchase behavior

- The server validates prerequisites, ownership, costs, and caps, then debits the wallet and records unlocks atomically and idempotently.
- Publish a versioned snapshot so existing players’ purchased nodes remain valid when admins revise the tree.
- The UI communicates locked prerequisites, total cost, unlocked outcomes, and the effect on bots/production before purchase.
- Treat respec/refunds as a separate design decision; do not silently refund or remove already-owned unlocks when content changes.

### Acceptance checks

- Graph validation covers cycles, missing nodes, duplicate IDs, invalid effects, and valid multi-unlock nodes.
- A purchased world-change node deterministically adds its scene content and unlocks its configured resource/site set; disabling it in a later catalog version does not erase existing ownership.
- Spawn-weight nodes change seeded resource frequency without rerolling unpredictably; value-multiplier nodes affect only server-settled cargo delivered to storage.
- Higher-value resources pay only their server-configured rewards after valid delivery, with caps and no client-controlled value multiplier.
- Repeated purchase requests cannot charge twice; insufficient funds and unmet prerequisites do not modify ownership.
- A node’s configured unlocks/effects apply consistently in the client display and server-authoritative gameplay.

## 5. Admin management tools

Extend the existing admin content studio into a safe management surface for:

- technology tree nodes, edges/prerequisites, costs, effects, and unlock targets;
- bot chassis, stats, collision radii, cargo limits, modules, and allowed programs;
- resource definitions, spawn zones/weights, stock, and respawn rules;
- storage/depot rules and economy reward tables;
- PvE opponents, battle rules, and PvP presentation/content versions;
- feature flags and rollout controls.

All changes must be admin-authorized on the server. Provide draft editing, schema and graph validation, preview of affected unlocks/economy, versioned publish, audit history, and rollback by publishing a prior version as a new version. Disabling content must not erase a player’s owned bots, inventory, or unlock receipts. No public endpoint may accept an admin-supplied executable effect.

### Acceptance checks

- Player and moderator roles cannot create, preview as an admin, publish, disable, or roll back privileged content.
- Invalid draft graphs cannot publish; preview is read-only; publish and rollback create immutable audit/version records.
- An already-owned item/node survives catalog disable and catalog-version changes.

## 6. Watchable PvE and PvP battles

### Design

- Reuse the deterministic, server-authoritative combat resolver and immutable battle snapshots already used for PvE/PvP outcomes. The client visualizes a trusted event/replay stream; it does not decide damage, winners, rewards, or timing results.
- Build a Three.js arena scene that can present movement, attacks, hits, status effects, and the final result from versioned battle events. Keep the event stream bounded and validate event names, coordinates, durations, and actor IDs.
- Make both PvE encounters and PvP matches watchable. PvP remains asynchronous: a player can watch after both snapshots exist without requiring both pilots to be online at once.
- Include play/pause, event scrubbing, speed controls, clear combat log/result summary, reduced-motion support, and a 2D/non-WebGL fallback. The current replay viewer is a foundation; the expansion is a richer arena presentation, not a second source of combat truth.
- Snapshot arena/content versions with each match so old replays remain understandable after balance changes.

### Acceptance checks

- The same stored battle receipt always produces the same event order and outcome in the viewer; refreshing or changing speed cannot change rewards.
- PvE and PvP histories both open the Three.js presentation; privacy remains participant-appropriate for PvP.
- Invalid or oversized event streams are rejected, and losing WebGL preserves result/history access.

## Suggested delivery order

1. **World and delivery contract:** decide world bounds, grid geometry, central depot semantics, deterministic seed format, and cargo/delivery events.
2. **Large scene and seeded resource sites:** implement random valid grid-cell selection and visualize stock, reachability, and depot deliveries.
3. **Incremental/offline settlement:** persist server world/time state, resolve bounded away-time work, and settle only depot deliveries with idempotent receipts.
4. **Deterministic bot avoidance:** SB-051 implements dynamic robot spacing, deterministic sidesteps, and shared-target berths; SB-052 adds static obstacle clearance, deterministic detours, and blocked-route recovery. Advanced grid pathfinding and deeper congestion behavior remain future extensions.
5. **Technology tree foundation:** define the graph schema, validator, server purchase/unlock records, and migration from existing flat upgrades; include bounded offline-cap upgrades.
6. **Admin publishing workflow:** add draft preview, graph/economy validation, versioned publish, audit, and rollback for tree and simulation content.
7. **Battle presentation:** extend trusted battle events into watchable Three.js PvE/PvP arenas, replay controls, and browser coverage.

Do not start by building all admin controls or scene art in isolation: the world, tree, and battle viewers need stable, versioned simulation contracts first. Each phase should retain the current playable routes and add feature-flagged content until its tests and fallback behavior pass.

## Decisions to resolve before implementation

- How large is the first expanded zone, and is the camera top-down, isometric, or freely orbitable?
- Do resource sites respawn on a timer, after a server-resolved run, or from a bounded stock cycle?
- Are tech unlocks permanent account progression, season/cycle progression, or a mix? What currencies can buy each branch?
- Should bots queue at storage or use multiple depot entrances when crowded?
- Which combat events need visual animation first, and how much replay detail/performance can lower-end devices support?
