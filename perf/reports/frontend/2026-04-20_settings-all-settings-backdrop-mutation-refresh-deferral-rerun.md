# Settings All Settings Backdrop Mutation Refresh Deferral Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior clean checkpoint: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`
Focused motion proof: `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`

## Goal

Remove one remaining retained-canvas observer-churn path on the canonical `settings-section__browserSectionDefault` lane by deferring mutation-driven backdrop observer refresh until `viewportInteractionActive` settles instead of rebuilding `ResizeObserver` graphs while measurements are suspended.

## Implementation

- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx`
  - extended the shared retained-detail measurement hook so subtree mutations now set one pending observer refresh flag while measurements are suspended
  - refreshed measured-element observer wiring only once after interaction settles, before the pending post-motion measure runs
  - kept the existing per-family measurement plans and geometry comparators intact so the slice changes observer refresh timing, not retained detail rendering rules
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - added focused coverage proving subtree mutations on the browser retained-text lane do not recreate `ResizeObserver` instances until interaction resumes

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
  - Chrome DevTools MCP, headless Chromium
- Surface:
  - `settings` -> `All Settings`
- Canonical target section:
  - `settings-section__browserSectionDefault`
- Sibling proof sections:
  - `settings-section__promptSectionDefault`
  - `settings-section__languageServer`

## Fresh Dense Metrics

Fresh live rerun on the current worktree runtime recorded:

- blank pane point: `x=24`, `y=60`
- `flowNodeCount: 46`
- `visibleFlowNodeCount: 46`
- `projectChatChromeCount: 0`
- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `codeMirrorCount: 0`
- `raf.meanMs: 46.36`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50.1`
- `raf.maxMs: 1199.95`
- `longTasks.count: 9`
- `longTasks.totalMs: 6719`
- `longTasks.maxMs: 4111`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against the current clean whole-scene checkpoint in `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`:

- `documentNodeCount: 5494 -> 5494`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 42.58 -> 46.36`
- `raf.p95Ms: 50 -> 50.1`
- `raf.maxMs: 1050.06 -> 1199.95`
- `longTasks.count: 8 -> 9`
- `longTasks.totalMs: 5844 -> 6719`
- `longTasks.maxMs: 3553 -> 4111`
- `motionHiddenBodies.totalMotionBodyRootCount: 45 -> 45`
- `motionHiddenBodies.peakHiddenBodyCount: 45 -> 45`

## Focused Motion Proof

The focused motion-overlay proof on the same runtime still recorded:

- initial state on `browserSectionDefault`, `promptSectionDefault`, and `languageServer`:
  - `hiddenHeaderControlsCount: 0`
  - `hiddenBodyCount: 0`
  - each checked section kept `childElementCount: 2` and `display: block`
- during one checked zoom interaction:
  - `hiddenHeaderControlsCount: 45`
  - `hiddenBodyCount: 45`
  - each checked section flipped to `childElementCount: 0` and `display: none`
- after settle:
  - `hiddenHeaderControlsCount: 0`
  - `hiddenBodyCount: 0`
  - each checked section restored `childElementCount: 2` and `display: block`

## Interpretation

- This is a real retained-graph structural cleanup on the same `SectionShellBackdropCanvas` observer family as run `034`, but on the remaining mutation-driven refresh path rather than the already-closed interaction-toggle effect churn.
- The browser retained-text lane now collapses mutation storms during motion into one deferred observer refresh at settle, which is the intended behavior for hidden subtree mutations that the retained canvas already covers.
- The live canary stayed behaviorally intact on the focused motion proof, but the dense rerun came back worse than the clean checkpoint, so this slice should be treated as structural closure of one concrete observer-refresh path, not as a new whole-scene performance milestone.
- Close the mutation-refresh sub-lane here. The next default pass should move to another retained-graph candidate such as retained-scene paint invalidation, snapshot invalidation/reuse beyond observer timing, or motion-hidden-body orchestration that still dominates the start/end outlier.

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before test collection, not by this slice
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.Tkw5gG/loop-001/run-002/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.1m)`
- Chrome DevTools MCP:
  - verified in a fresh headless DevTools sub-agent after consuming a fresh bootstrap URL from `./scripts/dev-runtime-info.sh`
  - normalized to `/settings` with `All Settings` active
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` were visibly rendered on the graph surface
  - no obvious blank/transparent canvas or detached shell/body artifact was visible
