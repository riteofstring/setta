# Settings All Settings Viewport Layer Split Default-Off (Experiment Only)

Date: 2026-03-03
Area: frontend
Implementation status: **Kept (default-off), explicit opt-in only**.

## Goal

Move viewport layer split from global default-on to experiment-only default-off after clipping correction showed split-on no longer provides a robust pan/zoom gain.

## Change Summary

- Updated flag resolution:
  - `enabled` -> `true`
  - `disabled` -> `false`
  - `unset` -> `false`
- Practical behavior:
  - localStorage key absent => split disabled
  - localStorage key set to `1/true/on` => split enabled for explicit experiments
- Added resolver test coverage:
  - `resolveViewportLayerSplitEnabled("unset") === false`

## Verification

- Vitest:
  - `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/viewportLayerSplitFlag.test.ts`
  - Result: `1 passed`, `5 tests`.

- Playwright baseline (default path, key unset):
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
  - Result sample:
    - `pan=37.2`, `zoom=34.9`
    - `viewportLayerSplitEnabled=false`
    - `visibleSectionCount=42`

- Playwright guardrail (forced on via test init script):
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-viewport-layer-split-guardrail.spec.ts`
  - Result sample:
    - `pan=35.8`, `zoom=33.9`
    - `viewportLayerSplitEnabled=true`
    - `visibleSectionCount=42`

- CDP visual/default-off sanity:
  - localStorage key removed and page reloaded.
  - Observed:
    - `viewportLayerSplitEnabled=false`
    - `sectionCount=42`, `visibleSectionCount=36` after fit view
  - Artifact:
    - `perf/artifacts/frontend/2026-03-03_viewport-layer-split-default-off_visual-check.png`

## Conclusion

- Layer split is now experiment-only and does not affect normal users by default.
- Current corrected split path is not a validated fundamental performance win.
- Keep it available behind explicit opt-in while prioritizing larger-impact pan/zoom architecture work.
