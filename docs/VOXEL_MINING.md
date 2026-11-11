# Voxel Mining and Bot Roles

This document describes the current field-mining implementation. Product direction and longer-term ideas remain in [GAMEPLAN.md](GAMEPLAN.md) and [EXPANSION_PLAN.md](EXPANSION_PLAN.md).

## Mining field

- The field contains **136 solid resource blocks** on a two-unit grid. The occupied cell set and central depot/platform clearance are fixed; the seed deterministically shuffles block identity/resource/stock across those cells. JavaScript and Laravel use matching generation rules so browser, server, and offline snapshots agree.
- Each block has a resource type, stock/remaining durability, and a respawn timer. Ground robots cannot pass through live blocks; miners approach a clear side to work them. The Skydrill is airborne and ignores ground-block collision.
- Breaking a block removes its solid voxel model and spawns a separate resource pile at that location. The standard drop quantity is `ceil(block stock / 3)`, with a minimum of one unit. A drop remains available until a bot picks it up.
- A bot reserves its current block or pile. Other bots skip reserved entities, so a resource target is not shared. Miners and haulers have different target pools: miners choose blocks; haulers choose drops.
- Ground bots follow cached deterministic 0.5-unit grid routes around fixed props, unlocked structures, and live blocks. Route planning has a fixed field bound and neighbor order; dynamic robot spacing still applies at each step. If a route becomes blocked or makes no progress, the bot replans or releases its target rather than creating cargo or rewards.
- Blocks normally respawn after **60 seconds**. Field Refinery applies the alloy restock multiplier, making alloy blocks respawn in 30 seconds. Depleted cells display a live seconds countdown in the Three.js scene and the 2D fallback.

## Automatic roles

Role automation is the default behavior. Blockly remains available for explicitly deployed custom programs.

| Bot | Automatic behavior | Visual identity |
|---|---|---|
| Scavenger | Generalist miner; can switch to nearby dropped resources and deliver them. | Compact utility chassis |
| Scrap hound | Fast block extractor. | Fast wheeled frame with front tusks |
| Auto-fabricator | Mines blocks at a steady rate. | Twin manipulator arms |
| Quarry borer (`block_miner`) | Dedicated fast ground miner; leaves drops for haulers. | Front-mounted drill |
| Skydrill (`sky_miner`) | Fast flight with slow extraction; ignores ground obstacles. | Hover pods and aerial drill |
| Cargo mule (`cargo_hauler`) | Picks up drops and carries them to the depot; does not mine. | Large chassis, cargo bed and crates |
| Field buffer (`buffer_bot`) | Follows nearby working bots and increases their mining rate by 50% while within 2.5 world units. | Energy halos and beacon |

Technology gates the four advanced roles: Quarry Boring unlocks the ground miner; Aerial Extraction unlocks the Skydrill; Haul Network unlocks the cargo hauler; Field Support Array unlocks the buffer. The latter requires both the haul and aerial branches. The server checks these unlocks when a player buys a bot.

When a non-default Blockly program is deployed, that bot follows the explicit program instead of its automatic role routine. The starter patrol/scan/credits loop is treated as the automatic-role setting so browser and server behavior stay aligned. Assignment and program data are validated server-side for signed-in play; renderers only display simulation snapshots.

## Technology and Catalog Studio

Technology effects can unlock bot kinds/resources/zones and adjust spawn weights, delivery values, stock, or respawn time. Catalog Studio provides structured editors for catalog arrays and technology effects, plus Advanced JSON for direct edits. Technology prerequisites can be selected from known nodes.

Admins can drag technology nodes on a visible honeycomb snap grid. Positions are stored as axial `gridPosition` coordinates in catalog drafts, bounded to `q`/`r` from -20 to 20 and unique per node; the origin cell is highlighted. Publishing or rolling back catalog versions carries the saved layout with the rest of the catalog content.

## Simulation state and verification

Snapshots include block stock, remaining durability, respawn duration and remaining countdown, plus active drops. Online server runs and bounded offline settlement use the PHP resolver; the local guest simulation uses the matching JavaScript core. Currency is granted only when cargo is delivered to the depot.

Regression coverage includes mining-to-drop-to-haul delivery, unique block/drop reservations, deterministic seeded layouts, the 60-second respawn timer, snapshot countdown propagation, server-side automatic mining/hauling, and obstacle-safe movement. Run `npm test`, `php artisan test`, and `npm run build` for the unit/feature/build checks; browser tests are run separately with `npm run test:e2e` against a configured app URL.
