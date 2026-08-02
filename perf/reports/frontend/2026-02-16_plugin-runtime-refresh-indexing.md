# Plugin Runtime Refresh Reuse Benchmark

- Date: 2026-02-16
- Area: `frontend/src/plugins/runtime.ts`
- Goal: reduce unchanged-plugin refresh cost by avoiding repeated `sectionKindsByKey` full scans per plugin.

## Scenario

Measured from a headed browser page via chrome-devtools-mcp (`evaluate_script`) with a synthetic runtime payload:

- 120 plugins
- 40 registered section kinds per plugin (4,800 total)
- First refresh loads plugin frontends from generated data-URL modules.
- Metric captures 5 subsequent refresh calls where signatures are unchanged and registry data is reused.

## Before

- Timings (ms): `83.6, 81.5, 92.3, 83.9, 86.2`
- Avg: `85.5 ms`
- Min/Max: `81.5 / 92.3 ms`

## After

- Timings (ms): `4.2, 4.2, 3.8, 3.9, 4.0`
- Avg: `4.02 ms`
- Min/Max: `3.8 / 4.2 ms`

## Result

- Average refresh reuse time improved from `85.5 ms` to `4.02 ms` (about `21.3x` faster) in this scenario.
- Change aligns with new one-pass `pluginId -> sectionKindKeys` indexing during refresh.
