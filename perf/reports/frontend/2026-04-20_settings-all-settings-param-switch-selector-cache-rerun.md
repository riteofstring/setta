# Settings All Settings ParamSwitch Selector Cache Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Related hotspot report: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md`
Focused dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Remove one more shared param-row project-state rebuild path on the active renderer-main JS / GC lane without reopening the now-closed `ZoomPane`, duplicate-index, or `GroupContainer` micro-lanes.

## Canonical lane

- target section: `settings-section__browserSectionDefault`
- sibling proof sections:
  - `settings-section__promptSectionDefault`
  - `settings-section__languageServer`

## Implementation

- Added `frontend/src/state/actions/params/paramSwitchSelectors.ts` with `createParamSwitchProjectStateSelector(sectionId, paramInfoId)`.
- The selector caches the `ParamSwitch` row state from the effective param impl plus the selected-param array ref that actually affect row rendering, instead of rebuilding a `{ paramsImpl, codeObjImpl }` object and comparing it with `_.isEqual(...)` on every unrelated project-state publish.
- Updated `frontend/src/components/Params/ParamSwitch.tsx` to instantiate that selector once per param row with `useMemo(...)`.
- Tightened the search-state selector in `ParamSwitch.tsx` to a primitive boolean equality instead of generic deep equality.
- Added focused cache coverage in `frontend/src/state/actions/params/paramSwitchSelectors.test.ts` for reuse across unrelated viewport and sibling-param churn plus invalidation on real selection and impl changes.

## Fresh dense rerun

Fresh live rerun on the current worktree runtime recorded:

- `documentNodeCount: 5498`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 42.86`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1116.62`
- `longTasks.count: 9`
- `longTasks.totalMs: 5791`
- `longTasks.maxMs: 3401`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

## Interpretation

- This is a safe shared param-family reducer on the trace-backed renderer-main JS / GC lane, not a dense-scene breakthrough.
- The dense canary stayed in the current `~42-43ms` / `~5.8s` band while long-task total came back slightly lower than the last authoritative `GroupContainer` rerun.
- Keep the selector cache, but close the `ParamSwitch` selector micro-lane here instead of chaining another same-shape selector pass by inertia.

## Verification

- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ParamSwitch.tsx src/state/actions/params/paramSwitchSelectors.ts src/state/actions/params/paramSwitchSelectors.test.ts`
  - result: passed
- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/state/actions/params/paramSwitchSelectors.test.ts`
  - result: `1 passed`, `4` tests
- `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-029/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (40.4s)`
- Chrome DevTools MCP:
  - fresh headless DevTools sub-agent consumed a fresh bootstrap URL from `./scripts/dev-runtime-info.sh`
  - normalized to `/settings` with `All Settings` active and one `fit view`
  - closed the extra chat window chrome during the check
  - `browserSectionDefault` was visible on the mounted graph surface with no obvious blank graph or detached shell/body artifact
