# Graph Substrate Rewrite Handoff

Last updated: 2026-04-02
Plan: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-plan.md`
Active history: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log.md`
History index: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log-index.md`
Completed summary: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-completed.md`

## Current status

- This is a fresh worktree from `main`.
- Ralph item `007` landed the first multi-section `All Settings` canary slice on the custom graph substrate:
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.ts` now returns all visible top-level canary sections instead of a single preferred section and carries each section's `positionAndSizeLocked` state into the canary render contract
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx` now renders the visible `All Settings` top-level section set on the custom surface, fits the initial viewport to the shared section bounds, and routes drag ownership to whichever section is actually grabbed instead of pinning a synthetic top-left section
  - the canary now observes per-section DOM sizes locally so the shared viewport fit uses the visible multi-section bounds without reintroducing `xyflow` ownership
  - updated `frontend/tests/e2e/settings/settings-view-modes.spec.ts` so the canary coverage proves more than one section is visible, a runtime-discovered draggable section can move without dragging a different visible section, and shared pan/zoom still moves multiple visible sections together
  - updated `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.test.ts` for the plural visible-section selector and lock-state contract
- Ralph item `006` landed the first representative DOM interaction/editing handoff proof on the `settings` graph-substrate canary:
  - `frontend/src/components/Section/Header/SectionTitle.tsx` now marks editable section titles as both `nodrag` and `setta-prevent-section-on-click-trigger`
  - this keeps the canary-local drag capture and parent section activation from swallowing title double-clicks on the checked `All Settings` slice
  - updated `frontend/tests/e2e/settings/settings-view-modes.spec.ts` with a focused canary proof that pans and zooms the custom surface, renames the visible section title through the DOM header editor, and restores the original section name afterward
- Ralph item `005` landed the first real custom pan/zoom ownership inside the `settings` graph-substrate canary:
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx` now owns background pan on the canary root instead of relying on legacy `xyflow` pane ownership
  - the same canary root now owns anchored wheel zoom for the checked `All Settings` slice
  - the canary mirrors viewport interaction state back into shared `useReactFlow` / `useMisc` flags during pan/zoom so DOM-backed section internals still see the expected interaction state
  - the canary viewport now exposes a stable `graph-substrate-canary-viewport` test target for transform checks
  - updated `frontend/tests/e2e/settings/settings-view-modes.spec.ts` with a focused canary pan/zoom proof on the custom surface
- Ralph item `004` landed the first real custom drag ownership inside the `settings` graph-substrate canary:
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx` now owns one top-level section drag locally on the canary surface
  - the canary pins its selected section while dragging so the visible card does not swap to a different top-left candidate mid-move
  - the section body/shell now move together through a canary-local position override and commit back through the existing top-level layout persistence path on release
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.ts` now prefers live `nodeInternals` geometry and can keep a preferred visible section selected during drag
  - `frontend/src/forks/xyflow/core/hooks/useViewportHelper.ts` now no-ops cleanly when custom-substrate routes have transform state but no legacy `d3Zoom` / `d3Selection`
  - added `frontend/src/forks/xyflow/core/hooks/useViewportHelper.test.ts` for the null-d3 guard
  - updated `frontend/tests/e2e/settings/settings-view-modes.spec.ts` so the canary drag test finds a valid draggable point, verifies drag state/motion, and restores layout + active view mode after itself
- Ralph item `003` landed the first real `settings` graph-substrate canary at the nearest meaningful composition boundary:
  - `frontend/src/components/Pages/Project/UiPage.tsx` now chooses between legacy `ReactFlow` and a new `settings`/`All Settings` canary path
  - added `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx`
  - added `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.ts`
  - the canary renders one DOM-backed top-level section through a custom viewport transform instead of `xyflow`
  - the canary syncs the shared `useReactFlow` zoom/transform state so existing section internals still read the right zoom on that slice
  - legacy `ReactFlow` still owns every other route/view mode
- Ralph item `002` remains the transform/math foundation underneath that canary:
  - `frontend/src/components/Pages/Project/graphSubstrate/viewportTransform.ts`
  - focused Vitest coverage for world/screen conversion, anchored zoom, and bounds fitting
  - existing `xyflow` point conversion, fit-to-bounds, and `setCenter` math routed through that helper
- The old `setta.pixijs-rewrite` branch is research only for this effort.
- Current priority is Gate 0 basic viability on a new custom graph substrate, not polishing the old shared-page-runtime path.
- The first-order product requirement is:
  - one normal-zoom `settings` section must stay visible, attached during pan/zoom/drag, interactive, and not obviously slower than the existing DOM path
- Current live verification state:
  - targeted Vitest passed for:
    - `src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.test.ts`
  - targeted Playwright passed for:
    - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings view tabs filter sections and minimap|settings graph substrate canary drags one section and persists the top-level layout|settings graph substrate canary pans and zooms one section on the custom surface|settings graph substrate canary keeps title editing working after pan and zoom'`
  - CDP visual check passed on the current worktree session for the static normal-zoom canary field:
    - `http://127.0.0.1:3075/settings`
    - `All Settings` active and `graph-substrate-canary` visible
    - more than one top-level section visible on the custom surface
    - no gross blank-card or detached-body issue in the normal visible field
  - `main` reference comparison did not run this iteration:
    - `http://127.0.0.1:3087/settings` returned `ERR_CONNECTION_REFUSED`
    - `run-006/main-ai.log` shows the read-only `main` reference app died during startup on a settings-project validation error, so side-by-side oracle comparison was unavailable in this pass

