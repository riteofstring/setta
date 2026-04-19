# Settings All Settings Param Duplicate Index Selector Cache Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`
Hotspot reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md`
Focused unit coverage:
- `frontend/src/state/actions/params/paramDuplicateIndex.test.ts`
Dense probe:
- `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Reduce one trace-backed whole-scene JS / GC source on the canonical dense `All Settings` lane by taking `ParamDndList` off the unconditional `buildParamDuplicateIndex(...)` + `lodash` deep-equality path for unrelated project-state updates.

## Canonical lane

- target section: `settings-section__browserSectionDefault`
- sibling proof sections:
  - `settings-section__promptSectionDefault`
  - `settings-section__languageServer`

## Trace-backed reason for the slice

Local CPU sample aggregation over the checked `wheel` `EventDispatch` window from `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md` still showed:

- `walk @ src/state/actions/params/paramTree.ts`
- `baseIsEqualDeep @ lodash`
- `baseIsEqual @ lodash`

Those samples line up with the `ParamDndList` duplicate-name selector rebuilding the full param parent map and then asking `_.isEqual(...)` to compare it on every project-state publication, even when the underlying param graph did not change.

## Implementation shape

- `frontend/src/state/actions/params/paramDuplicateIndex.ts`
  - added `createParamDuplicateIndexSelector(sectionId)` with a small section-scoped cache keyed to the top-level param-shape references that actually affect duplicate-name resolution
  - unchanged param references now reuse the previous duplicate-index object instead of rebuilding the parent map and duplicate-name buckets
- `frontend/src/components/Params/ParamDndList.tsx`
  - now uses the memoized per-section selector and the store's default reference equality instead of rebuilding the duplicate index under `_.isEqual(...)`
- `frontend/src/state/actions/params/paramDuplicateIndex.test.ts`
  - proves unrelated project-config changes reuse the cached selector result
  - proves real param-name changes invalidate the cache and recompute the duplicate buckets

## Fresh dense rerun

Fresh live rerun on the current worktree runtime recorded:

- `blankPanePoint: { x: 24, y: 60 }`
- `flowNodeCount: 46`
- `visibleFlowNodeCount: 46`
- `projectChatChromeCount: 0`
- `documentNodeCount: 5498`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `codeMirrorCount: 0`
- `raf.meanMs: 42.86`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1150`
- `longTasks.count: 8`
- `longTasks.totalMs: 5889`
- `longTasks.maxMs: 3507`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`:

- `documentNodeCount: 5494 -> 5498`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 42.58 -> 42.86`
- `raf.p50Ms: 33.3 -> 33.3`
- `raf.p95Ms: 50 -> 50`
- `longTasks.count: 8 -> 8`
- `longTasks.totalMs: 5844 -> 5889`

## Interpretation

- This is a safe shared selector-path reducer on the active renderer-main JS / GC lane, not a new dense-scene breakthrough.
- The dense canary stayed in the current best `~42-43ms` / `~5.8-5.9s` band with the usual chat-normalized DOM counts, so the selector cache is safe to keep.
- The rerun did not materially beat the current whole-scene checkpoint by itself, but it removes one trace-backed param-tree / deep-equality source from the hot path without reopening visual or interaction regressions.
- Close this duplicate-index selector sub-lane here; the next default pass should move to the next shared param-family hotspot or the stronger graph-surface ownership step instead of reopening another narrow selector micro-pass by inertia.

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ParamDndList.tsx src/state/actions/params/paramDuplicateIndex.ts src/state/actions/params/paramDuplicateIndex.test.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/state/actions/params/paramDuplicateIndex.test.ts`
  - result: `1 passed`, `2` tests
- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-027/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (40.3s)`
- CDP visual check:
  - required for this frontend slice
  - fresh headless DevTools sub-agent bootstrapped cleanly to `/settings` with `All Settings` active and `fit view` applied
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` were visible on the graph surface
  - no obvious blank graph or detached shell/body artifact was visible
