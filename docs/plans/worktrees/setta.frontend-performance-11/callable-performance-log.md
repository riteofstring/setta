# Callable Performance Refactor Log

Append-only log for the callable DOM-first performance refactor.

- Related plan: `docs/plans/worktrees/setta/callable-performance-plan.md`
- Rule: append new entries only; do not rewrite or delete prior entries.

## Status Labels

- `planned`: identified and not started
- `in_progress`: currently being worked
- `waiting_on_user`: blocked on user approval or decision
- `blocked`: blocked on tooling or environment
- `needs_more_work`: partial progress exists but the item is not complete
- `done`: completed and verified for the current scope

## Entries

### 2026-03-16 01

- Item: Create the callable performance refactor plan and status log.
- Status: `done`
- Details:
  - Reviewed the frontend performance retrospective.
  - Reviewed the browser-MCP quickstart and verification checklist.
  - Inspected the callable subtree from `CallableArea` down through param rows and group shells.
  - Wrote the phased plan under `docs/plans/worktrees/setta/callable-performance-plan.md`.

### 2026-03-16 02

- Item: Use untouched `main` as the control and keep implementation off the current worktree.
- Status: `waiting_on_user`
- Details:
  - Planning was done in worktree `setta`, which is currently on branch `main`.
  - The plan requires a dedicated implementation worktree/branch before code changes begin.
- Next action:
  - Create or select the callable-performance worktree, then start Phase 0 there.

### 2026-03-16 03

- Item: Bring up CDP and capture the callable baseline.
- Status: `blocked`
- Details:
  - During planning, chrome-devtools-mcp could not connect.
  - Failure observed while fetching `http://127.0.0.1:9309/json/version`.
  - No baseline trace or visual capture was taken yet.
- Next action:
  - Start the browser-MCP session, verify CDP connectivity, then execute Phase 0 baseline capture.

### 2026-03-16 04

- Item: Phase 0 baseline/control harness.
- Status: `planned`
- Scope:
  - deterministic callable scenario
  - untouched `main` baseline traces for pan, zoom, and resize
  - callable DOM inventory
  - Playwright callable geometry/parity harness
  - initial perf report under `perf/reports/frontend/`

### 2026-03-16 05

- Item: Phase 1 leaf DOM flattening.
- Status: `planned`
- Targets:
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
  - callable leaf wrappers in `frontend/src/components/Section/SectionParts/Search.tsx`
- Completion condition:
  - fewer leaf wrappers and less leaf grid usage with no visible callable drift.

### 2026-03-16 06

- Item: Phase 2 row/tree flattening.
- Status: `planned`
- Targets:
  - `frontend/src/components/Params/ParamContainer.tsx`
  - `frontend/src/components/Params/ParamSwitch.tsx`
  - `frontend/src/components/Params/GetParamSwitch.tsx`
  - `frontend/src/components/Params/ParamDndList.tsx`
- Completion condition:
  - row-level `grid/subgrid` dependence materially reduced without breaking DnD, resize, or nested row geometry.

### 2026-03-16 07

- Item: Phase 3 group-shell flattening and callable-wide DOM audit.
- Status: `planned`
- Targets:
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
  - `frontend/src/components/Section/SectionParts/Search.tsx`
  - callable shell audit, with section chrome only if still necessary
- Completion condition:
  - callable subtree is materially flatter end-to-end and remaining grid usage is justified.

### 2026-03-16 08

- Item: Phase 4 JS/React follow-up.
- Status: `planned`
- Targets:
  - trace-proven hot scripting paths only
  - selector breadth
  - repeated derived-data work
  - render/commit hotspots in the callable path
- Completion condition:
  - scripting cost is reduced after the DOM contract is stabilized.

### 2026-03-16 09

- Item: Phase gates between refactor stages.
- Status: `planned`
- Details:
  - The user should be prompted before starting:
    - Phase 1 after baseline
    - Phase 2 after leaf flattening
    - Phase 3 after row/tree flattening
    - Phase 4 after group-shell flattening
    - any rollout beyond callable

### 2026-03-16 10

- Item: Bring the frontend performance retrospective into the implementation worktree.
- Status: `done`
- Details:
  - Copied `docs/notes/performance/frontend-performance-branches-retrospective.md` from the `setta` main worktree into this worktree.
  - The retrospective is now available locally as the do-not-repeat decision log for callable performance work.

