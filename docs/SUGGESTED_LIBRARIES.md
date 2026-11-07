# Project Libraries

The app is Laravel 13 with a Vite/Three.js/Blockly client. The packages below are now installed and integrated for the documented purposes. Each has a separate note with its role and trade-offs.

For tagged positive/negative assessments and project-specific guidance, see [Project Libraries: Evaluation](SUGGESTED_LIBRARIES_EVALUATION.md).

## JavaScript packages

- [fast-check (npm)](suggested-libraries/npm-fast-check.md) — property-based tests for bounded, allowlisted Blockly programs.
- [Playwright (npm)](suggested-libraries/npm-playwright.md) — browser E2E tests for Wemp routes, Blockly deployment, and robot activity.
- [Zod (npm)](suggested-libraries/npm-zod.md) — validates saved/deployed instruction data before the simulation executes it.

## Laravel/Composer packages

- [Laravel Sanctum (Composer)](suggested-libraries/composer-sanctum.md) — `HasApiTokens` and the personal-access-token migration are installed; no token-issuing endpoint is exposed yet.
- [Spatie Laravel Permission (Composer)](suggested-libraries/composer-spatie-permission.md) — user roles are integrated; registration assigns `player`, and seeders define `moderator` and `admin` for future authorized tools.
- [Laravel Pint (Composer)](suggested-libraries/composer-pint.md) — installed formatter for PHP code style.

Run `npm test` and `php artisan test` for local suites. `npm run test:e2e` additionally requires the app served at the Wemp Nginx URL (or set `PLAYWRIGHT_BASE_URL`). See [the game plan](GAMEPLAN.md), [backlog](BACKLOG.md), and the package-specific notes for setup details.
