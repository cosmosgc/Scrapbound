# Internationalization

The game interface defaults to Brazilian Portuguese (`pt-BR`). Players can choose English (`en`) from the language selector in the top bar; the choice is saved in `scrapbound.language.v1` in browser local storage. A clean browser profile starts in Brazilian Portuguese.

`resources/js/i18n.js` owns the locale setting, translations, document language, and locale-aware number/date formatting. It also localizes text and accessibility attributes inserted by the client after the initial page render. Add translations there using the original English text as the dictionary key. Keep names that are game-specific proper nouns unchanged unless a translation improves clarity.

Use `formatNumber()` and `formatDate()` from the same module for user-facing values. Keep Laravel's default and fallback locale at `pt_BR` so server-rendered pages agree with the game shell. Add a browser test when adding a locale or changing the default.
