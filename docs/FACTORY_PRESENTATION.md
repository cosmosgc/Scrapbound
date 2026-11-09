# Factory presentation and workshop tools

## Three.js renderer

`resources/js/factory3d.js` consumes the existing `SalvageSimulation.snapshot()` contract. It does not grant rewards, change bot paths, or alter server-authoritative simulation rules.

- OrbitControls provides orbit, right-drag pan, wheel zoom and touch gestures.
- Island / close-up / top-view buttons frame the world; following a bot moves the camera with its rendered position.
- Resource blocks and ground pads use two InstancedMesh batches instead of separate geometry/material/texture trees for every deposit.
- Blocks shrink with remaining stock. Clicking one shows remaining stock or its respawn countdown.
- Robot meshes are built in `factory-models.js`, with role-specific tools, cargo, unit-number labels and actual motion headings.
- The selected bot has a highlight ring and a dashed **target guide** (not a pathfinding route).
- Delivery popups originate exclusively from delivery events in snapshots. Decorative effects are capped and disposed.
- Removed drops and replaced robot models release their GPU resources.
- Hidden views skip rendering; reduced-motion disables decorative movement. Low quality disables shadows and most bot labels.
- WebGL failure falls back to a selectable 2D canvas map.

The simulation's 136 resource positions, collision obstacles, mining/hauling behavior, and server synchronization remain unchanged. The renderer's obstacles use the same navigation definitions as the simulation.

## Research

The honeycomb connection grid is the default research view. Players can optionally switch to discovery cards with full descriptions, prerequisites, effects and costs visible without hover. Both views support search and filtering by research state. Guests see a read-only preview from the published catalog. Purchases still use the existing server-authoritative research endpoint.

## Admin tools

The catalog editor now includes section shortcuts, entry search, and expand/collapse controls. Entry accordions start closed and preserve their open state across edits. Styling covers the structured editor and draggable technology graph. Existing validation, immutable drafts, publishing, permissions and version actions remain intact.

## Checks

```sh
npm test
npm run build
npx playwright test e2e/workshop-tools.spec.js e2e/bot-inspector.spec.js
```

The admin browser test uses read-only mocked API responses; it does not publish a real catalog or verify backend permissions.
