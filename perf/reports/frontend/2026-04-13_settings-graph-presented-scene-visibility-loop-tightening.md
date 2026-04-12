# Settings Graph Presented-Scene Visibility Loop Tightening

Date: 2026-04-13
Lane: `rotaryParamCodeObjDefault`

## Goal

Reduce the current live canary motion owner
`presentedSceneSectionVisibilityFilter` on the canonical `/settings` ->
`All Settings` lane without reopening the closed overlap-fast-path hypothesis.

## Change

- updated
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.ts`
  so the presented-section visibility loop now:
  - precomputes the viewport right/bottom edges once per pass
  - handles dragged, active, and unbounded sections inline with early
    continues
  - avoids the per-section helper-call path for the common bounded-visibility
    branch
- extended
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.test.ts`
  with an explicit regression for an offscreen dragged section staying mounted
  in the presented subset

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.test.ts src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx`
  - passed (`2` files, `14` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.test.ts`
  - passed
- first live worktree probe attempt:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-022/worktree-ai.log`
  - failed after the browser/page closed during pane-state normalization
- bounded worktree recovery:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
  - refreshed runtime facts with
    `./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.pixijs-graph/. --runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-022/worktree-ai.log`
- retried live worktree probe after recovery:
  - same `run-settings-graph-worktree-probe.sh` command
  - passed (`1` Playwright test, `1.8m`)
- fresh-context headless CDP smoke after recovery:
  - reached `http://127.0.0.1:3075/settings`
  - visible text included `Settings`, `pixijs-graph`, `Loading project...`,
    and `Waiting for project data to load.`
  - note: the CDP route check stayed on the loading state rather than
    rendering the full settings graph surface

## Result

- prior live worktree reading from
  `perf/reports/frontend/2026-04-13_settings-graph-terminal-scroll-guard-gating.md`:
  - dominant owner: `presentedSceneSectionVisibilityFilter`
  - `presentedSceneSectionVisibilityFilter`: `40` calls, `3.9ms` total,
    `3.4ms` max
- recovered live worktree reading on the same lane:
  - dominant owner: `presentedSceneSectionVisibilityFilter`
  - `presentedSceneSectionVisibilityFilter`: `40` calls, `0.7ms` total,
    `0.1ms` max
  - `pixiDrawableModelResolve`: `36` calls, `0.6ms` total
  - `presentedSceneBodyMountFilter`: `40` calls, `0.2ms` total
  - `interactionMiscStateSync`: `0` calls, `0ms`
- probe health after recovery:
  - surface kind remained `canary`
  - visible section count was `1`
  - no focus or visibility loss occurred during capture
  - measurement window still showed broader long tasks
    (`5` long tasks, `1174ms` total, `413ms` max)

## Reading

- this slice materially reduced the targeted visibility-filter owner on the
  canonical live canary lane
- the owner still ranks first inside motion attribution, but it is now close to
  the other named owners instead of dominating the lane
- the next bounded frontier should shift from another visibility-loop
  micro-optimization to attribution/product work on the broader remaining
  long-task cost that still dominates the overall capture window
