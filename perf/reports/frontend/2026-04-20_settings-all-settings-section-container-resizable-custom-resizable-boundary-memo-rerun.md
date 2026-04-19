# Settings All Settings Section Container Resizable CustomResizable Boundary Memo Rerun

Date: 2026-04-20
Worktree: `go-rewrite-pixijs`
Canonical target section: `settings-section__browserSectionDefault`

## Slice

Reduce `SectionContainerCoreResizable` active-section rerender fanout at the `CustomResizable` boundary when the derived motion-hidden shell/body state does not change.

- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` now wraps the `CustomResizable` handoff in a memoized local surface component and memoizes the combined chrome/body child subtree that it passes down.
- This keeps no-op active-section flips from re-entering the `CustomResizable` size / handle / layout hook stack when the shell/body inputs are still identical.
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx` now counts `CustomResizable` renders in addition to the existing header/body counters and proves the same active-section flip stays cold across the full resizable boundary.

## Verification

- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - result: passed
- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before collection, not by this slice
- `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.Tkw5gG/loop-001/run-012/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.1m)`
- CDP visual check:
  - result: passed in a fresh headless DevTools sub-agent on the same `3068/8068` runtime after a fresh bootstrap token refresh
  - `/settings` rendered with `All Settings` active and chat chrome normalized away
  - the graph surface was mounted and visibly nonblank
  - `settings-section__browserSectionDefault` was present on the graph surface
  - no obvious detached shell/body or gross visual regression was observed on the canonical lane

## Dense probe

- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 45.8`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 966.6`
- `longTasks.count: 13`
- `longTasks.totalMs: 3220`
- `longTasks.maxMs: 530`
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

- This is a real `SectionContainerCoreResizable` product slice: after the earlier chrome/body memo, the remaining no-op active-section rerender no longer re-enters the `CustomResizable` boundary either.
- The trusted live motion inventory stayed unchanged on the canonical lane, so this slice did not reopen the closed motion-hidden shell/body or resize-handle contracts.
- The dense rerun stays in the same whole-scene band. Treat this report as local hotspot evidence, not as a replacement for `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`.
- The next pass should stay on `SectionContainerCoreResizable`, but it now needs a different remaining local prop-fanout path beyond the stabilized resizable boundary rather than another child-memo or DOM-sync rerun.
