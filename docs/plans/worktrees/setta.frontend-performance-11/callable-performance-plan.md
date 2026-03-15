# Callable Performance Refactor Plan

Date: 2026-03-16
Worktree: `setta.frontend-performance-11`
Branch at planning time: `frontend-performance-11`
Related log: `docs/plans/worktrees/setta.frontend-performance-11/callable-performance-log.md`

## Goal

Improve callable-section pan, zoom, and resize performance with a DOM-first refactor, while keeping visible layout and interaction behavior effectively identical to untouched `main`.

This plan is intentionally narrow:

- Scope the first pass to the callable section only.
- Refactor deepest nested callable components first, then move upward.
- Finish the DOM/layout pass before starting React/JS optimization.
- Stop and prompt the user before moving from one phase to the next.

## Planning Inputs

- Reviewed `docs/notes/performance/frontend-performance-branches-retrospective.md`.
- Reviewed `docs/guides/browser-mcp-quickstart.md`.
- Reviewed `docs/guides/verification-checklist.md`.
- Inspected the current callable subtree:
  - `frontend/src/components/Section/Layouts/CallableArea.tsx`
  - `frontend/src/components/Section/SectionParts/Search.tsx`
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Params/ParamDndList.tsx`
  - `frontend/src/components/Params/GetParamSwitch.tsx`
  - `frontend/src/components/Params/ParamSwitch.tsx`
  - `frontend/src/components/Params/ParamContainer.tsx`
  - `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`

## What The Existing Evidence Already Says

- The main bottleneck is the live callable/settings param-row and widget subtree, not the outer React Flow shell.
- DOM flattening is directionally correct, but DOM count reduction alone is not enough.
- We should not reopen previously rejected paths unless the product assumption changes:
  - backend-only fixes as the primary answer
  - subscription partitioning
  - lazy overlay mounting
  - observer/listener-budget work as the main lever
  - workerized param filtering
  - `content-visibility`
  - RAF-throttled transform propagation
  - code-widget-only SnapDOM
  - minimap-first tuning
  - canvas-engine rewrite under always-live DOM
- The current callable subtree still uses recursive `grid` / `subgrid` contracts heavily in the row and group layers, so the next focused pass should attack that directly.

## Architectural Focus

- Treat the row/tree path as one architecture cluster, not as isolated files:
  - `ParamContainer`
  - `ParamSwitch`
  - `GetParamSwitch`
  - `ParamDndList`
- The main structural goal is to replace the current recursive row shell contract with a smaller row primitive and a clearer shell boundary.
- Use `improve-codebase-architecture` when the row primitive, shell boundary, or ownership split becomes unclear during implementation.
- Use `debug-with-http-logging` when parity or perf behavior becomes ambiguous enough that traces and screenshots are not sufficient to explain the mechanism.

## Current Callable Hotspot Map

The likely leaf-to-shell refactor order is:

1. Leaf UI nodes
   - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
   - `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
   - widget-specific wrappers that still inject row/layout wrappers
2. Row switch / row container nodes
   - `frontend/src/components/Params/ParamContainer.tsx`
   - `frontend/src/components/Params/ParamSwitch.tsx`
   - `frontend/src/components/Params/GetParamSwitch.tsx`
   - `frontend/src/components/Params/ParamDndList.tsx`
3. Callable support shells
   - `frontend/src/components/Section/SectionParts/Search.tsx`
   - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
4. Group shells
   - `frontend/src/components/Params/GroupContainer.tsx`
