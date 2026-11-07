# Project Libraries: Evaluation

These packages are installed in the Laravel + Vite + Three.js + Blockly project. Tags and pros/cons explain the decision and its limits; installation does not mean every feature is publicly enabled.

## JavaScript

### fast-check — `positive` `used` `dev-only`

- **Positive:** Generates many instruction combinations and validates safety properties beyond a few hand-written examples.
- **Negative:** Property tests can be opaque without reproducible seeds and focused assertions; adds test runtime and a development dependency.
- **Why here:** `tests/simulation.test.js` checks bounded/allowlisted programs and rejection of malformed data with fast-check. Scenario tests remain for clearer failures on core behavior.
- **Limit:** It does not make the simulation deterministic. Seed/replay behavior needs separate design if randomness is added.

### Playwright — `positive` `used` `dev-only`

- **Positive:** Exercises the real browser across Laravel routes, Vite assets, Blockly, and 3D-client startup; catches failures missed by unit tests.
- **Negative:** Browser binaries increase disk use, and WebGL can vary in headless environments. Pixel-perfect assertions would be brittle.
- **Why here:** `e2e/game.spec.js` checks the Wemp subpath and that deploying the Blockly template changes crew behavior.
- **Limit:** E2E tests need a running app (`npm run test:e2e`); assert behavior/network state rather than screenshots.

### Zod — `positive` `used` `runtime`

- **Positive:** Validates data at runtime and keeps the allowed program shape explicit: supported actions, resource names, bounded waits, and at most 40 instructions.
- **Negative:** Adds a runtime dependency and may reject malformed/older saves; schema changes need deliberate compatibility handling.
- **Why here:** `resources/js/program-schema.js` validates instruction data before `SalvageSimulation` runs it.
- **Limit:** Browser validation is not a trust boundary. Laravel must validate independently before future server-side simulation or payout.

## Laravel / Composer

### Laravel Sanctum — `positive` `integrated` `security-sensitive`

- **Positive:** Supplies Laravel's standard personal access token model and `HasApiTokens` integration for a future trusted external client.
- **Negative:** Token issuance, scopes, revocation, expiration, and storage create security obligations. Bearer tokens are not needed by this same-origin game.
- **Why here:** `User` uses `HasApiTokens`, and the personal-access-token migration is installed for future API work.
- **Limit:** Scrapbound does **not** expose a token creation endpoint. The web UI uses Laravel session cookies and CSRF; never store long-lived tokens in browser local storage.

### Spatie Laravel Permission — `positive` `used` `authorization`

- **Positive:** Provides persisted roles/permissions and Laravel authorization integration as moderation/admin capabilities grow.
- **Negative:** Adds tables, cache behavior, and guard configuration. It does not replace ownership policies, validation, or authorization tests.
- **Why here:** `User` has `HasRoles`; registrations receive `player`; `RoleSeeder` defines `player`, `moderator`, and `admin` for future tools.
- **Limit:** No moderator/admin UI or privileged routes are enabled yet. Enforce future authorization in Laravel, not by hiding client controls.

### Laravel Pint — `positive` `used` `dev-tool`

- **Positive:** Keeps Laravel PHP formatting consistent and supports non-mutating CI checks.
- **Negative:** Formatting is opinionated and may create broad diffs if run on unrelated files; it does not find logic/security bugs.
- **Why here:** Included in Composer dev dependencies and used to format changed controllers/seeders.
- **Usage:** `vendor/bin/pint <changed PHP paths>`; CI can run `vendor/bin/pint --test`.

## Summary

| Library | Status | Reason / caution |
|---|---|---|
| fast-check | In use | Property-based simulation/program tests; retain readable scenario tests. |
| Playwright | In use | E2E coverage for app integration and route prefix; requires local service/browser setup. |
| Zod | In use | Runtime validation for local program IR; server must validate again. |
| Sanctum | Integrated, not exposed | Token model/migration ready; no token-issuing endpoint while session auth is sufficient. |
| Spatie Permission | In use | Role foundation; privileged UI/endpoints remain future work. |
| Pint | In use | PHP formatting; run on intended files or in check mode. |
