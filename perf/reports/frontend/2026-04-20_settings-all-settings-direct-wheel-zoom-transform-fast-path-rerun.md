# Settings All Settings Direct Wheel Zoom Transform Fast Path Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense checkpoint: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`
Focused motion probes:
- `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
- `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`

## Goal

Reduce per-wheel renderer-main JavaScript on the canonical dense `settings` -> `All Settings` lane by bypassing the default d3 wheel handler's event-dispatch path and committing the constrained camera transform directly from `ZoomPane`.

## Implementation

- `frontend/src/forks/xyflow/core/container/ZoomPane.tsx`
  - added `resolveDirectWheelViewportTransform(...)` so the default wheel path derives the next constrained viewport transform directly from the current `__zoom` state, pointer location, scale extent, and translate extent
  - the default wheel handler now:
    - starts the wheel-burst interaction state
    - closes context menus once at burst start
    - clears any stale queued transform frame
    - synchronizes the computed transform back into both the d3 `__zoom` state and the React Flow store without routing through the d3 wheel event dispatcher
    - falls back to the old d3 wheel handler only if the direct transform cannot be resolved
- `frontend/src/forks/xyflow/core/container/ZoomPane.test.ts`
  - added focused coverage proving default wheel zoom now commits immediately without queuing an extra transform animation frame

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

## Same-Runtime Dense Before / After

Baseline rerun before the change on the current runtime recorded:

- `documentNodeCount: 5498`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `raf.meanMs: 43.14`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1116.68`
- `longTasks.count: 8`
- `longTasks.totalMs: 6261`
- `longTasks.maxMs: 3800`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Fresh rerun after the change on the same runtime recorded:

- `documentNodeCount: 5498`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `raf.meanMs: 44.26`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1283.28`
- `longTasks.count: 8`
- `longTasks.totalMs: 6120`
- `longTasks.maxMs: 3586`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against the same-runtime baseline:

- `documentNodeCount: 5498 -> 5498`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 43.14 -> 44.26`
- `raf.p50Ms: 33.3 -> 33.3`
- `raf.p95Ms: 50 -> 50`
- `raf.maxMs: 1116.68 -> 1283.28`
- `longTasks.count: 8 -> 8`
- `longTasks.totalMs: 6261 -> 6120`
- `longTasks.maxMs: 3800 -> 3586`

## Focused Interaction Proof

The focused motion-body overlay check still passed on the same wheel path:

- initial state on `browserSectionDefault`, `promptSectionDefault`, and `languageServer`:
  - `hiddenBodyCount: 0`
  - `hiddenHeaderControlsCount: 0`
  - `display: block`
  - `childElementCount: 2`
- during one checked wheel zoom interaction:
  - `hiddenBodyCount: 45`
  - `hiddenHeaderControlsCount: 45`
  - `display: none`
  - `childElementCount: 0`
- after settle:
  - `hiddenBodyCount: 0`
  - `hiddenHeaderControlsCount: 0`
  - `display: block`
  - `childElementCount: 2`

## Interpretation

- This is a bounded shared wheel-path reducer on the active renderer-main JS / GC lane, not a new whole-scene dense checkpoint.
- The live dense probe stayed in the same `~43-44ms` / `~6.1-6.3s` runtime band, so this slice did not materially beat the current whole-scene checkpoint.
- The change appears safe to keep on the checked path because the dense probe, the focused motion-body wheel proof, and the CDP visual check all stayed intact while the long-task total/max moved slightly down.
- Close this direct wheel fast-path micro-lane here instead of iterating on more wheel-handler polish by inertia.
- The next default frontier should return to a stronger trace-backed renderer-main JS / GC reducer or a broader Pixi-owned graph-surface ownership step.

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/ZoomPane.tsx src/forks/xyflow/core/container/ZoomPane.test.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/ZoomPane.test.ts`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before test collection, not by this slice
- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-025/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (35.8s)`
- Playwright motion-body overlay probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-025/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts --reporter=line --workers=1`
  - result: `1 passed (30.4s)`
- Chrome DevTools MCP:
  - fresh headless visual check in a fresh sub-agent using a fresh bootstrap URL from `./scripts/dev-runtime-info.sh`
  - `/settings` loaded with `All Settings` active and `fit view` applied
  - the graph surface was mounted and populated with `browserSectionDefault`, `promptSectionDefault`, and `languageServer`
  - no obvious blank graph or detached shell/body artifact was visible