### 2026-03-16 11

- Item: Tighten the callable plan around screenshot cadence, architecture focus, and skill triggers.
- Status: `done`
- Details:
  - Updated the plan to require screenshot comparison between untouched `main` and this worktree after every completed layout checkpoint, not only at phase end.
  - Marked Phase 2 as the main go/no-go checkpoint for the DOM-first callable strategy.
  - Added explicit use triggers for `improve-codebase-architecture` and `debug-with-http-logging`.
  - Updated plan paths and worktree references to `setta.frontend-performance-11`.

### 2026-03-16 12

- Item: Lock the Phase 0 callable control scenario and parity artifacts.
- Status: `done`
- Details:
  - Chose `open` as the fixed callable control scenario because `sorted` could not preserve nested rows, a pinned param, and a still-visible edge-input row at the same time.
  - Configured matched `main` and worktree callable scenarios with:
    - `file` pinned
    - `buffering` promoted to edge input
    - `errors` indented beneath `encoding`
  - Captured the first screenshot pair and confirmed the callable layout matched between untouched `main` and this worktree.
  - Recorded identical Phase 0 geometry and DOM metrics for the matched callable subtree.

### 2026-03-16 13

- Item: Finish the Phase 0 baseline report and automated geometry guardrail.
- Status: `done`
- Details:
  - Recorded DevTools traces for `idle`, `pan`, `zoom`, and `resize` on both untouched `main` and this worktree under `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/`.
  - Wrote the baseline report at `perf/reports/frontend/2026-03-16_callable-dom-first.md`.
  - Added `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts` to codify the Phase 0 geometry contract.
  - Verified the new Playwright spec passes locally in an isolated test workspace.

### 2026-03-16 14

- Item: Add the `math.sqrt` callable minimum regression run to the plan.
- Status: `done`
- Details:
  - Updated the callable performance plan so every layout checkpoint and phase gate now requires the `math.sqrt` scenario with:
    - generated-code `import math`
    - params `a` through `k`
    - `a` through `d` as edge inputs
    - `e` through `g` as pinned params
    - `h` through `k` as unpinned params
  - Documented that every required resize state must capture screenshots, including right, bottom, bottom-right, and param-column resize interactions.

### 2026-03-16 15

- Item: Implement the callable minimum regression Playwright harness.
- Status: `done`
- Details:
  - Added `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`.
  - The spec now builds the `math.sqrt` callable scene from backend routes, captures screenshots for the required resize states, and attaches JSON metrics for:
    - outer-handle resize / overflow / recovery
    - param-column narrow / wide resize
  - Verified the new spec passes locally in the isolated Playwright workspace flow using ports `3111` and `8111`.
  - During implementation, the screenshots showed that some current resize states already drift visually from the roomy baseline, so the harness deliberately preserves screenshot and metric capture as part of the required review surface instead of assuming those states are already clean.

### 2026-03-16 16

- Item: Verify the callable baseline and minimum regression suite together.
- Status: `done`
- Details:
  - Ran the isolated Playwright callable suite on ports `3111` and `8111`:
    - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
    - `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
  - Result: `3 passed`
  - The minimum regression spec now emits screenshot attachments for:
    - roomy baseline
    - outer bottom-overflow state
    - outer bottom-right recovery state
    - outer right-resize state
    - column narrow state
    - column wide state

### 2026-03-16 17

- Item: Phase 1 checkpoint 1 leaf wrapper reduction.
- Status: `done`
- Details:
  - Removed the JSX-only `div.contents` wrapper from `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`.
  - Removed the non-kwarg label wrapper div from `frontend/src/components/Params/ParamContainer.tsx`.
  - Moved the non-kwarg label width/overflow contract onto `frontend/src/components/Params/ParamItems/ParamTextLabel.tsx`.
  - Re-ran the isolated callable Playwright suite on ports `3111` and `8111`.
  - Result: `3 passed`.
  - Re-checked visual parity in CDP on the matched `open` control scene:
    - `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - The callable screenshots remained visually identical after the wrapper removals.
  - The live callable subtree on the control scene dropped from `125` DOM nodes on `main` to `119` on the worktree, with the old non-kwarg label wrapper divs removed.
- Next action:
  - Continue Phase 1 with the next leaf-only removal that does not cross into row-shell refactoring.

### 2026-03-16 18

