# Laravel Pint (Composer)

**Status:** Installed as a development dependency; used to format changed Laravel PHP files.

Pint is Laravel's PHP code-style formatter. Run it before committing controller, model, migration, route, and test changes:

```sh
vendor/bin/pint
```

For a non-mutating check in CI:

```sh
vendor/bin/pint --test
```

Pint is already in `composer.json`/`composer.lock`; no additional install is required.
