# Playwright (npm)

**Status:** Installed as a development dependency; browser specs are in `e2e/`.

Playwright can verify the actual browser flow: load the app under `/Jumper%20Robotica/Scrapbound/`, follow history routes without a doubled prefix, load the Three.js scene, edit/deploy a Blockly program, and see the robot's activity/status change. It also supports screenshots and console/network failure checks.

The current tests cover Wemp subpath routing, whole-crew deployment, and assigning/restoring a program for a single robot. Install the browser binary once per development machine/CI image:

```sh
npx playwright install chromium
```

Run with `npm run test:e2e`; Wemp Nginx must be serving the build, or set `PLAYWRIGHT_BASE_URL`. Use a dedicated test database and seeded account if API flows are added. Never point browser tests at a player's real MySQL data.
