# fast-check (npm)

**Status:** Installed as a development dependency and used in `tests/simulation.test.js`.

`fast-check` generates many inputs for property-based tests. It can test invariants that hand-picked cases miss: a robot never receives a negative balance, unsupported actions never execute, delivery happens only at home, and running a bounded program cannot loop forever.

The property tests check bounded, allowlisted programs and malformed action rejection. Run them with the usual unit suite:

```sh
npm test
```

Keep reproducible seeds/counterexamples in failures. This complements—not replaces—the Node scenario tests and Laravel feature tests. fast-check does not itself make simulation results deterministic.