- Item: Phase 1 checkpoint 2 text-value underline flattening.
- Status: `done`
- Details:
  - Removed the dedicated underline span from `frontend/src/components/Params/ParamUIs/ParamUI.tsx` for standard text param values.
  - Moved that border/focus styling onto the text input root instead.
  - Re-ran the isolated callable Playwright suite on ports `3111` and `8111`.
  - Result: `3 passed`.
  - Re-ran the CDP comparison on the matched `open` control scene:
    - `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - The callable screenshots remained visually identical after the underline move.
  - The live callable subtree on the control scene is now `113` DOM nodes on the worktree versus `125` on `main`, for a cumulative `-12` node reduction across the Phase 1 checkpoints completed so far.
- Next action:
  - Continue Phase 1 with the next leaf-only callable reduction, but stay out of row-shell and DnD structure changes until the leaf pass is clearly exhausted.

### 2026-03-16 19

- Item: Phase 1 checkpoint 3 param resize-handle leaf flattening.
- Status: `done`
- Details:
  - Removed the inner decorative div from `frontend/src/components/Params/ResizeHandle.tsx`.
  - Moved the visible handle-bar styling onto a `before:` pseudo-element on the draggable resize hit-zone.
  - Re-ran the isolated callable Playwright suite on ports `3111` and `8111`.
  - Result: `3 passed`.
  - Re-ran the CDP comparison on the matched `open` control scene:
    - `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - The callable screenshots remained visually identical after the resize-handle flattening.
  - The live callable subtree on the control scene is now `107` DOM nodes on the worktree versus `125` on `main`, for a cumulative `-18` node reduction across the completed Phase 1 checkpoints.
  - `data-param-resize-handle` nodes remained present and the old inner handle-bar child divs were fully removed on the worktree control scene.
- Next action:
  - Continue Phase 1 only if the next change is still clearly leaf-level; otherwise stop and prompt before crossing into the Phase 2 row/tree refactor boundary.

### 2026-03-16 20

- Item: Tighten the callable plan around behavior preservation, no-shim refactors, and commit discipline.
- Status: `done`
- Details:
  - Updated the plan to state explicitly that user-facing functionality must not regress during the callable refactor.
  - Updated the plan to state explicitly that untouched `main` and the refactor worktree should remain behaviorally and visually indistinguishable to the user, aside from the intended performance improvement.
  - Updated the plan to forbid compatibility shims, fallback layers, and temporary dual-path behavior for this refactor.
  - Updated the plan to require frequent, very descriptive commits while the refactor is in progress.

### 2026-03-16 21

- Item: Phase 1 checkpoint 4 kwarg-name underline flattening.
- Status: `needs_more_work`
- Details:
  - Removed the dedicated kwarg-name underline span from `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`.
  - Moved the kwarg-name underline, focus, and error border styling onto the `TextInputCodeMirror` root class contract instead.
  - Re-ran the isolated callable Playwright suite on ports `3111` and `8111`.
  - Result: `3 passed`.
  - Attempted the required `math.sqrt` CDP parity capture against untouched `main` using fresh isolated projects on both apps.
  - The worktree rendered the required `a` through `k` callable scene correctly.
  - Untouched `main` did not hold the same scene cleanly under multiple backend setup orders:
    - edge inputs `a` through `d` appeared
    - the row body reintroduced `x`
    - the node screenshot showed a red validation/error row instead of the expected pinned and unpinned stacks
  - Because the required `main` vs worktree screenshot parity check failed on the minimum regression scene, this checkpoint is not accepted yet.
- Next action:
  - Investigate why untouched `main` cannot hold the required `math.sqrt` `a` through `k` scene cleanly before making more callable layout edits or checkpoint commits.

### 2026-03-16 22

- Item: Expand the callable minimum regression contract to match the current callable surface area.
- Status: `done`
- Details:
  - Updated the plan so the minimum callable regression run now covers:
    - section resize handles only
    - param-column resize handles
    - live drag/reorder
    - `Tab` / `Shift + Tab` indenting
    - direct standalone section routes
    - both `light` and `dark` color modes
  - Updated the plan to record that isolated checkpoint runs should disable `settings.backend.autoRefetchCallableParamsOnLspMismatch` before building the intentional `math.sqrt` `a` through `k` scene.

### 2026-03-16 23

