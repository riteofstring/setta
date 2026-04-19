# Settings All Settings ZoomPane Wheel Event Metadata Cache Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-hidden-section-resize-handles-rerun.md`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Trim one more viewport-interaction JS path by caching per-wheel target/class and platform metadata inside `ZoomPane` so the d3 zoom filter and active wheel handlers stop repeating the same DOM ancestry walks on every wheel event.

## Implementation

- `frontend/src/forks/xyflow/core/container/ZoomPane.tsx`
  - adds a per-event `WeakMap` cache for:
    - the target element
    - the normalized event button
    - `isMacOs()` detection
    - repeated `closest(".<class>")` checks used by the zoom filter and wheel handlers
  - reuses that cached metadata in the `nowheel` / `nopan` checks and the mac pinch-wheel normalization path
- `frontend/src/forks/xyflow/core/container/ZoomPane.test.ts`
  - adds focused coverage proving `ctrl` + `wheel` on a `nowheel` target still stays allowed when mac pinch zoom is enabled

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
- `documentNodeCount: 5496`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 44.26`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 33.4`
- `raf.maxMs: 1099.85`
- `longTasks.count: 9`
- `longTasks.totalMs: 6060`
- `longTasks.maxMs: 3610`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-motion-hidden-section-resize-handles-rerun.md` on the same dense probe:

- `documentNodeCount: 5496 -> 5496`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 43.14 -> 44.26`
- `raf.p50Ms: 33.3 -> 33.3`
- `raf.p95Ms: 50 -> 33.4`
- `raf.maxMs: 1150 -> 1099.85`
- `longTasks.count: 8 -> 9`
- `longTasks.totalMs: 5989 -> 6060`
- `longTasks.maxMs: 3560 -> 3610`
- `motionHiddenBodies.totalMotionBodyRootCount: 45 -> 45`
- `motionHiddenBodies.peakHiddenBodyCount: 45 -> 45`

## Interpretation

- This is a bounded wheel-event JS cleanup on the active renderer-main lane, not a new dense-scene breakthrough.
- The checked canary stayed visually clean and the dense probe remained in the same runtime band, which means caching the repeated wheel-event metadata is behavior-safe on the current canvas-shell path.
- The rerun stayed effectively flat overall, so this is not the missing whole-scene reducer behind the current `EventDispatch` + GC hotspot.
- Close this wheel-event metadata sub-lane here instead of polishing it further by inertia.
- The next default frontier should move back to a stronger viewport-interaction JS/GC reducer or the broader Pixi-owned graph-surface step rather than another small `ZoomPane` micro-pass.

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/ZoomPane.tsx src/forks/xyflow/core/container/ZoomPane.test.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/ZoomPane.test.ts`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before test collection, not by this slice
- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-019/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (40.4s)`
- Chrome DevTools MCP:
  - verified in a fresh headless DevTools sub-agent on a fresh one-shot bootstrap URL from `./scripts/dev-runtime-info.sh`
  - `/settings` mounted with `All Settings` active and `fit view` applied
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` were present on the graph surface
  - no obvious blank or detached shell/body artifact was visible
