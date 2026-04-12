# Settings Graph Perf Report: Inactive Param DnD Provider Bypass

Date: 2026-04-14
Worktree: `pixijs-graph`
Target lane: normalized `All Settings` canary, named section `rotaryParamCodeObjDefault`

## Change

Skip the top-level `forks/dnd-kit/ParamDndContext` provider stack for
`ParamGroupContainer` when parameter dragging is inactive. The normal
non-selecting lane now renders children directly instead of mounting the drag
provider, sensors, collision tracker, monitor, and overlay helpers.

## Verification

- Focused unit tests:
  - `pnpm -C frontend exec vitest run src/forks/dnd-kit/ParamDndContext.test.tsx src/components/Params/GroupContainer.render-stability.test.tsx`
- Live canary probe:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-034/worktree-ai.log`

## Before

Baseline from item `472` after the unpinned-area attribution split:

- `averageFrameDurationMs`: `43.56`
- `longTaskTotalDurationMs`: `1297`
- `dominantCanaryMotionAttributionOwner`:
  `presentedSceneSectionSubtreeReactRender`
- Top narrow owners:
  - `ParamGroupContainer`: `577.5ms`
  - `ParamGroupUnpinnedParams`: `507.2ms`
  - `ParamGroupUnpinnedArea`: `498.9ms`
  - `UnpinnedParamDndListRows`: `486.1ms`

## After

Current live probe:

- `averageFrameDurationMs`: `37.21`
- `longTaskTotalDurationMs`: `986`
- `dominantCanaryMotionAttributionOwner`:
  `presentedSceneSectionSubtreeReactRender`
- Top narrow owners:
  - `ParamGroupContainer`: `418.8ms`
  - `ParamGroupUnpinnedParams`: `381.5ms`
  - `ParamGroupUnpinnedArea`: `375.0ms`
  - `UnpinnedParamDndListRows`: `367.3ms`

## Reading

This is a real live win on the canonical lane without changing the dominant
owner ordering. Bypassing the inactive DnD provider reduced the broader
`ParamGroupContainer` / unpinned subtree totals materially:

- `averageFrameDurationMs`: `43.56 -> 37.21`
- `longTaskTotalDurationMs`: `1297 -> 986`
- `ParamGroupContainer`: `577.5ms -> 418.8ms`
- `ParamGroupUnpinnedParams`: `507.2ms -> 381.5ms`
- `ParamGroupUnpinnedArea`: `498.9ms -> 375.0ms`
- `UnpinnedParamDndListRows`: `486.1ms -> 367.3ms`

The next slice should stay at or above this broader ownership boundary instead
of reopening row-local trims.
