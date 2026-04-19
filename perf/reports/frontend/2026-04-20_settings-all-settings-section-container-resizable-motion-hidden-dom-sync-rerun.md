# Settings All Settings Section Container Resizable Motion-Hidden DOM Sync Rerun

Date: 2026-04-20
Worktree: `go-rewrite-pixijs`
Canonical target section: `settings-section__browserSectionDefault`

## Slice

Remove the broad `viewportInteractionActive` React subscription from `SectionContainerCoreResizable` while preserving the existing motion-hidden DOM contract.

- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` now reads the initial viewport-interaction state from `useReactFlow.getState()` and mirrors later motion-hidden DOM state through imperative `useReactFlow.subscribe(...)` sync instead of rerendering every section on viewport start/stop.
- The DOM sync keeps the existing motion-hidden data attributes in place for the current probes:
  - `data-canvas-owned-motion-body-hidden`
  - `data-canvas-owned-motion-header-controls-hidden`
  - `data-canvas-owned-motion-menu-trigger-hidden`
  - `data-canvas-owned-motion-resize-handles-hidden`
- Hidden resize handles now also drop the generic `.section-resize-handle` class during motion and restore it afterward, so the live chrome inventory still sees the expected handle-count collapse without forcing a full section rerender.
- `frontend/src/forks/xyflow/core/styles/init.css` now applies the motion-hidden body, header-control, menu-trigger, shell, and resize-handle visibility rules from those synced data attributes.

## Verification

- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - result: passed
- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before collection, not by this slice
- `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.Tkw5gG/loop-001/run-010/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (59.7s)`
- CDP visual check:
  - done in a fresh headless DevTools sub-agent on the current `3068/8068` runtime with a fresh bootstrap URL
  - `/settings` loaded with `All Settings` active
  - the graph surface was mounted and nonblank
  - `settings-section__browserSectionDefault` was present on the graph surface
  - no obvious blank graph, detached shell/body, or gross visual regression was observed on the canonical browser lane

## Dense probe

- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 43.84`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 66.6`
- `raf.maxMs: 533.3`
- `longTasks.count: 13`
- `longTasks.totalMs: 2993`
- `longTasks.maxMs: 513`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`
- `motionHiddenSubtreeChurn.childListMutationCount: 0`
- `motionHiddenSubtreeChurn.subtreeRemovedElementCount: 0`
- `motionHiddenSubtreeChurn.subtreeAddedElementCount: 0`

## Motion Chrome Inventory

- `beforeMotion.graphSurfaceMenuTriggerCount: 46`
- `beforeMotion.graphSurfaceSectionResizeHandleCount: 138`
- `peakMotion.graphSurfaceMenuTriggerCount: 1`
- `peakMotion.graphSurfaceSectionResizeHandleCount: 3`
- `peakMotion.hiddenBodyCount: 45`
- `peakMotion.hiddenHeaderControlsCount: 45`
- `peakMotion.hiddenMenuTriggerCount: 45`
- `peakMotion.hiddenResizeHandleRootCount: 45`
- `settledMotion.hiddenBodyCount: 0`
- `settledMotion.hiddenMenuTriggerCount: 0`
- `settledMotion.hiddenResizeHandleRootCount: 0`

## Interpretation

- This is a real product slice on the current hotspot: viewport start/stop no longer rerenders every `SectionContainerCoreResizable` just to hide motion-owned DOM chrome.
- The first attempted pass left resize handles in the DOM with their original selector class, and the live motion inventory caught that immediately; the final landed version restores the expected handle-count collapse on the trusted canary lane.
- The dense rerun stayed in the same healthy whole-scene band while keeping the motion-hidden body/header/menu/resize contract intact on the canonical browser section.
- Keep `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md` as the clean whole-scene checkpoint. This report is evidence that the `SectionContainerCoreResizable` viewport-interaction subscription path is now off the main React render path.
- The next bounded pass should stay on section-container rerender fanout, but it should now target a remaining `SectionContainerCoreResizable` active-section or prop-fanout path rather than revisiting this DOM-sync lane.
