# Settings All Settings Backdrop Scene Map Equality Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline checkpoint: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Remove one more retained-scene redraw invalidation path on the canonical `settings-section__browserSectionDefault` lane by keeping `SectionShellBackdropCanvas` subscribed only to scene-relevant node geometry instead of repainting whenever `useNodeInternals` publishes a new `Map` with unchanged backdrop geometry.

## Implementation

- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx`
  - added a backdrop-specific node-map equality check for the retained canvas subscription
  - the canvas backdrop now ignores `useNodeInternals` map replacement when all scene-relevant fields are unchanged:
    - section id presence
    - node position
    - width / height
    - `tempZIndex` / `zIndex`
    - fallback `style.background`
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - reuses the same mock canvas context across repaint checks
  - proves same-scene node-map churn does not trigger another retained-canvas paint
  - proves a real geometry change still triggers a repaint

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

## Fresh Dense Metrics

Fresh live rerun on the current worktree runtime recorded:

- `blankPanePoint: { x: 24, y: 60 }`
- `flowNodeCount: 46`
- `visibleFlowNodeCount: 46`
- `projectChatChromeCount: 0`
- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 47.62`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 66.7`
- `raf.maxMs: 833.3`
- `longTasks.count: 13`
- `longTasks.totalMs: 3902`
- `longTasks.maxMs: 836`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`
- `motionHiddenSubtreeChurn.childListMutationCount: 0`
- `motionHiddenSubtreeChurn.subtreeRemovedElementCount: 0`
- `motionHiddenSubtreeChurn.subtreeAddedElementCount: 0`

Compared against the current clean checkpoint in `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`:

- `documentNodeCount: 5494 -> 5494`
- `buttonCount: 47 -> 47`
- `canvasCount: 1 -> 1`
- `raf.meanMs: 42.58 -> 47.62`
- `raf.p50Ms: 33.3 -> 33.3`
- `raf.p95Ms: 50 -> 66.7`
- `raf.maxMs: 1050.06 -> 833.3`
- `longTasks.count: 8 -> 13`
- `longTasks.totalMs: 5844 -> 3902`
- `longTasks.maxMs: 3553 -> 836`

## Interpretation

- This is a real retained-scene invalidation cleanup on the canonical browser lane: same-scene `useNodeInternals` map churn no longer forces the retained backdrop to rebuild and repaint.
- The headless dense rerun stayed mixed, so do not treat this as a new whole-scene checkpoint; keep `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md` as the clean comparison baseline.
- Close the node-map identity sub-lane here. The next pass should stay on retained-scene redraw / paint / snapshot reuse, but it should not spend another iteration on more `useNodeInternals` equality micropolish unless a fresh hotspot isolates a new scene-authority miss.

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before collection, not by this slice
- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.Tkw5gG/loop-001/run-007/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (40.5s)`
- CDP visual check:
  - done in a fresh headless DevTools sub-agent on the current `3068/8068` runtime with a fresh bootstrap URL
  - page mounted: yes
  - target `settings-section__browserSectionDefault` existed and was visible on the graph surface
  - no obvious blank/transparent canvas or detached shell/body artifact appeared on that lane
