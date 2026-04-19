# Settings All Settings Viewport Interaction Pending Snapshot Fast Path Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-camera-transform-imperative-sync-rerun.md`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Trim one more per-tick viewport-interaction JS path by keeping the optimistic pending viewport snapshot alive without rescanning pending operations and project-state viewport mirrors after the interaction queue is already established.

## Implementation

- `frontend/src/state/actions/sectionInfos.ts`
  - specialized `dispatchViewportUpdateWhileInteracting()` so the active pan/zoom path:
    - still skips work when interaction starts without any actual camera movement
    - reuses the current pending viewport op once interaction is already in flight
    - updates only the pending snapshot and queued-send flag on subsequent motion ticks instead of walking pending ops and project-state viewport equality every time
- `frontend/src/state/subscriptions.test.ts`
  - added focused coverage proving:
    - interaction start with no camera movement does not queue a pending viewport op
    - multiple active interaction snapshots reuse the same pending viewport op until settle

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
- `raf.meanMs: 42.58`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1050.06`
- `longTasks.count: 8`
- `longTasks.totalMs: 5844`
- `longTasks.maxMs: 3553`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-camera-transform-imperative-sync-rerun.md` on the same dense probe:

- `documentNodeCount: 5494 -> 5494`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 44.26 -> 42.58`
- `raf.p50Ms: 33.3 -> 33.3`
- `raf.p95Ms: 66.7 -> 50`
- `raf.maxMs: 1049.92 -> 1050.06`
- `longTasks.count: 11 -> 8`
- `longTasks.totalMs: 5885 -> 5844`
- `longTasks.maxMs: 3408 -> 3553`
- `motionHiddenBodies.totalMotionBodyRootCount: 45 -> 45`
- `motionHiddenBodies.peakHiddenBodyCount: 45 -> 45`

## Interpretation

- This is a bounded whole-scene JS/GC cleanup on the active viewport-interaction lane, not a new dense-scene breakthrough.
- The checked canary stayed in the same improved band and the live visual check stayed clean, so specializing the interaction-only pending viewport queue does not reopen the canvas path.
- The rerun improved `raf.meanMs`, `raf.p95Ms`, `longTasks.count`, and `longTasks.totalMs` slightly, which is directionally useful, but it still does not change the broader milestone decision.
- Close this interaction-pending-snapshot sub-lane here instead of continuing to shave the same viewport-persistence family by inertia.
- The next default frontier should move to a broader Pixi-owned graph-surface step unless a fresh trace identifies another comparably credible viewport-interaction JS hotspot with whole-scene reach.

## Verification

- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-014/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (40.7s)`
- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/state/actions/sectionInfos.ts src/state/subscriptions.test.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/state/subscriptions.test.ts`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before test collection, not by this slice
- CDP visual check:
  - first fresh headless DevTools sub-agent hit a rejected one-shot bootstrap token (`401 invalid_token`); treated as tooling noise rather than product evidence
  - retried once with a fresh bootstrap URL from `./scripts/dev-runtime-info.sh`
  - `/settings` mounted with `All Settings` active
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` remained visible with expected default content and no obvious blank or detached shell/body artifact
  - workspace label/sidebar and an inactive chat panel were visible as expected workspace chrome noise
