# 2026-04-14 Settings Graph Dead Param Area Observer Removal

- canonical lane: `rotaryParamCodeObjDefault`
- goal: remove dead pinned/unpinned param-area observer fanout above the live
  `ParamGroupContainer` hotspot instead of taking another row-local cache cut

## Change

- removed the unused pinned/unpinned param-area min-height observers from
  `frontend/src/components/Params/GroupContainer.tsx`
- deleted the dead observer/measurement helpers:
  `frontend/src/components/Params/paramAreaObservers.ts` and
  `frontend/src/components/Params/paramAreaMeasurements.ts`
- removed the now-unused temporary misc keys from
  `frontend/src/utils/constants.ts`
- updated
  `frontend/src/components/Params/GroupContainer.render-stability.test.tsx`
  to prove the container only keeps the remaining live resize observers for
  column width, fixed-height, and edge-strip measurement

## Focused verification

- `pnpm -C frontend exec vitest run src/components/Params/GroupContainer.render-stability.test.tsx src/components/Params/GroupContainer.instrumentation.test.tsx`
  - passed (`2` files, `7` tests)
- `pnpm -C frontend exec prettier --check src/components/Params/GroupContainer.tsx src/components/Params/GroupContainer.render-stability.test.tsx src/utils/constants.ts`
  - passed

## Live canonical probe

- `./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.pixijs-graph/. --runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-030/worktree-ai.log`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-030/worktree-ai.log`
  - passed (`1` Playwright test, `1.7m`)

## Canonical readout

Comparison baseline: item `469` in the active handoff.

- `averageFrameDurationMs`
  - `44.44` -> `47.73`
- `longTaskTotalDurationMs`
  - `1293` -> `1447`
- `presentedSceneSectionParamGroupContainerReactRender`
  - `513.1ms total` -> `671.7ms total`
- `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
  - `452.8ms total` -> `586.6ms total`
- `presentedSceneSectionUnpinnedParamDndListRowsReactRender`
  - `433.4ms total` -> `565.1ms total`

## Reading

- the removed observer path was genuinely dead code, but removing it did not
  improve the canonical live lane
- close this dead-observer fanout hypothesis as behavior-preserving but
  non-winning on `rotaryParamCodeObjDefault`
- the next pass should stop trimming adjacent `ParamGroupContainer` observer
  plumbing and either:
  - land a broader visible-lane owner reduction in
    `ParamGroupUnpinnedParams` / unpinned row ownership, or
  - take the first bounded scene-owned static body slice if fresh evidence can
    justify it
