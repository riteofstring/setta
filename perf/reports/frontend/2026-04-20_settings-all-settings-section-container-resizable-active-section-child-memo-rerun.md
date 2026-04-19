# Settings All Settings Section Container Resizable Active-Section Child Memo Rerun

Date: 2026-04-20
Worktree: `go-rewrite-pixijs`
Canonical target section: `settings-section__browserSectionDefault`

## Slice

Reduce `SectionContainerCoreResizable` child rerender fanout when active-section changes do not change the motion-hidden result.

- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` now wraps `SectionContainerChrome` and `CanvasSectionBody` in `React.memo(...)` before the resizable render path uses them.
- This keeps the section header chrome and heavy area body from rerendering when `SectionContainerCoreResizable` itself rerenders for an active-section change whose derived child props are still identical, such as inactive -> active while viewport motion is not hiding the section.
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx` now counts browser-area and section-header renders and proves that an active-section flip with unchanged motion-hidden props does not rerender either child subtree.

## Verification

- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - result: passed
- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before collection, not by this slice
- `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.Tkw5gG/loop-001/run-011/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.1m)`
- CDP visual check:
  - done in a fresh headless DevTools sub-agent on the current `3068/8068` runtime with a fresh bootstrap URL
  - `/settings` rendered with `All Settings` active and chat minimized
  - the graph surface was mounted and nonblank
  - `settings-section__browserSectionDefault` was visible on the graph surface
  - no obvious detached shell/body or gross visual regression was observed on the canonical browser lane

## Dense probe

- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 45.8`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 949.9`
- `longTasks.count: 12`
- `longTasks.totalMs: 3256`
- `longTasks.maxMs: 584`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 118 / 120`
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

- This is a bounded product slice on the current section-container frontier: active-section churn no longer needs to cascade into the browser/header child subtrees when their motion-hidden inputs did not actually change.
- The trusted live motion inventory stayed identical on the canonical lane, so this did not reopen the closed motion-hidden DOM-sync contract.
- The dense rerun remains in the same general whole-scene band, with long-task totals still below the older clean checkpoint's `5844`, but this is not yet a cleaner replacement checkpoint than `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`.
- The next pass should stay on `SectionContainerCoreResizable`, but it should target another remaining local child prop-fanout or active-section-owned path rather than revisiting the viewport DOM-sync lane.
