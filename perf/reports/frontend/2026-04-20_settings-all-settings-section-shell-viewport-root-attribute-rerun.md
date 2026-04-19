# Settings All Settings Section Shell Viewport Root Attribute Rerun

Date: 2026-04-20
Worktree: `go-rewrite-pixijs`
Canonical target section: `settings-section__browserSectionDefault`

## Slice

Remove one broad `viewportInteractionActive` rerender path from `SectionContainerCore`.

- `frontend/src/components/Section/Container/SectionContainerCore.tsx` no longer subscribes to React Flow viewport interaction state just to add the section-shell motion compositing hint.
- `frontend/src/forks/xyflow/core/container/useViewportTransformStyle.ts` now mirrors `viewportInteractionActive` onto the viewport root and graph-surface camera layer through imperative store subscriptions, alongside the existing transform sync.
- `frontend/src/forks/xyflow/core/styles/init.css` applies the compositor hint through `.react-flow__viewport[data-viewport-interaction-active="true"] .setta-viewport-interaction-shell`, so section shells keep the same motion styling without rerendering every `SectionContainerCore`.

## Verification

- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/useViewportTransformStyle.ts src/forks/xyflow/core/container/Viewport.tsx src/forks/xyflow/core/container/GraphSurfaceCameraLayer.tsx src/components/Section/Container/SectionContainerCore.tsx src/forks/xyflow/core/container/GraphSurface.test.tsx`
  - result: passed
- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/GraphSurface.test.tsx`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before collection, not by this slice
- `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.Tkw5gG/loop-001/run-009/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (41.3s)`
- CDP visual check:
  - done in a fresh headless DevTools sub-agent on the current `3068/8068` runtime with a fresh bootstrap URL
  - `/settings` mounted with `All Settings` active
  - the graph surface was mounted and nonblank
  - `settings-section__browserSectionDefault` was present on the graph surface
  - no notable visual problems were observed on this lane

## Dense probe

- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 45.38`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 749.9`
- `longTasks.count: 11`
- `longTasks.totalMs: 3565`
- `longTasks.maxMs: 767`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`
- `motionHiddenSubtreeChurn.childListMutationCount: 0`
- `motionHiddenSubtreeChurn.subtreeRemovedElementCount: 0`
- `motionHiddenSubtreeChurn.subtreeAddedElementCount: 0`

## Interpretation

- This is a real product slice on the current hotspot: one section-container-level viewport interaction subscription is now gone from the React render path.
- The live dense rerun stayed healthy on the canonical browser lane and did not introduce a new visual regression.
- Keep `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md` as the clean whole-scene checkpoint; this rerun is evidence that the `SectionContainerCore` subscription path is removed, not a reason to reopen broader backdrop work.
- The next bounded pass should stay on section-container rerender fanout, but it should now target `SectionContainerCoreResizable` or its active-section/motion-hidden prop churn instead of revisiting shell compositor hints or viewport-root attribute plumbing.