5. Callable-wide shell audit
   - only if needed after phases 1-3
   - `frontend/src/components/Section/Container/sectionChrome.ts`
   - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`

Useful size indicators from the current code scan:

- `GroupContainer.tsx`: 999 lines
- `ParamUI.tsx`: 736 lines
- `KwargsControls.tsx`: 575 lines
- `Search.tsx`: 442 lines
- `ParamNameInput.tsx`: 418 lines
- `ParamSwitch.tsx`: 314 lines

## Hard Guardrails

- Do not implement the refactor on the current `main` worktree. Use a dedicated performance worktree/branch so untouched `main` stays the control.
- Keep `docs/notes/performance/frontend-performance-branches-retrospective.md` in this worktree and treat it as the local do-not-repeat decision log.
- Commit frequently in small, logical increments while the refactor is in progress.
- Commit messages should be very descriptive so each checkpoint is understandable later without extra context.
- Make a descriptive checkpoint commit as soon as a coherent doc/test/layout checkpoint has passed its required verification so the user can push incrementally.
- Do not lose any user-facing functionality during the refactor.
- As far as the user can tell, untouched `main` and the refactor worktree should behave and look the same, except that the refactor worktree should ideally perform better.
- Do not add compatibility shims, fallback layers, or temporary dual-path behavior to preserve the old structure. This work is not constrained by production backward-compatibility requirements.
- Every DOM/layout change is a visual change and requires CDP visual verification.
- For every completed layout checkpoint, stop and compare screenshots between untouched `main` and this worktree before making more layout changes.
- If CDP is unavailable for either worktree, stop and ask the user to start `./ai.sh` in the needed directory before continuing.
- Every phase must end with a comparison against untouched `main` on the same scenario.
- “Pixel perfect” is the target. If any delta remains, document the exact element and the reason it cannot be preserved.
- Each phase requires explicit user approval before starting the next phase.
- Every measurement report is append-only under `perf/reports/frontend/`.
- The work log under `docs/plans/worktrees/setta.frontend-performance-11/callable-performance-log.md` is append-only.
- Phase 2 is the first decisive checkpoint for whether the DOM-first callable strategy is paying off. Phase 1 is useful cleanup but not proof of success by itself.

## Checkpoint Verification Cadence

For every completed layout checkpoint, meaning a small coherent batch of layout edits that should now look correct:

1. Stop editing.
2. Capture screenshots in CDP for untouched `main` and this worktree on the same callable scenario.
3. Compare the key callable geometry and styling before continuing:
   - search row
   - first visible param row
   - nested child row
   - pinned params header and first pinned row
   - unpinned list container
   - resize handle
   - agentic handles
4. If there is visible drift, fix it or explicitly document it before continuing with more layout edits.

## Minimum Callable Regression Run

This is the minimum callable regression run for every layout checkpoint and every phase gate. It complements the lighter `open` baseline from Phase 0 instead of replacing it.

Scenario setup:

1. Start from an isolated project config.
2. Ensure generated Python code imports `math`.
   - If the active python target prefix does not already contain `import math`, add it before continuing.
3. Create a callable section and set the callable to `math.sqrt`.
4. Rename and expand params so the callable exposes `a` through `k`.
   - Rename the builtin `x` param to `a`.
   - Add kwargs and rename them to `b`, `c`, `d`, `e`, `f`, `g`, `h`, `i`, `j`, `k`.
   - For isolated automated checkpoint runs, disable `settings.backend.autoRefetchCallableParamsOnLspMismatch` before building this invalid-but-intentional signature shape so the backend does not silently refetch the real `math.sqrt` signature mid-test.
5. Partition the params into all three callable areas:
   - edge inputs: `a`, `b`, `c`, `d`
   - pinned params: `e`, `f`, `g`
   - unpinned params: `h`, `i`, `j`, `k`
6. Place the callable at a deterministic viewport transform before taking screenshots.
7. Run the scenario in both `light` and `dark` color modes.
8. Run the scenario both on the canvas route and on the direct standalone section route:
   - `/:projectConfigName/section/:sectionSlug`
   - treat the direct route as the fullscreen control surface
   - if the standalone surface intentionally omits canvas-only controls, do not add a shim; verify the controls that are supposed to exist there

Interactions that must be covered on every run:

1. Capture a roomy baseline screenshot.
2. Resize the callable with the right resize handle.
3. Resize the callable with the bottom resize handle.
4. Resize the callable with the bottom-right resize handle.
5. Resize the param column using the callable param-column resize handle.
6. Drag/reorder at least one unpinned param row using the live DnD interaction.
7. Indent and unindent at least one unpinned param row using `Tab` and `Shift + Tab`.
8. On the standalone direct route, verify the callable still renders correctly and supports the interactions that are intentionally available there.
9. Capture a screenshot after every completed state transition above, in every required surface/theme variant.

Assertions that must be covered on every run:

1. All three callable areas render at the same time:
   - edge strip rows for `a` through `d`
   - pinned rows for `e` through `g`
   - unpinned rows for `h` through `k`
2. Overflow states are explicitly checked:
   - roomy state: the unpinned list does not vertically overflow
   - constrained state: the unpinned list vertically overflows and remains scrollable
   - recovered state: overflow returns to the expected non-overflow state after expanding again
3. Column-resize states are explicitly checked:
   - narrower column width applies
   - wider column width applies
4. Drag/reorder is explicitly checked:
   - the dragged param lands in the expected visible order
   - the reordered state remains usable and screenshot-stable
5. Tab indent is explicitly checked:
   - `Tab` indents the selected param under the expected parent
   - `Shift + Tab` restores it to the expected top-level location
6. Theme and route coverage are explicitly checked:
   - the same scenario renders in both `light` and `dark`
   - the direct standalone route renders without workspace panes
   - if the standalone route intentionally omits canvas-only outer resize handles, that omission is preserved
7. The resize interactions keep the callable usable:
   - edge rows remain visible
   - pinned header remains visible
   - at least one unpinned row remains visible
   - the intended resize handles remain present

Suggested automated coverage:

- `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
- `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`

