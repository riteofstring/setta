# Settings All Settings Section Container Resizable Motion-Body Inline-Style Removal Rerun

Date: 2026-04-20
Worktree: `go-rewrite-pixijs`
Canonical target section: `settings-section__browserSectionDefault`

## Slice

Remove the last inline `display: none` hide path from `CanvasSectionBody` so the newer attribute-driven motion-hidden DOM sync can restore visibility without needing a React rerender.

- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` now relies entirely on the existing `data-canvas-owned-motion-body-hidden` attribute plus React Flow CSS for motion-time body hiding instead of also stamping an inline `display: none` style during the initial hidden render.
- This closes a concrete correctness gap in the post-run-046 shape: a section body that mounted hidden during viewport motion could otherwise keep the stale inline hide after the active-section DOM attrs restored, because the section no longer rerenders on that state change.
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx` now drops the old inline-style expectations from the static markup checks and adds a mounted regression that proves a hidden body can become active without rerendering and without retaining an inline hidden style.

## Verification

- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - result: passed
- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before collection, not by this slice
- `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.Tkw5gG/loop-001/run-014/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.0m)`
- CDP visual check:
  - result: passed in a fresh headless DevTools sub-agent on the same `3068/8068` runtime after consuming a fresh bootstrap URL
  - `/settings` loaded with the settings surface mounted and nonblank
  - `All Settings` was present in the view-mode tab bar
  - `settings-section__browserSectionDefault` was visible on the graph surface
  - no obvious detached shell/body or blank-graph regression was observed on the canonical lane

## Dense probe

- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 43.42`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 66.7`
- `raf.maxMs: 550`
- `longTasks.count: 16`
- `longTasks.totalMs: 3068`
- `longTasks.maxMs: 518`
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

- This is a bounded `SectionContainerCoreResizable` product fix, not another pure forwarding or memo-wrapper pass: it removes one stale-visibility failure mode introduced by the newer no-rerender active-section path.
- The trusted live motion probes stayed green on the canonical lane, so the attribute-only body hide contract is still compatible with the existing hidden-body, header-control, menu-trigger, and resize-handle inventories.
- This closes the motion-body inline-style restore sub-lane. The next pass should return to one bounded evidence slice on `SectionContainerCoreResizable` and its immediate children to decide whether any remaining local prop-fanout path is still credible; if not, stop for human replan instead of reopening more motion-body or DOM-sync micropolish.