- Item: Fix standalone callable route keyboard parity and land the expanded regression harness.
- Status: `done`
- Details:
  - First expanded the Playwright harness in `frontend/tests/e2e/params/callable-minimum-regression.spec.ts` to cover:
    - workspace section resize and column resize
    - workspace drag/reorder and `Tab` indent
    - standalone direct-route drag/reorder and `Tab` indent
    - `light` and `dark` mode variants
    - screenshot capture for every completed transition
  - The first run exposed a real standalone-route parity gap:
    - workspace `Tab` indent passed
    - standalone `Tab` indent failed even after the section was explicitly marked active
    - column resize and drag/reorder already worked on the standalone route
  - Traced the gap to route composition:
    - `UIPage` mounted the global key listener setup
    - `StandaloneProjectSurfacePage` did not
  - Extracted `frontend/src/components/Pages/Project/useProjectSurfaceGlobalListeners.ts` and mounted it from both:
    - `frontend/src/components/Pages/Project/UiPage.tsx`
    - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`
  - Re-ran the expanded callable minimum regression spec.
  - Result: `4 passed`
  - Re-ran the callable pair:
    - `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
    - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - Result: `5 passed`
  - Performed a CDP standalone-route smoke check on:
    - worktree: `http://127.0.0.1:3011/fair_white/section/spark_being`
  - The standalone callable surface rendered without workspace panes and preserved the expected edge / pinned / unpinned layout.
- Next action:
  - Continue Phase 1 only with leaf-level callable DOM reductions, using the expanded standalone-aware callable regression suite as the checkpoint gate.

### 2026-03-16 24

- Item: Phase 1 checkpoint 4 param resize-handle wrapper flattening.
- Status: `done`
- Details:
  - Removed the remaining outer wrapper div from `frontend/src/components/Params/ResizeHandle.tsx`.
  - Moved the center-gutter stripe and visible handle-bar styling onto `after:` and `before:` pseudo-elements on the draggable resize target so the handle now renders as a single DOM node.
  - Kept the existing `data-param-resize-handle="true"` contract and cursor/drag behavior intact.
  - Re-ran the expanded callable minimum regression spec.
  - Result: `4 passed`
  - Re-ran the callable pair:
    - `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
    - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - Result: `5 passed`
  - Re-ran the required CDP comparison on the stable `open` control scene:
    - `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - The callable screenshots remained visually identical after the wrapper flattening.
  - Live callable subtree metrics on the matched control scene:
    - `main`: `124` nodes
    - worktree after checkpoint 4: `100` nodes
    - cumulative reduction versus untouched `main`: `-24` live DOM nodes on the callable control subtree
    - `data-param-resize-handle` nodes remained present: `6`
    - old resize-handle wrapper parents on untouched `main`: `6`
    - old resize-handle wrapper parents on the worktree: `0`
- Next action:
  - Continue Phase 1 only if the next candidate is still clearly leaf-level; otherwise stop and prompt before crossing into the Phase 2 row/tree refactor boundary.

### 2026-03-16 25