## Phase 0: Control Setup And Baseline

Purpose: create the harness so each later phase is measured and reversible.

Tasks:

1. Create or switch to a dedicated callable-performance worktree/branch off `main`.
2. Verify CDP access for untouched `main` and this worktree.
   - If either session is unavailable, stop and ask the user to start `./ai.sh` in the needed directory.
3. Choose one deterministic callable scenario with real callable params, nested params, pinned params, and at least one resize interaction.
4. Capture the untouched `main` baseline:
   - CDP performance trace for `pan`
   - CDP performance trace for `zoom`
   - CDP performance trace for `resize`
   - DOM metrics for the callable subtree: total nodes, max depth, count of `display:grid`, count of `subgrid`, and hot descendants
5. Lock visual parity checks:
   - reuse and extend existing Playwright specs:
     - `frontend/tests/e2e/params/callable-params.spec.ts`
     - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
     - `frontend/tests/e2e/sections/agentic-edge-callable-handle-alignment.spec.ts`
     - `frontend/tests/e2e/sections/minimized-callable-edge-handles.spec.ts`
     - any relevant callable sizing coverage in `frontend/tests/e2e/sections/section-sizing.spec.ts`
   - add a callable geometry/parity spec if current coverage is not enough
   - capture the first screenshot pair for untouched `main` and this worktree before any layout edits
   - compare key bounding boxes between untouched `main` and the refactor worktree:
     - callable search row
     - first visible param row
     - nested child param row
     - pinned params header and first pinned row
     - unpinned list container
     - resize handle
     - agentic handles
6. Write the baseline section in a new perf report:
   - suggested path: `perf/reports/frontend/2026-03-16_callable-dom-first.md`

Exit criteria:

- Stable baseline scenario exists.
- Baseline CDP traces and DOM metrics are recorded.
- Visual parity harness is in place.

Gate:

- Prompt user before Phase 1.

## Phase 1: Leaf DOM Flattening

Purpose: remove unnecessary nested DOM and grid usage from the deepest callable leaves before touching row shells.

