# Settings All Settings Section Container Resizable Active-Section DOM Sync Rerun

Date: 2026-04-20
Worktree: `go-rewrite-pixijs`
Canonical target section: `settings-section__browserSectionDefault`

## Slice

Remove the remaining active-section React render subscription from `SectionContainerCoreResizable` when only the motion-hidden DOM contract needs to update.

- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` now reads the current active-section state from `useActiveSectionUI.getState()` for render-time snapshots and mirrors later active-section changes through imperative store subscriptions inside the existing motion-hidden DOM sync effect.
- This keeps no-op active-section flips from rerendering `SectionContainerCoreResizable` itself when viewport motion is idle, while still restoring the hidden shell/body/header/menu/resize-handle DOM attrs immediately when the section becomes active during viewport motion.
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx` now mocks the active-section store as a real external store, counts `SectionContainerCoreResizable` renders, and proves both that no-op active-section flips stay cold and that active-section changes during viewport motion update the motion-hidden DOM attrs without rerendering the section render path.

## Verification

- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - result: passed
- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before collection, not by this slice
- `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.Tkw5gG/loop-001/run-013/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.0m)`
- CDP visual check:
  - result: passed in a fresh headless DevTools sub-agent on the same `3068/8068` runtime after consuming a fresh bootstrap URL
  - `/settings` loaded with `All Settings` visually active
  - the React Flow graph surface was mounted and visibly nonblank
  - `settings-section__browserSectionDefault` was present on the graph surface
  - no obvious detached shell/body or gross visual regression was observed on the canonical lane

## Dense probe

- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 42.71`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 83.4`
- `raf.maxMs: 500.1`
- `longTasks.count: 15`
- `longTasks.totalMs: 2994`
- `longTasks.maxMs: 529`
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

- This is a real `SectionContainerCoreResizable` product slice: the remaining active-section render subscription is now off the React path, and the motion-hidden DOM state still restores correctly when the section becomes active during viewport motion.
- The trusted live motion inventory stayed unchanged on the canonical lane, so this did not reopen the closed motion-hidden shell/body, menu, or resize-handle contracts.
- The dense rerun came back slightly better than the last two active-section boundary slices, but it still belongs in the same noisy whole-scene band; keep `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md` as the clean whole-scene checkpoint.
- The next pass should stay on `SectionContainerCoreResizable` only if one bounded evidence slice can still name another immediate local prop-fanout path beyond the removed viewport and active-section render subscriptions; otherwise stop for human replan instead of reopening the same lane.
