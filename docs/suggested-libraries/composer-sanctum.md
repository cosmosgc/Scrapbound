# Laravel Sanctum (Composer)

**Status:** Installed and integrated with `App\Models\User`; token issuance remains disabled.

Sanctum supports Laravel's first-party SPA authentication and API tokens for trusted external clients. The current game is same-origin under the Laravel app and already uses Laravel session cookies plus CSRF, so tokens would add complexity without a current benefit.

The `HasApiTokens` trait and personal access token migration are present. No route issues tokens; the same-origin browser continues to use Laravel session auth and CSRF. If a mobile client or separate official API is added, implement scoped issuance/revocation and expiration using Laravel's Sanctum documentation.

Prefer stateful session auth for the same-origin browser game. Do not issue long-lived tokens to browser local storage. Sanctum's CSRF-cookie route does not mean bearer tokens are needed by the browser.