Targets:

- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
- widget-specific wrappers used by callable params
- small callable-search wrappers in `frontend/src/components/Section/SectionParts/Search.tsx` where they are leaf-only and not row-contract-critical

Tasks:

1. Replace non-semantic wrapper `div`s with fragments where the wrapper exists only for JSX grouping.
2. Replace leaf `grid` wrappers with `relative` / `absolute` / `flex` layouts where geometry can stay identical.
3. Collapse duplicated decorative wrappers around borders, overlays, and error affordances when the same effect can be achieved on the row or leaf root.
4. Preserve stable hooks:
   - `id^="ParamContainer-..."`
   - existing class hooks still used by tests and styling
   - handle alignment hooks
5. Add or update Vitest coverage for leaf layout invariants when practical.

Verification:

- Follow the checkpoint screenshot cadence during the phase.
- Run the minimum callable regression run and review its screenshots.
- Run the callable-related Playwright coverage.
- Run CDP visual check against untouched `main`.
- Re-run the callable baseline traces and DOM metrics.
- Append results to the perf report.

Exit criteria:

- Measurable DOM simplification in the leaf subtree.
- No visual drift in callable layout.
- No regression in handle alignment, param visibility, or resize affordances.

Gate:

- Prompt user before Phase 2.

## Phase 2: Row And Tree Flattening

Purpose: remove recursive row-level `grid` / `subgrid` structure while preserving the callable row contract.

Targets:

- `frontend/src/components/Params/ParamContainer.tsx`
- `frontend/src/components/Params/ParamSwitch.tsx`
- `frontend/src/components/Params/GetParamSwitch.tsx`
- `frontend/src/components/Params/ParamDndList.tsx`

Tasks:

1. Replace the current row shell patterns that depend on `grid-cols-subgrid`.
2. Consolidate duplicate temp/real row layout contracts where one row primitive can serve both.
3. Move row alignment to a simpler contract:
   - CSS custom properties for column widths are acceptable
   - `relative` / `absolute` positioning for overlays and handles is preferred
   - `flex` is acceptable when absolute positioning is not enough
4. Keep DnD behavior unchanged:
   - same draggable hit zones
   - same transform behavior under zoom
   - same placeholder geometry
5. Keep nested param indentation and child-tree visibility identical.

Verification:

- Follow the checkpoint screenshot cadence during the phase.
- Run the minimum callable regression run and review its screenshots.
- Playwright geometry assertions for top-level, nested, and temporary rows.
- CDP visual check at normal size and resized extremes.
- CDP performance trace rerun on the same pan/zoom/resize scenario.
- Append results to the perf report and log.

Exit criteria:

- Recursive subgrid dependency is materially reduced or removed in the row layer.
- DnD and resize behavior still match untouched `main`.
- Pan/zoom/resize traces show clear improvement or at minimum a clear DOM-cost reduction with no behavioral regression.
- Treat this as the main go/no-go checkpoint for continuing the DOM-first callable strategy.

Gate:

- Prompt user before Phase 3.

## Phase 3: Callable Render-Path Narrowing

Purpose: now that Phase 2 removed the obvious row/tree shell duplication, reduce subscription breadth and repeated derived work in the callable render path. Return to more shell flattening only if a trace or DOM audit points back to a remaining shell hotspot.

Targets:

