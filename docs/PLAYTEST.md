# Browser Playtest — SB-007

**Run:** 2026-11-06 · **Browser:** Playwright Chromium, headless, SwiftShader WebGL · **Route:** Wemp subpath · **Viewport checks:** default desktop and 390×844 mobile emulation.

## Scenarios and results

- Loaded direct Factory, Brain Lab, and per-unit assignment routes under `/Jumper%20Robotica/Scrapbound/`: passed.
- Deployed a Blockly routine to the crew and to unit 02, then navigated back to Factory and verified its saved assignment: passed.
- Ran the robot loop at 4× in a real browser and observed a delivery event and credits increase: passed. Currency does not update before a delivery callback; the deterministic simulation test advances ten simulated minutes and confirms identical payout/event traces on replay.
- Exercised pause/resume and 1×/2×/4× controls: passed.
- Forced WebGL context creation to fail at 390×844; the fallback message and crew status remained visible, and document width stayed within the viewport: passed.

## Economy / usability notes

- No balance changes were needed from this pass. Starter production requires an explicit robot-delivery loop; credit and scrap payouts are applied only on return, and paused/no-program robots produce no passive credits.
- A delivery reports the recovered cargo and payout in the factory status panel; a scene pulse and cache stock/scanned state give additional visual feedback.
- The mobile viewport check passed, but this is emulation, not a physical-device test. This run was automated/headless rather than a hands-on ten-minute human usability session; tune onboarding and payout pacing after that manual session.

**Verification:** `npm test` (13 tests, including a ten-simulated-minute replay); `npm run test:e2e` (6 Chromium scenarios); `npm run build`.
