# Robot Factory — Game Plan

## Product direction

Turn Robot Battle Arena into a browser-based incremental automation game. Players build programmable robots, assign them to jobs, and watch a Three.js factory/battle simulation visualize their work. The first milestone is a fun single-player loop that works without other players online. Asynchronous competition comes after the simulation and reward rules are deterministic and server-authoritative.

## Core player loop

1. **Collect** credits and parts from assigned robot jobs (including capped offline production).
2. **Spend** credits on robots, factory stations, upgrades, research, and Blockly brain templates.
3. **Automate** resource production and battle preparation by assigning robots and saved programs to jobs.
4. **Run missions**: short PvE contracts, salvage expeditions, and arena tests pay credits, parts, and occasional shards.
5. **Improve** the robot roster, equipment, automation capacity, and Blockly programs.
6. **Prestige** when progress slows: reset the current run for Core Shards and permanent account-wide bonuses, then rebuild faster.
7. **Repeat indefinitely** through scaling mission tiers, procedural modifiers, collection goals, and prestige milestones.

Battles are tactical demonstrations and asynchronous contests, not a mandatory real-time PvP queue. Players can submit a robot + immutable program/equipment snapshot. The opponent can submit later; a deterministic server simulation resolves the match. A replay is watchable in Three.js whenever either player returns.

## Currencies and earning sources

| Currency | Role | Earned from | Spent on |
|---|---|---|---|
| Credits | Common, renewable | Idle production, missions, battle rewards, daily goals, salvage | Basic robots, stations, upgrades, templates |
| Parts | Crafting material | Production jobs, dismantling duplicate items, missions | Equipment, robot tiers, advanced stations |
| Core Shards | Rare prestige currency | Prestige, one-time milestones, selected high-tier contracts | Permanent bonuses, premium templates, extra automation slots |

Never sell paid power in the initial design. Daily/mission rewards should be catch-up friendly and not punish absence. Offline production must have an explicit configurable cap (initial default: 8 hours). Prestige rewards use a bounded formula, are previewed before confirmation, and never subtract already-earned shards.

## Progression and balance

- Infinite tiers use configured base costs and growth curves, rather than hardcoded per-tier entries. Initial defaults: cost growth 1.16x; mission reward and enemy strength scale by tier; cap individual numeric values server-side.
- Production is expressed as base output × owned count × additive research bonuses × multiplicative station bonuses × prestige bonus.
- Unlocks are data-driven: content declares prerequisites, currencies, costs, output, visibility, and a version.
- Add diminishing returns and milestone unlocks so the only sensible strategy is not buying one item forever.
- Admins can disable content without deleting it; existing player inventory remains valid. Config changes are versioned and auditable.

## Blockly and robot jobs

Keep Blockly as the visual editor. Add a catalog of reusable, versioned brain templates (workspace JSON plus display name, category, unlock condition, price, and compatible job types). Templates are starting points players can inspect and customize, not opaque paid power. A robot can be assigned to a factory job, PvE mission, or asynchronous battle with a program snapshot. The validated intermediate representation/interpreter remains the execution boundary; never use `eval`/`new Function`.

## Three.js simulation

- Three.js is the browser renderer; simulation rules remain separate from rendering.
- Build one deterministic, headless-capable simulation core with a seeded RNG. Render state snapshots in Three.js for factory motion, mission scenes, and battle replays.
- Keep a reduced-motion/low-quality mode and a 2D fallback for unsupported WebGL devices.
- Server results must not depend on the player's frame rate, browser tab, or Three.js rendering.

## Asynchronous player battles

1. Attacker selects a public defense snapshot and commits a robot/program loadout.
2. Server validates ownership, energy, loadout, and content versions; it stores immutable inputs and a seed.
3. A worker/server-side deterministic resolver calculates the result and replay events. Until a worker queue exists, resolve synchronously with strict time/block budgets.
4. Both players receive results, currency rewards, rating changes, and replay access. Use idempotent match IDs and a unique reward claim to prevent duplicate payouts.
5. Defense loadouts are snapshots; later edits do not rewrite queued or completed matches.

No browser-submitted winner, damage, or currency total is trusted. Rate-limit challenges and prevent self-match farming. Start with asynchronous 1v1 defenses; add leagues/tournaments only after this is reliable.

## Admin content studio

Restrict every write endpoint to admins server-side. Admin sections should manage:

- **Items/equipment**: stable key, localized name/description, slot, stats, price/currency, unlocks, enabled flag.
- **Upgrades/research**: cost curves, effects, prerequisites, repeatability, caps.
- **Currencies/rewards**: earning tables, offline cap, mission payout ranges, prestige formula; validate bounded values.
- **Blockly templates**: serialized workspace, version, category, prices, prerequisites, compatibility, beginner/advanced visibility.
- **Missions/jobs**: duration, requirements, reward tables, opponent rules, unlocks.
- **Economy config**: global curves and feature flags.

Require preview/validation before publish, immutable version history, audit log, and safe rollback. The current admin JSON textarea is a local prototype only and is not a production admin surface.

## Data and security plan

Use MySQL/MariaDB for authenticated progression. Add users' credit/part/shard balances, prestige count, inventories, robot assignments, mission state, content tables with published versions, a currency transaction ledger, async match snapshots/results/replay events, and admin audit entries. Apply all purchases/rewards in transactions with row locking and idempotency keys. The server calculates prices/rewards and validates content; never trust browser balances. Provide a migration script and preserve current robots/programs/challenges during transition.

The current factory vertical slice is browser-local (`localStorage`) and for prototyping only. It is not shared across devices and must not be used to award competitive rewards. Existing PHP/MySQL battle and Blockly functionality remains available while the progression backend is built.

## Delivery milestones

1. **Playable prototype (now)**: Three.js factory scene, local-first credits/parts/shards, production, buyable robot stations/upgrades, prestige, and local config editing.
2. **Single-player foundation**: server persistence, economy ledger, offline cap, assignments, missions, admin-managed catalog/templates, deterministic simulation/replay.
3. **Progression depth**: tiers, research, contracts, achievements, balance tools, accessibility/performance modes.
4. **Async PvP**: immutable defense snapshots, queued match resolver, replay and safe reward settlement.
5. **Live operations**: leagues/seasons, admin feature flags, metrics, economy tuning, anti-abuse monitoring.

## Initial acceptance criteria

- A visitor can see a 3D animated factory and robots without a native install.
- Buying a production robot increases credits/parts over time; returning later receives capped offline production.
- Credits can buy basic production; prestige creates Core Shards and resets a run while retaining permanent prestige progress.
- Admins can edit prototype item/upgrade prices; production publishing will move to authenticated, versioned server content before launch.
- Existing Blockly workspaces remain intact and Three.js remains a renderer, not an execution engine.
- No asynchronous match can pay rewards based only on client-provided results.
