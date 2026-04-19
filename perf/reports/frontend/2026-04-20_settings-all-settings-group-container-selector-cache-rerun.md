# Settings All Settings GroupContainer Selector Cache Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`
Hotspot reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md`
Focused unit coverage:
- `frontend/src/state/actions/params/paramGroupSelectors.test.ts`
Dense probe:
- `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Reduce one remaining shared `GroupContainer` selector churn path on the canonical dense `All Settings` lane so pinned/unpinned param filtering and edge-strip label arrays stop rebuilding on unrelated project-state publications.

## Canonical lane

- target section: `settings-section__browserSectionDefault`
- sibling proof sections:
  - `settings-section__promptSectionDefault`
  - `settings-section__languageServer`

## Trace-backed reason for the slice

- The saved hotspot report still leaves the canonical lane on renderer-main `EventDispatch` / `v8.callFunction` / GC work instead of layout or paint.
- The current handoff explicitly called out `GroupContainer` edge-strip label work as one of the next shared param selector candidates on that lane.
- Inference from the current code shape: `EdgesStrip`, `GetPinnedParams`, and `GetUnpinnedParams` were rebuilding filtered shown-param objects and, for the edge strip, port-label arrays under `_.isEqual(...)` on every project-state publication even when the section's effective impl and shown-param refs were unchanged.

## Implementation shape

- `frontend/src/state/actions/params/paramGroupSelectors.ts`
  - added `createPinnedParamsStateSelector(sectionId)`, `createUnpinnedParamsStateSelector(sectionId)`, and `createEdgeStripStateSelector(sectionId)` with small section-scoped caches keyed to the effective section impl plus the specific shown-param / code-object references that affect each derived result
  - exported `buildPinnedParamsState(...)`, `buildUnpinnedParamsState(...)`, and `buildEdgeStripState(...)` so the cache behavior can be locked with focused tests
- `frontend/src/components/Params/GroupContainer.tsx`
  - `EdgesStrip`, `GetPinnedParams`, and `GetUnpinnedParams` now instantiate the per-section selector once with `useMemo(...)`
  - those components now rely on the store's default reference equality instead of rebuilding new derived objects behind `_.isEqual(...)`
- `frontend/src/state/actions/params/paramGroupSelectors.test.ts`
  - proves pinned and edge-strip selector results are reused across unrelated viewport/project-config changes
  - proves the unpinned selector invalidates when edge-input filtering changes
  - proves the edge-strip selector invalidates when an edge-input label changes

## Fresh dense reruns

First live rerun on the current worktree runtime recorded:

- `documentNodeCount: 5498`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `raf.meanMs: 44.82`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 83.3`
- `raf.maxMs: 1116.6`
- `longTasks.count: 10`
- `longTasks.totalMs: 5825`
- `longTasks.maxMs: 3357`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

One bounded rerun on the same runtime to check the noisy `p95` recorded:

- `documentNodeCount: 5498`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `raf.meanMs: 43.28`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1116.58`
- `longTasks.count: 8`
- `longTasks.totalMs: 5861`
- `longTasks.maxMs: 3427`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`:

- `documentNodeCount: 5494 -> 5498`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 47`
- authoritative rerun `raf.meanMs: 42.58 -> 43.28`
- authoritative rerun `raf.p95Ms: 50 -> 50`
- authoritative rerun `longTasks.totalMs: 5844 -> 5861`

## Interpretation

- This is a safe shared selector-path reducer on the active renderer-main JS / GC lane, not a new dense-scene breakthrough.
- The first rerun came back noisier on `raf.p95`, but the single bounded rerun settled back into the current `~43ms` / `~5.8-5.9s` band with the usual chat-normalized DOM counts.
- Keep the selector cache, but close this `GroupContainer` selector micro-lane here instead of spending another default pass on similar selector-cache follow-ups.
- The next default pass should move to the next trace-backed shared reducer or to the broader graph-surface ownership step.

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/GroupContainer.tsx src/state/actions/params/paramGroupSelectors.ts src/state/actions/params/paramGroupSelectors.test.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/state/actions/params/paramGroupSelectors.test.ts`
  - result: `1 passed`, `5` tests
- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-028/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (40.4s)` with the noisy first rerun above
  - rerun result: `1 passed (34.1s)` with the authoritative stable rerun above
- CDP visual check:
  - required for this frontend slice
  - fresh headless DevTools sub-agent bootstrapped from a fresh `./scripts/dev-runtime-info.sh` URL
  - normalized to `/settings` with `All Settings` active and `fit view` applied
  - minimized the extra chat pane during the check
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` were visible on the graph surface
  - no obvious blank graph or detached shell/body artifact was visible
