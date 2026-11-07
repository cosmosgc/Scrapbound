# Zod (npm)

**Status:** Installed as a runtime dependency and used by `resources/js/program-schema.js`.

Zod validates the Blockly-to-simulation instruction list (`patrol`, `scan`, `collect`, bounded `wait`), including instruction count and resource enums. `SalvageSimulation.deploy()` rejects an invalid program as a whole rather than executing unsupported parts.

Run the schema and property tests with:

```sh
npm test
```

Update the schema and tests together when the instruction format changes. Any server-side simulation must independently validate instructions in Laravel; browser validation is never a security boundary.
