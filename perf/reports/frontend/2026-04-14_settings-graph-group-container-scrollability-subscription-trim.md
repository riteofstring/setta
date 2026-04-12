# 2026-04-14 Settings Graph Group Container Scrollability Subscription Trim

- canonical lane: `rotaryParamCodeObjDefault`
- goal: remove redundant unpinned scrollability observer work above the live
  `ParamGroupContainer` hotspot instead of taking another row-prop micro-cut

## Change

- removed the dead parent-level `useIsScrollable()` subscription and unused
  refs from `GetUnpinnedParams` in
  `frontend/src/components/Params/GroupContainer.tsx`
- kept the real scrollability observer in `UnpinnedParamsArea`, which already
  owns the rendered scroll container
- added a render-stability guard in
  `frontend/src/components/Params/GroupContainer.render-stability.test.tsx`
  that proves `ParamGroupContainer` now subscribes to unpinned scrollability
  once per rendered container

## Focused verification

- `source activate.sh && pnpm -C frontend exec vitest run src/components/Params/GroupContainer.render-stability.test.tsx src/components/Params/GroupContainer.instrumentation.test.tsx`
  - passed (`2` files, `5` tests)
- `pnpm -C frontend exec prettier --check src/components/Params/GroupContainer.tsx src/components/Params/GroupContainer.render-stability.test.tsx`
  - passed

## Live canonical probe

- first run on the inherited runtime:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-026/worktree-ai.log`
  - failed with `Worktree unhealthy: page closed while writing normalized compare pane state`
- bounded recovery:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
  - refreshed runtime info with
    `./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.pixijs-graph/. --runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-026/worktree-ai.log`
- retry on the restarted runtime:
  - same worktree probe command
  - passed (`1` Playwright test, `1.9m`)

## Canonical readout

Comparison baseline: item `465` in the active handoff.

- `averageFrameDurationMs`
  - `43.56` -> `39.02`
- `longTaskTotalDurationMs`
  - `1256` -> `1099`
- `presentedSceneSectionParamGroupContainerReactRender`
  - `561.3ms total` / `76.8ms max` -> `487.3ms total` / `57.8ms max`
- `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
  - `454.3ms total` / `65.9ms max` -> `429.2ms total` / `54.5ms max`
- `presentedSceneSectionUnpinnedParamDndListRowsReactRender`
  - `454.3ms total` / `65.9ms max` -> `411.1ms total` / `51.9ms max`

## CDP visual check

- done in a fresh-context sub-agent on the restarted runtime
- `/settings` and the canary graph surface were visually healthy with no
  obvious blank-card or detached-body regression
- the named target `rotaryParamCodeObjDefault` was not visually reachable in
  that CDP session after filtering by exact section name, so treat the check as
  a successful health pass rather than a target-section screenshot oracle

## Reading

- this was a winning product cut on the canonical lane: the redundant parent
  scrollability subscription was real live overhead above the unpinned row
  subtree
- the dominant owner order did not change, so the next slice should stay above
  the row seam and target the remaining `ParamGroupContainer` /
  `ParamGroupUnpinnedParams` cost rather than reopening `GetParamSwitch`
  forwarding work
