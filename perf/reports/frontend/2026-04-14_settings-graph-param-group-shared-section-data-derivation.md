# 2026-04-14 Settings Graph Param Group Shared Section Data Derivation

- canonical lane: `rotaryParamCodeObjDefault`
- goal: collapse repeated pinned/unpinned/edge-strip section-data derivation at
  the `ParamGroupContainer` boundary instead of taking another row-local cache
  or memo cut

## Change

- moved the repeated `getCurrShownParamIds(...)`, edge-port labeling, filtered
  pinned/unpinned param-path derivation, and section-style resolution inputs
  into one container-level selector in
  `frontend/src/components/Params/GroupContainer.tsx`
- converted `EdgesStrip`, `GetPinnedParams`, and `GetUnpinnedParams` to receive
  those derived slices as props instead of each rebuilding the same section
  view independently

## Focused verification

- `source activate.sh && pnpm -C frontend exec vitest run src/components/Params/GroupContainer.render-stability.test.tsx src/components/Params/GroupContainer.instrumentation.test.tsx`
  - passed (`2` files, `5` tests)
- `pnpm -C frontend exec prettier --write src/components/Params/GroupContainer.tsx`
  - passed

## Live canonical probe

- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-028/worktree-ai.log`
  - passed (`1` Playwright test, `1.5m`)

## Canonical readout

Comparison baseline: item `467` in the active handoff.

- `averageFrameDurationMs`
  - `43.02` -> `41.29`
- `longTaskTotalDurationMs`
  - `1221` -> `1162`
- `presentedSceneSectionParamGroupContainerReactRender`
  - `521.5ms total` / `67.6ms max` -> `530.0ms total` / `75.6ms max`
- `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
  - `459.2ms total` / `64.5ms max` -> `466.9ms total` / `71.9ms max`
- `presentedSceneSectionUnpinnedParamDndListRowsReactRender`
  - `444.9ms total` / `62.6ms max` -> `447.5ms total` / `68.1ms max`

## CDP visual check

- done in a fresh-context sub-agent against `http://127.0.0.1:3075/settings`
- `All Settings` rendered cleanly, `rotaryParamCodeObjDefault` was visibly
  reachable, and there was no obvious blank-card, detached-body, or severe
  rendering artifact on the canary surface

## Reading

- this was a behavior-preserving cleanup at the current owner boundary, but it
  did not reduce the dominant narrow owners on the live canonical lane
- overall frame and long-task totals improved versus the last non-winning
  baseline, but the hotspot still sits in
  `ParamGroupContainer` / `ParamGroupUnpinnedParams` / unpinned rows
- the next pass should pick a real owner reduction above or across that same
  subtree rather than more shared-derivation cleanup on the same boundary
