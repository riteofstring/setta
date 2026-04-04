# Graph Substrate Rewrite Handoff

Last updated: 2026-04-02
Plan: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-plan.md`
Active history: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log.md`
History index: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log-index.md`
Completed summary: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-completed.md`

## Current status

- This is a fresh worktree from `main`.
- Ralph item `009` landed a bounded product fix for the multi-section canary layout source:
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.ts` now takes section positions and `zIndex` from the active view-mode layout instead of preferring stale `nodeInternals` positions
  - the same selector still preserves live measured widths and heights from `nodeInternals`, so drag/pan/zoom geometry stays current without letting old route state decide the canary layout
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.test.ts` now locks down that active-layout positions win over stale `nodeInternals` positions
  - `frontend/tests/e2e/settings/settings-view-modes.spec.ts` now includes a focused initial-layout guard proving the canary does not collapse all visible cards into a single screen x-column on first render in the seeded E2E workspace
  - the same E2E file now finds pan/zoom background points by probing the actual canary pane background, which keeps the drag/pan/title checks valid after the broader visible-section layout changed
- The old `main`-oracle startup blocker is stale:
  - `curl -I --max-time 5 http://127.0.0.1:3087/settings` now returns `200 OK`
  - `pnpm -C frontend cdp-port` still reports `9297` for the worktree, and `cd /Users/jeff/Documents/_projects/setta && pnpm -C frontend cdp-port` reports `9309` for `main`
- The remaining visual uncertainty is now a trust issue, not an app-health issue:
  - fresh bootstrap URLs from loop context had expired by the time the final CDP compare ran, so fresh-profile side-by-side bootstrap attempts were rejected
  - a worktree-only CDP probe against the live `http://127.0.0.1:3075/settings` session was still able to inspect the already-rendered canary and reported:
    - `graph-substrate-canary` present
    - `48` `graph-substrate-canary-section` nodes in the DOM
    - viewport transform `matrix(0.1, 0, 0, 0.1, 632.4, -51.7)`
    - multiple visible screen x-buckets for the first visible section headers (`shortcuts`, `gui`, `backend` around `x≈644`, `692`, `752`)
  - because the trustworthy authenticated `main` side of the compare was not re-established in the same pass, the Gate 1 oracle compare remains deferred rather than resolved
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
    - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary preserves the All Settings multi-column spread on first render'`
    - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary drags one section and persists the top-level layout'`
    - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary pans and zooms one section on the custom surface|settings graph substrate canary keeps title editing working after pan and zoom'`
    - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings view tabs filter sections and minimap'`
  - CDP visual check:
    - worktree-only probe: done
      - direct live `/settings` inspection confirmed the canary is rendering on the worktree session with multiple visible x-buckets, not a literal single-column DOM stack
    - side-by-side `main` oracle compare: deferred
      - fresh bootstrap tokens from loop context had expired
      - an attempted fallback to existing lifecycle tabs did not have a working DevTools bridge in that sub-agent session

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
  - the stale-position ownership fix is now landed for the canary selector and seeded E2E coverage
  - next restore a trustworthy authenticated Gate 1 oracle compare against `main` using either:
    - a working DevTools bridge to the already-open lifecycle tabs, or
    - freshly minted bootstrap tokens for both live sessions
  - use that compare to answer one concrete question before more code churn:
    - is the live worktree’s saved `All Settings` viewport at `zoom 0.1` a genuine canary drift versus `main`, or was the earlier fresh-profile compare misleading because it was no longer on the real authenticated surfaces?
  - only if that compare proves the `zoom 0.1` live viewport is the real Gate 1 blocker should the next product slice change the canary’s initial/shared viewport strategy

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

- Active history window: items `001` through `009`
- Latest item: `2026-04-02 009`
- Older history archives: none yet