- `frontend/src/components/Params/GetParamSwitch.tsx`
- `frontend/src/components/Params/ParamDndList.tsx`
- `frontend/src/components/Params/GroupContainer.tsx`
- `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
- `frontend/src/components/Section/SectionParts/Search.tsx`

Tasks:

1. Collapse broad selectors in `GetParamSwitch` into narrower derived boundaries so the component only subscribes to renderable param ids, not the whole section/code-object cluster.
2. Deepen the `ParamDndList` / `GroupContainer` handoff so tree, duplicate-index, and filter derivation happen once per callable list instead of being spread across multiple shallow seams.
3. Re-check callable-specific measurement/update code in `KwargsControls` and `Search`:
   - keep necessary observers
   - do not introduce heuristic shortcuts
   - reduce layout-read and style-write surfaces where a simpler render boundary makes them unnecessary
4. Only return to group-shell flattening when a trace or DOM audit shows remaining shell overhead in:
   - `frontend/src/components/Section/Container/sectionChrome.ts`
   - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
5. After each accepted checkpoint:
   - run the minimum callable regression run and review its screenshots
   - re-run the callable pair
   - perform the required CDP screenshot comparison with untouched `main`
6. Once a meaningful cluster of render-path changes lands, rerun targeted traces against the relevant interaction path instead of assuming the idle open-control baseline is sufficient.

Verification:

- Follow the checkpoint screenshot cadence during the phase.
- Run the minimum callable regression run and review its screenshots.
- Existing callable Playwright specs plus focused Vitest coverage for any new render-path helper.
- CDP visual comparison with untouched `main`.
- CDP trace reruns on the relevant interaction path once a render-path cluster lands.
- Append any callable-wide DOM audit results only when a checkpoint actually changes the shell/DOM shape.

Exit criteria:

- The callable render path subscribes through narrower boundaries than untouched `main`.
- The next remaining hot path is identified by trace evidence, not assumption.
- Any remaining shell work is explicitly justified by measurement.

Gate:

- Prompt user before Phase 4.

## Phase 4: JS / React Optimization Pass

Purpose: optimize scripting cost only after the DOM and layout contracts are stable.

Targets:

- `frontend/src/components/Params/GetParamSwitch.tsx`
- `frontend/src/components/Params/ParamDndList.tsx`
- `frontend/src/components/Params/GroupContainer.tsx`
- `frontend/src/components/Section/SectionParts/Search.tsx`
- any hot selector or derived-data helper reached from the callable path

Tasks:

1. Use CDP traces to identify the hottest scripting and commit paths in the refactored callable subtree.
2. Remove over-broad subscriptions or repeated derived work only when the trace proves they matter.
3. Reduce repeated filtering, tree building, and deep equality work where a narrower boundary is available.
4. Add automated guardrails for the hot path when practical:
   - Playwright coarse budgets or logged metrics
   - Vitest coverage for hot helper paths
5. Re-measure on the same scenario.

Verification:

- Use traces to prove the hot scripting path before changing code.
- Run the minimum callable regression run and review its screenshots after each accepted change.
- Re-run targeted Playwright coverage.
- Run CDP performance traces on the same locked scenario.
- Append results to the perf report.

Exit criteria:

- The post-DOM callable path shows reduced scripting cost.
- No user-visible behavior changed.

Gate:

- Prompt user before any broader “all sections” rollout.

## Branch-Comparison Workflow

For every completed layout checkpoint and every phase end:

1. Keep untouched `main` as the control.
2. Run the same callable scenario in the implementation worktree.
3. Compare:
   - screenshots or visible layout in CDP
   - bounding boxes of key callable elements
   - trace metrics for pan, zoom, resize
   - DOM metrics for the callable subtree
4. If there is any visual drift:
   - stop
   - identify the exact element
   - either fix it in the current phase or document why perfect parity is impossible

## Definition Of Done For The Callable Track

- Callable subtree is measurably flatter than untouched `main`.
- Callable pan/zoom/resize traces improve on the same scenario.
- Callable geometry matches untouched `main` closely enough that any remaining delta is explicitly documented.
- Existing callable behavior is covered by Playwright/Vitest and still passes.
- Perf report and work log are updated append-only.

## Current Blockers At Planning Time

- Baseline capture is still pending.
- CDP availability must be re-verified separately for untouched `main` and this worktree before Phase 0 execution.
- If either CDP session is unavailable, stop and ask the user to start `./ai.sh` in the needed directory.
