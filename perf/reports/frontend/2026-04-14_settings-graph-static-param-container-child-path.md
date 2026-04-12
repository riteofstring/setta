# 2026-04-14 Settings Graph Static Param Container Child Path

- canonical lane: `rotaryParamCodeObjDefault`
- goal: remove dormant param-DnD child subscriptions from real param rows on
  the normal non-drag lane so nested rows use their static child arrays until
  param drag is actually enabled
- product slice:
  - `frontend/src/components/Params/ParamContainer.tsx`
    now splits nested-child rendering into:
    - a static path that forwards the existing `paramChildren` array directly
      to `GetParamSwitch`
    - a DnD-aware path that still consults `useParamDndChildrenForParent(...)`
      only when the row is on the sortable drag path
  - `frontend/src/components/Params/ParamSwitch.tsx`
    now tells `ParamContainer` whether the current row is on the static or
    sortable path so the non-drag lane bypasses the dormant DnD child hook
  - `frontend/src/components/Params/ParamContainer.render-stability.test.tsx`
    now proves the static lane does not subscribe to DnD child arrays while
    the sortable lane still does

## Focused verification

- `pnpm -C frontend exec vitest run src/components/Params/ParamContainer.render-stability.test.tsx src/components/Params/ParamSwitch.render-stability.test.tsx src/components/Params/ParamSwitch.test.tsx`
  - passed (`3` files, `11` tests)
- `pnpm -C frontend exec prettier --check src/components/Params/ParamContainer.tsx src/components/Params/ParamContainer.render-stability.test.tsx src/components/Params/ParamSwitch.tsx`
  - passed

## Live canonical probe

- `./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.pixijs-graph/. --runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-031/worktree-ai.log`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-031/worktree-ai.log`
  - passed (`1` Playwright test, `1.6m`)

## Canonical readout

- comparison baseline: item `470` in the active handoff
- before this static-child-path cut:
  - `averageFrameDurationMs`
    `47.73`
  - `longTaskTotalDurationMs`
    `1447`
  - `presentedSceneSectionParamGroupContainerReactRender`
    `671.7ms total` / `89.6ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `586.6ms total` / `80.3ms max`
  - `presentedSceneSectionUnpinnedParamDndListRowsReactRender`
    `565.1ms total` / `71.9ms max`
- after this static-child-path cut:
  - `averageFrameDurationMs`
    `42.04`
  - `longTaskTotalDurationMs`
    `1200`
  - `presentedSceneSectionParamGroupContainerReactRender`
    `554.1ms total` / `91.3ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `493.3ms total` / `87.1ms max`
  - `presentedSceneSectionUnpinnedParamDndListRowsReactRender`
    `476.6ms total` / `84.0ms max`

## CDP visual check

- done in a fresh-context sub-agent
- `/settings` loaded with `All Settings` active
- `rotaryParamCodeObjDefault` rendered cleanly and the graph surface stayed
  visually stable with no obvious blank-card, detached-body, clipping, or
  severe rendering artifact

## Reading

- this is a real live win on the canonical lane, but it does not change the
  dominant owner order
- the same visible trio still dominates:
  `ParamGroupContainer`, `ParamGroupUnpinnedParams`, and
  `UnpinnedParamDndListRows`
- the next pass should keep treating the non-drag DnD plumbing trim as closed
  and move to the next broader owner cut above the row seam, or take the first
  justified scene-owned static body slice
