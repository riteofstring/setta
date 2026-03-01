# All Settings Edge-Handle Optimizations (2026-03-01)

## Scenario
- Page: `Settings` project, `All Settings` view
- Interaction: repeated `All Settings -> Core -> All Settings` tab switches
- Measurement method: in-page `PerformanceObserver` for `longtask` entries + wall-clock elapsed timing per interaction

## Baseline (pre-change)
Source: prior CDP investigation in `docs/plans/all-settings-frontend-performance-plan.md`.

- `All Settings -> Core`
  - elapsed: ~`903 ms`
  - long-task total: ~`404 ms`
- `Core -> All Settings`
  - elapsed: ~`1415 ms`
  - long-task total: ~`1198 ms`

## Post-change measurement
Sample: 5 runs after implementing edge-handle update guards and removing redundant immediate handle-position update call.

- `All Settings -> Core`
  - elapsed runs: `903, 902, 904, 903, 902` ms
  - long-task total runs: `440, 401, 391, 393, 357` ms
  - median elapsed: `903 ms`
  - median long-task total: `393 ms`
- `Core -> All Settings`
  - elapsed runs: `1337, 1325, 1335, 1408, 1297` ms
  - long-task total runs: `1143, 1125, 1125, 1192, 1095` ms
  - median elapsed: `1335 ms`
  - median long-task total: `1125 ms`

## Delta (median)
- `All Settings -> Core`
  - elapsed: `~0%` (903 -> 903 ms)
  - long-task total: `~2.7%` improvement (404 -> 393 ms)
- `Core -> All Settings`
  - elapsed: `~5.7%` improvement (1415 -> 1335 ms)
  - long-task total: `~6.1%` improvement (1198 -> 1125 ms)

## Notes
- This was an intentionally low-complexity pass focused on eliminating redundant work and adding no-op guards.
- The biggest remaining bottleneck is still the heavy `Core -> All Settings` mount/update workload; additional improvements likely require reducing per-section mount/layout cost.