## Architectural stance

- Do not continue the old `xyflow` + shared-page-runtime + DOM-measured shell sync model.
- Replace the graph substrate first.
- Keep DOM section bodies/editors initially.
- Make camera/world coordinates authoritative outside `xyflow`.
- Add Pixi ownership only after the substrate itself is proven.

## Immediate next frontier

- The `UIPage` seam-lift lane is complete:
  - `UIPage` is now the first real implementation selector between legacy `xyflow` and the new custom substrate canary
  - do not spend another iteration pushing this seam through more pure-forwarding layers
- The next production frontier is inside the new canary itself:
  - one normal-zoom section on `All Settings`
  - existing DOM body
  - custom drag/pan/zoom ownership plus one representative DOM edit handoff are now in place for the checked slice
- The next real frontier is no longer seam lifting or single-control handoff proof:
  - the canary now renders the visible top-level `All Settings` section set on the custom surface instead of a single representative section
  - keep DOM-backed section bodies/editors attached and interactive while that broader visible set is exercised
  - treat any new detached-body, wrong-surface, obvious perf regression, or newly visible drag ownership bug during the multi-section canary path as the next blocker
- Required order from here:
  - keep the current custom viewport state model and `UIPage` seam
  - drag and custom pan/zoom ownership are now in place on the canary surface
  - a representative DOM-backed interaction/editing path is now proven on the same slice after pan/zoom
  - the multi-section canary expansion is now in place on `All Settings`
  - next use a healthy `main` oracle session to do the staged Gate 1 gross-drift compare on that multi-section surface before spending time on pixel-parity cleanup or harness polish

## Explicit deferrals

- no tiny-card or low-zoom appearance work
- no Pixi body rendering first
- no `pixiui` adoption first
- no harness-only slices unless they directly unblock the current custom-substrate slice

## Durable completed work

- This worktree now contains:
  - loop/bootstrap setup plus the fresh rewrite plan set
  - the first pure graph-substrate viewport transform helper module
  - existing `xyflow` point/fit/center callsites routed through that helper
  - a `settings`/`All Settings` `UIPage` canary seam that swaps out `ReactFlow`
  - a first custom graph-surface canary that renders one DOM-backed top-level section through the shared transform contract
  - the first custom canary drag ownership slice plus a null-safe shared viewport helper path for non-`xyflow` routes
  - a first proven DOM-backed title edit path on that same canary after custom pan/zoom ownership
- See `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-completed.md` for maintained milestones once product slices start landing.

## History pointers

- Active history window: items `001` through `007`
- Latest item: `2026-04-02 007`
- Older history archives: none yet