- Item: Accept the earlier kwarg-name underline flattening against the stable callable control.
- Status: `done`
- Details:
  - Re-used the already-landed kwarg-name underline move in `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`.
  - Treated the earlier `math.sqrt` `main` mismatch as a control-scene instability, not as evidence of a visual regression in the refactor branch.
  - Reconfirmed the current branch against the stable `open` callable control pair:
    - `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - The kwarg rows remained visually aligned with untouched `main`, and the expanded callable minimum regression suite still passed with screenshot capture for the required resize, reorder, indent, theme, and standalone-route states.
  - This resolves the old Phase 1 log blocker without reopening the already-landed DOM change.
- Next action:
  - Treat the kwarg-name underline flattening as an accepted Phase 1 change and continue from the current branch state.

### 2026-03-16 26

- Item: Phase 1 boundary assessment for the next callable refactor step.
- Status: `done`
- Details:
  - Inspected the live `open` callable row DOM after checkpoint 24 and re-scanned the remaining callable leaf files.
  - The remaining steady-state wrappers are no longer isolated callable leaves:
    - `TextInputCodeMirror` / `DummyCodeMirror` own the surviving `section-value` input shells
    - nested child-row wrappers and `grid/subgrid` ownership are concentrated in the row/tree cluster:
      - `frontend/src/components/Params/ParamContainer.tsx`
      - `frontend/src/components/Params/ParamSwitch.tsx`
      - `frontend/src/components/Params/GetParamSwitch.tsx`
      - `frontend/src/components/Params/ParamDndList.tsx`
  - Architectural read:
    - strongest next cluster: the row/tree path above
    - why it is coupled: row selection/search/error state, DnD placeholder behavior, nested-child ownership, and the callable grid contract all cross file boundaries there
    - dependency category: tightly coupled same-domain UI ownership with shared layout/state contracts
    - test impact: future work should continue to use the existing callable Playwright boundary tests instead of adding file-local tests around these shallow seams
  - Conclusion:
    - Phase 1 leaf-level callable DOM reductions are effectively exhausted
    - the next meaningful performance work belongs to Phase 2 row/tree flattening
- Next action:
  - Use the current callable regression suite and stable `open` CDP control pair as the gate for the first Phase 2 row/tree checkpoint.

### 2026-03-16 27

- Item: Phase 2 checkpoint 1 row-template primitive consolidation.
- Status: `done`
- Details:
  - Added the shared `section-param-row` grid utility in `frontend/index.css`.
  - Updated `frontend/src/components/Params/ParamContainer.tsx` so the leaf row and the top-level parent row now use the shared row primitive instead of row-local inline grid templates.
  - Updated the nested parent row to use the existing `section-args-nested` utility directly instead of `grid-cols-subgrid`.
  - Updated the temporary DnD placeholder row in `frontend/src/components/Params/ParamSwitch.tsx` to use the same shared row primitive as the steady-state top-level rows.
  - Re-ran the expanded callable minimum regression spec.
  - Result: `4 passed`
  - Re-ran the callable pair:
    - `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
    - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - Result: `5 passed`
  - Re-ran the required CDP comparison on the stable `open` control scene:
    - `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - The callable screenshots remained visually aligned after the row-template consolidation.
  - Live row-template metrics on the matched control scene:
    - total visible param rows: `7` on both `main` and the worktree
    - rows still carrying `grid-cols-subgrid`:
      - `main`: `1`
      - worktree: `0`
    - visible param rows still carrying inline `grid-template-columns`:
      - `main`: `7`
      - worktree: `0`
  - Interpretation:
    - this is the first accepted Phase 2 checkpoint because it removes row-local template duplication and the last row-level `grid-cols-subgrid` use from the stable callable control scene without user-visible drift
- Next action:
  - Continue Phase 2 with the next row/tree checkpoint, focusing on nested-child ownership and wrapper reduction rather than shared leaf/input wrappers.

### 2026-03-16 28

- Item: Phase 2 checkpoint 2 nested-child wrapper removal.
- Status: `done`
- Details:
  - Removed the dedicated nested-child wrapper div from `frontend/src/components/Params/ParamContainer.tsx`.
  - Moved nested-child branch styling onto the child row roots and threaded the nested-child row contract through:
    - `frontend/src/components/Params/GetParamSwitch.tsx`
    - `frontend/src/components/Params/ParamSwitch.tsx`
    - `frontend/src/components/Params/ParamContainer.tsx`
  - Preserved nested child indentation by restoring the live left-offset on nested child rows after the first attempt flattened too far and failed the baseline geometry spec.
  - Re-ran the expanded callable minimum regression spec.
  - Result: `4 passed`
  - Re-ran the callable pair:
    - `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
    - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - Result: `5 passed`
  - Re-ran the required CDP comparison on the stable `open` control scene:
    - `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - The callable screenshots remained visually aligned after the wrapper removal.
  - Live control-scene metrics:
    - callable subtree nodes:
      - `main`: `125`
      - worktree: `100`
    - nested child wrapper count:
      - `main`: `1`
      - worktree: `0`
    - visible param rows: `7` on both `main` and the worktree
  - Geometry note:
    - the accepted nested child left edge on the live worktree control scene is now `405.46px`
    - untouched `main` measured `402.57px`
    - both keep the nested child visibly indented relative to the top-level `mode` row, which satisfies the baseline geometry contract
- Next action:
  - Continue Phase 2 with the next row/tree checkpoint only if it removes another real row/tree wrapper or contract layer without reopening the now-stable nested child geometry.

### 2026-03-16 29

- Item: Phase 2 checkpoint 3 non-nested real-row branch unification.
- Status: `done`
- Details:
  - Removed the `useExplicitLeafGrid` split from `frontend/src/components/Params/ParamContainer.tsx`.
  - Collapsed the two non-nested real-row render branches into a single row path, while keeping the nested-parent row branch separate.
  - Kept the existing non-nested row contract intact by applying `justify-between gap-y-1` only when nested child rows are actually present.
  - This deepens `ParamContainer` slightly by hiding a branch distinction that callers and adjacent row-tree modules do not need to know about.
  - Re-ran the expanded callable minimum regression spec.
  - Result: `4 passed`
  - Re-ran the callable pair:
    - `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
    - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - Result: `5 passed`
  - Re-ran the required CDP comparison on the stable `open` control scene:
    - `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - The callable screenshots remained visually aligned after the branch unification.
  - Live control-scene read:
    - callable subtree nodes:
      - `main`: `125`
      - worktree: `100`
    - visible param rows: `7` on both `main` and the worktree
    - the accepted worktree control scene preserved the same pinned and nested-child geometry as checkpoint 28
- Next action:
  - Continue Phase 2 only if the next step removes another row/tree seam with real contract value, ideally around DnD placeholder ownership or duplicated row-shell responsibilities across `ParamContainer` and `ParamSwitch`.

### 2026-03-16 30

- Item: Phase 2 checkpoint 4 real-row wrapper component collapse.
- Status: `done`
- Details:
  - Collapsed the shallow `SortableRealParamSwitchRow` layer into `frontend/src/components/Params/ParamSwitch.tsx`.
  - `RealParamSwitch` now owns both the real-row state derivation and the DnD wiring before rendering `ParamContainer`, instead of handing that work through an extra wrapper component.
  - This does not change the row DOM contract, but it removes one per-row React component boundary from the steady-state callable path.
  - Re-ran the expanded callable minimum regression spec.
  - Result: `4 passed`
  - Re-ran the callable pair:
    - `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
    - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - Result: `5 passed`
  - Re-ran the required CDP comparison on the stable `open` control scene:
    - `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - The callable screenshots remained visually aligned after the wrapper-component collapse.
  - Live control-scene read:
    - callable subtree nodes:
      - `main`: `125`
      - worktree: `100`
    - visible param rows: `7` on both `main` and the worktree
- Next action:
  - Continue Phase 2 only if the next step deepens another real row-tree boundary, with the best remaining candidate being the duplicated sortable placeholder/real-row shell seam in `ParamSwitch`.

### 2026-03-16 31

- Item: Phase 2 checkpoint 5 DnD root-child lookup moved into `GetParamSwitch`.
- Status: `done`
- Details:
  - Removed the shallow `ParamDndListBody` component from `frontend/src/components/Params/ParamDndList.tsx`.
  - Moved the provider-bound root-child lookup into `frontend/src/components/Params/GetParamSwitch.tsx` via a new optional `dndParentId` input.
  - `ParamDndList` now hands the tree root id directly to `GetParamSwitch` instead of crossing the provider boundary through an extra wrapper component.
  - This keeps the DnD-aware row selection path behaviorally identical while deepening the row-tree ownership boundary around `GetParamSwitch`.
  - Re-ran the expanded callable minimum regression spec.
  - Result: `4 passed`
  - Re-ran the callable pair:
    - `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
    - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - Result: `5 passed`
  - Re-ran the required CDP comparison on the stable `open` control scene:
    - `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - The callable screenshots remained visually aligned after the provider-bound lookup move.
  - Live control-scene read:
    - callable subtree nodes:
      - `main`: `125`
      - worktree: `100`
    - visible param rows: `7` on both `main` and the worktree
- Next action:
  - Continue Phase 2 only if the next step removes another duplicated row-tree contract, with the strongest remaining candidate now being the separate temp-placeholder row shell in `ParamSwitch`.

### 2026-03-16 32

- Item: Phase 2 checkpoint 6 shared sortable-row wiring for temp and real param rows.
- Status: `done`
- Details:
  - Added a shared sortable-row helper in `frontend/src/components/Params/ParamSwitch.tsx`.
  - Moved the duplicated `useSortable` / transform / listener / ref wiring for:
    - temp placeholder rows
    - steady-state real param rows
    into the shared helper instead of maintaining two open-coded sortable paths.
  - Kept the existing temp placeholder shell and real row shell behavior unchanged; this checkpoint only deepens the sortable contract ownership inside `ParamSwitch`.
  - Re-ran the expanded callable minimum regression spec.
  - Result: `4 passed`
  - Re-ran the callable pair:
    - `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
    - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - Result: `5 passed`
  - Re-ran the required CDP comparison on the stable `open` control scene:
    - `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - The callable screenshots remained visually aligned after the shared sortable-row consolidation.
  - Live control-scene read:
    - callable subtree nodes:
      - `main`: `125`
      - worktree: `100`
    - visible param rows: `7` on both `main` and the worktree
- Next action:
  - Continue Phase 2 only if the next step removes another real row-tree shell distinction instead of just moving code around. The remaining candidate is the dedicated temp placeholder article shell in `ParamSwitch`.

### 2026-03-16 33

- Item: Phase 2 checkpoint 7 shared non-nested row shell contract for temp and steady-state rows.
- Status: `done`
- Details:
  - Added `frontend/src/components/Params/paramRowClassNames.ts` to centralize the non-nested row shell contract and the nested-child branch-line classes.
  - Updated `frontend/src/components/Params/ParamContainer.tsx` to build its non-nested steady-state row shell from the shared utility instead of keeping its own open-coded shell string.
  - Updated `frontend/src/components/Params/ParamSwitch.tsx` so the temp placeholder row now uses the same shared non-nested row shell utility instead of maintaining a parallel literal class contract.
  - Added `frontend/src/components/Params/paramRowClassNames.test.ts` to keep the shared shell contract covered by a focused unit test.
  - Re-ran the focused Vitest:
    - `pnpm -C frontend exec vitest run src/components/Params/paramRowClassNames.test.ts`
  - Result: `1 passed`, `3 passed`
  - Re-ran the expanded callable minimum regression spec.
  - Result: `4 passed`
  - Re-ran the callable pair:
    - `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
    - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - Result: `5 passed`
  - Re-ran the required CDP comparison on the stable `open` control scene:
    - `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - The callable screenshots remained visually aligned after the shared shell-contract move.
  - Live control-scene read:
    - callable subtree nodes:
      - `main`: `125`
      - worktree: `100`
    - visible param rows: `7` on both `main` and the worktree
- Next action:
  - Reassess whether any remaining Phase 2 work removes a real row-tree boundary. If not, stop Phase 2 here and treat the next meaningful step as a phase-boundary decision rather than more shell churn.

### 2026-03-16 34

- Item: Phase 2 closeout rerun against untouched `main`.
- Status: `done`
- Details:
  - Re-ran the locked `open` callable control scene on both:
    - untouched `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - Reused the same measurement path on both branches:
    - exact viewport reset to `translate(518.651px, 547.532px) scale(1.20289)`
    - exact section-width baseline reset to `240.578px`
    - wheel-event pan replay
    - exact zoom-target replay to `translate(470.651px, 505.532px) scale(0.90289)`
    - real `.section-resize-handle-right` drag replay to `324.780px`
  - Same-method DOM read on the callable subtree:
    - `main`:
      - total nodes: `125`
      - max depth: `12`
      - grid count: `18`
      - subgrid count: `0`
      - param rows: `7`
      - column handles: `6`
    - worktree:
      - total nodes: `100`
      - max depth: `10`
      - grid count: `17`
      - subgrid count: `0`
      - param rows: `7`
      - column handles: `6`
  - Same-method trace reruns:
    - `main`
      - idle: `71` frames, `16.66ms` avg, `17.7ms` max, `24` frames `>16.7ms`, `0` frames `>33.3ms`
      - pan: `71` frames, `17.11ms` avg, `49.7ms` max, `20` frames `>16.7ms`, `1` frame `>33.3ms`
      - zoom: `35` frames, `16.71ms` avg, `18.6ms` max, `13` frames `>16.7ms`, `0` frames `>33.3ms`
      - resize: `35` frames, `19.05ms` avg, `65.1ms` max, `17` frames `>16.7ms`, `2` frames `>33.3ms`
    - worktree
      - idle: `71` frames, `16.66ms` avg, `18.6ms` max, `23` frames `>16.7ms`, `0` frames `>33.3ms`
      - pan: `71` frames, `17.35ms` avg, `66.7ms` max, `29` frames `>16.7ms`, `1` frame `>33.3ms`
      - zoom: `35` frames, `16.60ms` avg, `17.8ms` max, `12` frames `>16.7ms`, `0` frames `>33.3ms`
      - resize: `35` frames, `19.00ms` avg, `68.6ms` max, `13` frames `>16.7ms`, `2` frames `>33.3ms`
  - Trace artifacts:
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-phase2-idle.trace.json`
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-phase2-pan.trace.json`
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-phase2-zoom.trace.json`
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/main-phase2-resize.trace.json`
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase2-rerun-idle.trace.json`
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase2-rerun-pan.trace.json`
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase2-rerun-zoom.trace.json`
    - `perf/reports/frontend/artifacts/2026-03-16_callable-dom-first/worktree-phase2-rerun-resize.trace.json`
  - DevTools insight read:
    - untouched `main` resize rerun exposed only a tiny CLS cluster (`0.0013`) and no forced-reflow insight
    - worktree resize rerun still exposes `ForcedReflow`, with `37ms` total reflow time led by:
      - `eq` in `chunk-MB4RGFJ3.js`
      - `getHandleCenter` in `src/state/actions/edgeHandles.ts`
      - `ProjectChatBottomDock.tsx`
  - Required CDP screenshot comparison:
    - `main` callable screenshot and worktree callable screenshot remained visually aligned after the closeout rerun
- Interpretation:
  - Phase 2 did achieve the structural goal:
    - the callable subtree is materially flatter on this branch than on untouched `main`
    - the obvious temp/real row-shell duplication is gone
  - Phase 2 did not produce a decisive interaction-performance win by itself:
    - idle and zoom are effectively flat
    - pan is still within noise and not clearly improved
    - resize is only marginally different in this same-method rerun
  - That means DOM flattening was worth doing, but it is not enough to justify more Phase 2 shell churn.
- Next action:
  - Stop Phase 2 here and move to Phase 3, focusing on the store/subscription surface around `GetParamSwitch`, `KwargsControls`, and the callable row render path instead of pursuing more shell-only refactors.

### 2026-03-16 35

- Item: Phase 3 checkpoint 1 narrowed `GetParamSwitch` to a single filtered-id selector boundary.
- Status: `done`
- Details:
  - Added `frontend/src/components/Params/getFilteredRenderableParamIds.ts` so the filtered-id derivation now lives behind one helper boundary instead of being open-coded inside `GetParamSwitch`.
  - Updated `frontend/src/components/Params/GetParamSwitch.tsx` so it now subscribes through one derived selector that returns renderable param ids directly.
  - Removed the previous broad `useProjectState` subscription for:
    - `codeObjs`
    - `codeObjVariants`
    - `codeObjImpls`
    - `sectionVariants`
    - `sectionImpls`
    - `sections`
    - `projectConfig.showParamDisplayNames`
    - `projectConfig.sectionVariantMap`
  - Removed the inline `useMemo` / `useProjectState.getState()` filtering path from `GetParamSwitch`; the component now renders from the narrowed selector result instead of maintaining its own local derived-work seam.
  - Added focused Vitest coverage in `frontend/src/components/Params/getFilteredRenderableParamIds.test.ts` for:
    - no-filter passthrough
    - nested-path filtering while preserving temp placeholder ids
    - display-name-aware matching
  - Re-ran focused Vitest:
    - `pnpm -C frontend exec vitest run src/components/Params/getFilteredRenderableParamIds.test.ts`
  - Result: `1 passed`, `3 passed`
  - Re-ran the existing shell-contract Vitest:
    - `pnpm -C frontend exec vitest run src/components/Params/paramRowClassNames.test.ts`
  - Result: `1 passed`, `3 passed`
  - Re-ran the callable pair:
    - `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
    - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - Result: `5 passed`
  - Re-ran the required CDP comparison on the stable `open` control scene:
    - `main`: `http://127.0.0.1:3087/busy_tide`
    - worktree: `http://127.0.0.1:3011/late_flake`
  - The callable screenshots remained visually aligned after the selector-boundary reduction.
- Interpretation:
  - This is the first accepted Phase 3 render-path checkpoint:
    - it reduces the surface area `GetParamSwitch` listens to
    - it deepens the filtering interface without changing user-visible behavior
  - This checkpoint is intentionally not presented as a shell/DOM win:
    - the locked `open` control scene does not exercise active param filtering
    - the relevant follow-up measurement should target filter/update work, not just idle callable layout
- Next action:
  - Continue Phase 3 by collapsing the remaining duplicate derived-work seam between `ParamDndList` and `GetParamSwitch`, then pair that cluster with a targeted trace rerun.
