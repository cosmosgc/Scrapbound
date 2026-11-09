# Scrapbound

Scrapbound is a browser-based robot automation game. Build a factory, program or pilot individual robots, earn resources from visible deliveries, and send your machines on increasingly difficult salvage runs.

Guest factory saves remain browser-local. Signed-in pilots also have server-owned wallets, mission progress, salvage inventory, and escrow trades. Community trade posts remain coordination-only; actual item-for-credit transfers use the escrow trade panel.

## Run locally

```sh
composer install
npm install
copy .env.example .env
php artisan key:generate
php artisan migrate
npx playwright install chromium
npm run dev
```

Configure MySQL in `.env` (`DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`) before running migrations. Run `php artisan db:seed` to create player/moderator/admin role records. For local development, Laravel's Vite plugin serves the frontend while `php artisan serve` serves the app.

Run checks with `npm test` and `php artisan test`. `npm run test:e2e` runs Playwright against the Wemp URL by default; set `PLAYWRIGHT_BASE_URL` for another running instance. Pint is available as `vendor/bin/pint`.

On Windows, run `build.bat` to install Composer/npm dependencies, build assets into `public/build`, validate/reload Wemp Nginx, and serve the app at `http://localhost:3000/Jumper%20Robotica/Scrapbound/`. Nginx must pass PHP requests to PHP-FPM on `127.0.0.1:9000`; its project config is `nginx.location.conf`.

## Current prototype

- Three.js 3D robot factory
- Large interactive workshop view with fullscreen, drag-orbit/scroll-zoom camera, robot follow, keyboard/mouse piloting, and WebGL fallback
- Local credits/scrap, robot purchases, delivery-based earning, and upgrades
- Salvage missions and Core Shard prestige
- Blockly brain workshop with navigation, conditionals, return-to-base actions, browser-local programs, and per-bot keyboard/mouse control profiles
- A visible salvage loop: assign a program to the whole crew or a specific robot; robots patrol, scan, collect a chosen resource, and return cargo. Assignments persist locally; there is no idle/offline payout.
- Laravel sign-in, server-authoritative wallets/inventory, escrow item-for-credit trades, and a community board for help, negotiation posts, replies, and collaboration

## Enable accounts and community

1. Copy `.env.example` to `.env`, generate `APP_KEY`, and set the MySQL credentials in `.env`.
2. Run `php artisan migrate` to create the account/community tables.
3. Ensure PHP-FPM can read the project and Nginx uses `nginx.location.conf`. `APP_DEBUG` must be false outside local development; never commit `.env`.

Community trade posts are negotiation offers only. Targeted item trades reserve catalog-tradable inventory, then atomically exchange items and credits when the named recipient accepts. The server checks each offer's expiry timestamp when trade offers are viewed or acted on, so no background scheduler is needed for escrow release. Replies are public to anyone who can access the board. Use unique passwords and do not post personal contact information.

See the [game plan](docs/GAMEPLAN.md), the proposed [expansion plan](docs/EXPANSION_PLAN.md), [development queue](docs/DEVELOPMENT_QUEUE.md), [working backlog](docs/BACKLOG.md), and [installed libraries](docs/SUGGESTED_LIBRARIES.md), including the [trade-off evaluation](docs/SUGGESTED_LIBRARIES_EVALUATION.md) and separate package notes.
