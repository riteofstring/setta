# Settings Graph Terminal Scroll Guard Gating

Date: 2026-04-13
Lane: `rotaryParamCodeObjDefault`

## Goal

Remove the current dominant canary motion owner when no terminal surface is
mounted, then re-measure the live worktree lane to see which owner becomes the
next real product target.

## Change

- updated `frontend/src/state/hooks/terminals/utils.ts` so terminal
  scroll-sensitivity sync registers active consumers explicitly and resets the
  shared `isPanScrolling` flag when the last terminal consumer unmounts
- updated
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts`
  so the canary skips `useMisc.isPanScrolling` writes entirely when no terminal
  scroll guard is mounted

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx src/state/hooks/terminals/utils.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts`
  - passed (`3` files, `19` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx src/state/hooks/terminals/utils.ts src/state/hooks/terminals/utils.test.ts`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-021/worktree-ai.log`
  - passed (`1` Playwright test, `1.5m`)

## Result

- prior live worktree reading from
  `perf/reports/frontend/2026-04-12_settings-graph-worktree-only-motion-probe.md`
  had `interactionMiscStateSync` as the dominant owner (`11` calls, `1.0ms`
  total)
- new live worktree reading on the same lane:
  - dominant owner: `presentedSceneSectionVisibilityFilter`
  - `interactionMiscStateSync`: `0` calls, `0ms`
  - `presentedSceneSectionVisibilityFilter`: `40` calls, `3.9ms` total,
    `3.4ms` max
  - `pixiDrawableModelResolve`: `36` calls, `0.7ms` total
  - `presentedSceneBodyMountFilter`: `40` calls, `0.3ms` total
- probe health:
  - surface kind remained `canary`
  - visible section count was `1`
  - no focus or visibility loss occurred during capture

## Reading

- this slice removed the previous dominant `useMisc.isPanScrolling` owner from
  the live settings canary when no terminal is mounted
- the next bounded product frontier is now the visible-section presentation
  path, specifically `presentedSceneSectionVisibilityFilter`
