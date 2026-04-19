# Settings All Settings Motion-Hidden Section Resize Handles Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-prompt-shell-ownership-rerun.md`
Focused motion probe: `frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Reduce one trace-backed shared renderer-main chrome family on the retained canvas path by suppressing top-level `re-resizable` section handles while an inactive section is already in the canvas-owned motion shell state.

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

## Implementation

- `frontend/src/components/Utils/Resizable/CustomResizable.tsx`
  - suppresses the shared top-level section resize handles when `motionCanvasOwnedShell` is active
  - marks that state on the section surface with `data-canvas-owned-motion-resize-handles-hidden="true"`
- `frontend/src/components/Utils/Resizable/CustomResizable.test.ts`
  - proves the pure enable/disable decision for that motion-hidden handle suppression
- `frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts`
  - now records section resize handle counts before motion, at peak motion, and after settle

## Fresh Dense Motion Rerun

Fresh live rerun on the current worktree runtime recorded:

- `documentNodeCount: 5496`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 43.14`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1150`
- `longTasks.count: 8`
- `longTasks.totalMs: 5989`
- `longTasks.maxMs: 3560`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-prompt-shell-ownership-rerun.md`:

- the dense scene stayed in the same improved runtime band
- `documentNodeCount` stayed flat at `5496`
- `raf.meanMs` stayed effectively flat (`43.0 -> 43.14`)
- `longTasks.totalMs` moved slightly down (`6013 -> 5989`)

## Motion Chrome Inventory

The focused motion inventory on the same runtime recorded:

- before motion:
  - `graphSurfaceSectionResizeHandleCount: 138`
  - `hiddenResizeHandleRootCount: 0`
- peak motion:
  - `graphSurfaceSectionResizeHandleCount: 3`
  - `hiddenResizeHandleRootCount: 45`
- after settle:
  - `graphSurfaceSectionResizeHandleCount: 138`
  - `hiddenResizeHandleRootCount: 0`

Canonical section proof at peak motion:

- `settings-section__browserSectionDefault`
  - `motionBodyHidden: true`
  - `motionHeaderControlsHidden: true`
  - `motionMenuTriggerHidden: true`
  - `motionResizeHandlesHidden: true`
  - `sectionResizeHandleCount: 0`
- `settings-section__promptSectionDefault`
  - `motionResizeHandlesHidden: true`
  - `sectionResizeHandleCount: 0`
- `settings-section__languageServer`
  - `motionResizeHandlesHidden: true`
  - `sectionResizeHandleCount: 0`

## Interpretation

- This is a bounded shared motion-chrome reduction on the active renderer-main lane, not a new dense-scene breakthrough.
- The direct product proof is that inactive settings sections no longer keep all top-level `re-resizable` handles mounted during viewport interaction; the live surface drops from `138` mounted section resize handles to `3` while motion is active and restores them after settle.
- The dense canary stayed in the same `43ms` / `~6.0s long-task total` band, so this slice is safe and directionally useful, but it does not close the broader `browserSectionDefault` JS/GC frontier by itself.

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Utils/Resizable/CustomResizable.tsx src/components/Utils/Resizable/CustomResizable.test.ts tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Utils/Resizable/CustomResizable.test.ts`
  - result: `8 passed`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-018/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.1m)`
- Chrome DevTools MCP:
  - verified in a fresh headless DevTools sub-agent on a fresh one-shot bootstrap URL from `./scripts/dev-runtime-info.sh`
  - `/settings` mounted with `All Settings` active
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` were present on the graph surface
  - no obvious blank or detached shell/body artifact was visible after the motion-time resize-handle suppression

## Follow-up

- Keep this section-resize-handle sub-lane closed after landing it; do not spend the next default pass on more top-level handle polish by inertia.
- The next default frontier should return to the broader renderer-main JS / GC lane on the named `settings-section__browserSectionDefault` surface or escalate to the stronger graph-surface step if no larger shared reducer is credible.
