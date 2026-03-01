# Settings All Settings Param Filter Match Cache

Date: 2026-03-02
Area: frontend
Branch/Commit: setta.frontend-performance-3 @ 681f8458 (with local changes)
Experimented code paths (reverted):
- `frontend/src/components/Params/GetParamSwitch.tsx`
- `frontend/src/components/Params/paramFilterMatchCache.ts`
- `frontend/src/components/Params/paramFilterMatchCache.test.ts`

Implementation status: **Not kept** (experiment reverted; report retained for decision history).

## Goal

Reduce per-keystroke frontend work in section param filtering by removing repeated full-name indexing and repeated full-list fuzzy matching across nested `GetParamSwitch` render paths.

## Change Summary

- Added a deterministic cache for section param filter matching:
  - Reuses display-name search entries while source refs are unchanged.
  - Reuses exact filter matches.
  - Uses longest-prefix narrowing when query extends prior typed text.
  - Keeps bounded filter-entry cache size per section to avoid unbounded growth.
- Wired `GetParamSwitch` to use the shared cache instead of rebuilding `matchSorter` inputs each time.
- Added focused Vitest coverage for cache correctness and invalidation behavior.

## Scenario

- Entry point: `/settings` -> `All Settings`
- Command:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
- Harness:
  - `frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
- Browser: Playwright Chromium (local machine, no explicit throttling).

## Before (existing baseline reference)

- Source:
  - `perf/reports/frontend/2026-03-02_settings-all-settings-performance-baseline.md`
- Typing metric:
  - `typing.avgFrameMs = 164.91`

## After (current branch, repeated runs)

- Run A:
  - `typing.avgFrameMs = 159.89`
- Run B:
  - `typing.avgFrameMs = 189.18`
- Run C:
  - `typing.avgFrameMs = 162.91`
- Run D:
  - `typing.avgFrameMs = 159.11`
- Run E:
  - `typing.avgFrameMs = 181.70`

Computed summary for A-E:
- Median: `162.91`
- Best: `159.11`
- Worst: `189.18`

Non-typing metrics remained in the same range:
- Pan FPS: ~`37.5-38.7`
- Zoom FPS: ~`35.7-37.0`

## Observations

- Code-level redundancy was removed and cache behavior is validated by unit tests.
- End-to-end typing latency remains noisy in this harness.
- The 5-run median after this change (`162.91`) is only slightly below the earlier single baseline (`164.91`), so this step alone is not a major user-visible gain.

## Conclusion

- This experiment was **not kept** in the codebase.
- Reason: observed end-to-end benefit was too small/noisy to justify additional complexity at this stage.
- Next likely wins are broader reductions in update/subscription fanout and overlay/listener work.

## Automated Coverage

- `pnpm -C frontend exec vitest run src/components/Params/paramFilterMatchCache.test.ts`
- `pnpm -C frontend exec vitest run src/components/Params/GroupContainer.test.tsx`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
