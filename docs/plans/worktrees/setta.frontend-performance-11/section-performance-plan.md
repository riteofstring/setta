# Section Performance Plan

Date: 2026-03-16
Worktree: `setta.frontend-performance-11`
Branch at planning time: `frontend-performance-11`
Related log: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-log.md`

## Start Here

If you are a new chat/session picking this work up, use this section first.

- Despite the plan's callable origin, the active work is no longer callable-only.
- The accepted callable work in this branch is now pilot history for a broader sections-wide DOM simplification effort.
- The active refactor target is shared section-shell structure above the callable subtree.

Current status:

- Callable pilot work: complete as pilot/history
- Callable-specific performance goal: not fully achieved
- Active plan: sections-wide section-shell simplification
- Completed baseline: `Phase S0: Shared Section-Shell Baseline`
- Wrapper-only shell pass: `Phase S1` structurally exhausted after six accepted checkpoints
- Active phase: `Phase S3: Shared Resizable / Container Simplification`
- Latest accepted checkpoint: `Phase S3` checkpoint 5 moved shared surface-chrome ownership into `sectionChrome` so the canvas and window shells now consume the same base chrome model
- Current `Phase S3` state: checkpoint 5 accepted; the next serious step is real body-shell or theme-state invalidation reduction above the accepted controller/chrome/area-switch/active-shell/surface-chrome seams

Non-negotiable constraints:

- Eliminate div soup wherever wrappers are not carrying real value.
- Do not use `grid` or `subgrid` in the active implementation path.
- Use the simplest rendering/layout technique that preserves parity.
- Preserve all existing user-facing behavior, features, and interactions.
- The intended user-visible outcome is performance gain only, not redesign.
- Work from the deepest nested layout ownership outward/upward.
- Expect multiple passes; after removing a top shared grid layer, re-analyze before deciding the next pass.
- Use Chrome DevTools performance testing and compare untouched `main` vs this worktree.
- For any performance test that touches panning, zooming, resizing, or another section-shell interaction path, capture a Chrome DevTools `Performance` trace on that path. Playwright metrics or ad hoc timings can support the read, but they do not replace the DevTools profile.
- If a target truly cannot be achieved without `grid`, stop and report the blocker instead of introducing `grid`.
- Do not edit the settings page as part of this plan. Treat it as an observation-only perf control surface.

Immediate next step:

1. Reuse the locked S0 baseline in `perf/reports/frontend/2026-03-16_section-shell-s0.md` plus the accepted S1 checkpoints in `perf/reports/frontend/2026-03-16_section-shell-s1-checkpoint1.md` and `perf/reports/frontend/2026-03-16_section-shell-s1-checkpoint2.md`.
2. Reuse the newer shared-shell checkpoints in `perf/reports/frontend/2026-03-16_section-shell-s1-checkpoint3.md`, `perf/reports/frontend/2026-03-16_section-shell-s1-checkpoint4.md`, `perf/reports/frontend/2026-03-16_section-shell-s1-checkpoint5.md`, and `perf/reports/frontend/2026-03-16_section-shell-s1-checkpoint6.md` as the accepted `Phase S1` history.
3. Reuse `perf/reports/frontend/2026-03-17_section-shell-s2-checkpoint1.md`, `perf/reports/frontend/2026-03-17_section-shell-s2-checkpoint2.md`, `perf/reports/frontend/2026-03-17_section-shell-s2-checkpoint3.md`, `perf/reports/frontend/2026-03-17_section-shell-s2-checkpoint4.md`, `perf/reports/frontend/2026-03-17_section-shell-s2-checkpoint5.md`, `perf/reports/frontend/2026-03-17_section-shell-s2-checkpoint6-rerun2.md`, and `perf/reports/frontend/2026-03-17_section-shell-s2-checkpoint7.md` as the accepted `Phase S2` history so far.
4. Treat `Phase S1` as exhausted on the locked representative controls:
   - no exact wrapper-only candidates remain on the current worktree read for `S0 Code` / `S0 Dict`
   - the surviving outer `section-row-pin-main` shell is blocked by real ownership, not decoration
5. Treat the completed `Phase S2` row-tree cluster as:
   - `frontend/src/components/Params/ParamDndList.tsx`
   - `frontend/src/components/Params/ParamSwitch.tsx`
   - `frontend/src/components/Params/ParamContainer.tsx`
6. The surviving shared-shell subgrid utility usage in `GroupContainer` is now removed on the worktree representative controls, and the special nested-parent `section-args-nested` row branch is also removed there.
7. `ParamContainer` remains the row-only boundary beneath the list/filter orchestration, and checkpoint 7 is the accepted pass that removes the last justified row-tree adapter without reopening the earlier checkpoint-6 regression:
   - `frontend/src/components/Params/ParamSwitch.tsx`
   - `frontend/src/components/Params/ParamDndList.tsx`
   - the remaining child-recursion prop threading, especially `requiredParamIdsToPaths` and `visibleParamIdLookup`
   - the reduced row-tree ownership split between `ParamDndList`, `ParamSwitch`, and the row-only `ParamContainer`
8. Keep `S0 Code` and `S0 Dict` as the required untouched-`main` vs worktree representative controls.
9. For any `Phase S2` performance test that touches resize, pan, or zoom, capture a Chrome DevTools `Performance` trace on the touched path before deciding whether the checkpoint is accepted.
10. Current post-checkpoint-7 direction:
   - the locked untouched-`main` vs worktree `S0 Dict` visual/perf gate has been rerun after removing `GetParamSwitch`
   - the focused representative subtree remains flatter on the worktree in the settled `gamma` state:
     - `main`: `75` nodes, max depth `11`
     - worktree: `65` nodes, max depth `9`
   - the target-renderer trace pair now favors the worktree on most of the heavier categories:
     - worktree wins on `FunctionCall`, `UpdateLayoutTree`, `Layout`, `RunTask`, `EventDispatch`, `FireAnimationFrame`, and `Commit`
     - worktree is only slightly higher on `Paint` and `TimerFire`
     - INP is effectively flat (`189ms` on `main`, `190ms` on the worktree)
   - treat `Phase S2` as structurally exhausted and move the next serious step to `Phase S3`
11. The strongest opening `Phase S3` candidate was the shared resize/session ownership in:
   - `frontend/src/components/Utils/Resizable/CustomResizable.tsx`
   - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
   - `frontend/src/components/Section/Container/sectionChrome.ts`
12. Accepted `Phase S3` checkpoint 1 boundary:
   - extract a no-UI-change resize/session controller from `CustomResizable`
   - keep the visual shell stable while moving auto-size promotion, clamp/propagation, and persisted resize commit out of the presentational wrapper
13. Current post-checkpoint-1 direction:
   - `useSectionResizeController` now owns the resize/session lifecycle and persisted size commits
   - the representative `S0 Dict` resize gate stayed effectively flat enough to accept the ownership split
   - the remaining resize-path cost is still dominated by higher shell invalidation around the shared section frame, not by the controller seam itself
   - the next serious `Phase S3` pass should target:
     - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
     - `frontend/src/components/Section/Container/sectionChrome.ts`
   - do not reopen the controller split unless a later trace shows a new boundary-specific regression
14. Current post-checkpoint-2 direction:
   - `getCanvasSectionChrome` now owns the canvas surface class recipe, section background choice, meta-control drag-handle visibility, and the header/menu variant split
   - `CustomResizable` now consumes prepared canvas chrome and only owns the runtime resize shell responsibilities that still depend on DnD state or live handle geometry
   - the representative `S0 Dict` resize gate stayed flat enough to accept this chrome-ownership move
   - the remaining `Phase S3` work should now focus on:
     - real removable wrappers in `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
     - higher shell invalidation around `frontend/src/components/Section/Container/SectionContainerCore.tsx`
     - any follow-on shared-surface simplification needed by `frontend/src/components/Section/Container/SectionWindowSurface.tsx`
   - do not reopen the accepted controller or chrome plumbing seams unless a later trace shows a boundary-specific regression
15. Current post-checkpoint-3 direction:
   - `frontend/src/components/Section/Container/SectionAreaSwitch.tsx` now owns the shared section-type switch and chat-area handoff for both canvas and window surfaces
   - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` now owns only the canvas-specific placeholder/minimized gate above the shared area switch
   - `frontend/src/components/Section/Container/SectionWindowSurface.tsx` no longer depends on the canvas wrapper module to render shared section bodies
   - the locked representative `S0 Dict` subtree is flatter on the worktree at the accepted shrunk state:
     - `main`: `68` nodes, max depth `9`
     - worktree: `58` nodes, max depth `7`
   - the target-renderer resize trace now favors the worktree on:
     - `FunctionCall`
     - `UpdateLayoutTree`
     - `Layout`
     - `Paint`
     - `RunTask`
     - `EventDispatch`
     - `Commit`
   - `FireAnimationFrame` is the only notable watch item left from this checkpoint, and it is not large enough to reject the extraction
   - the next serious `Phase S3` pass should target higher shared-shell wrapper reduction or invalidation in:
     - `frontend/src/components/Section/Container/SectionContainerCore.tsx`
     - `frontend/src/components/Section/Container/SectionWindowSurface.tsx`
     - the remaining shared header/body shells around the accepted `SectionAreaSwitch` seam
   - do not reopen the accepted controller, chrome, or area-switch seams unless a later trace shows a boundary-specific regression
16. Current post-checkpoint-4 direction:
   - `frontend/src/components/Section/Container/SectionContainerCore.tsx` now isolates the active/highlight shell from the static edge-handle + resizable body subtree
   - a new focused invalidation guardrail proves active-only changes do not rerender:
     - the edge-handle subtree
     - `MinimizedDataEdgeHandles`
     - `SectionContainerCoreResizable`
   - the locked `S0 Code -> S0 Dict` activation trace stayed effectively flat:
     - worktree improved `RunTask` and `Commit`
     - worktree was only slightly higher on `FunctionCall`, `UpdateLayoutTree`, `Paint`, `EventDispatch`, and `FireAnimationFrame`
   - treat this as a narrow active-shell isolation checkpoint, not the final shared-shell answer
   - the next serious `Phase S3` pass should move outward into the broader shared section-surface shell ownership split across:
     - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
     - `frontend/src/components/Section/Container/SectionWindowSurface.tsx`
     - `frontend/src/components/Section/Container/sectionChrome.ts`
   - do not reopen the accepted controller, chrome, area-switch, or active-shell seams unless a later trace shows a boundary-specific regression
17. Current post-checkpoint-5 direction:
   - `frontend/src/components/Section/Container/sectionChrome.ts` now owns the shared section-surface mode split:
     - `bgColor`
     - meta-control mode
     - the shared window/canvas surface frame recipe
   - `frontend/src/components/Section/Container/SectionWindowSurface.tsx` no longer computes its shell classes inline and now consumes `getWindowSectionChrome(...)`
   - the locked untouched-`main` vs worktree `S0 Dict` floating-window visual compare stayed aligned after moving the shared chrome ownership:
     - header chrome
     - floating-window controls
     - the body shell
     - the visible `gamma` row
   - the rerun representative `S0 Dict` `300 x 300 -> 225 x 225` resize trace stayed acceptable:
     - worktree improved `FunctionCall`, `RunTask`, and `TimerFire`
     - worktree was only slightly higher on `UpdateLayoutTree`, `Layout`, `Paint`, `EventDispatch`, and `Commit`
     - `CLS 0.00` on both traces
   - treat this as a shared chrome-ownership checkpoint, not the final shell simplification
   - the next serious `Phase S3` pass should target actual body-shell or theme-state invalidation reduction above this model in:
     - `frontend/src/components/Section/Container/SectionWindowSurface.tsx`
     - the remaining shared section shell consumers above `sectionChrome.ts`
   - do not reopen the accepted controller, chrome, area-switch, active-shell, or shared surface-chrome seams unless a later trace shows a boundary-specific regression

Use the log for append-only history, but the active direction and next step should be readable from this file alone.

## Goal

Simplify the section DOM structure as aggressively as possible, while keeping visible layout and interaction behavior effectively identical to untouched `main`.

This file started as a callable-only plan. The accepted callable work now serves as the pilot/baseline for a broader sections-wide DOM simplification effort because the remaining grid and measurement contracts live above the callable subtree.

Active goal now:

- Reduce section-shell DOM complexity across shared section infrastructure, not just callables.
- Eliminate div soup wherever wrappers are not carrying real value.
- Prefer the simplest layout/rendering technique that preserves behavior and parity.
- Treat performance wins as likely upside, but not as guaranteed proof before the shared section-shell work is complete.
- Keep comparing untouched `main` vs this worktree in Chrome DevTools at each accepted checkpoint.
- Work from the deepest nested structures outward/upward into the shared section shell.
- Expect multiple passes. Do not assume the first grid-removal pass will reveal the final target structure.
- The intended user-facing result is performance gain only, not visual or UX change.
- All existing features and interactions must remain intact.

Historical callable-only phases below remain valid as an append-only record of the pilot work that already landed.

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

## What "Shared Chrome / Editor Path" Means

When the log/report says the remaining hotspot is in the "shared chrome / editor path", it means the dominant work is no longer isolated to callable-specific row rendering. It is in shared infrastructure that many section types pay for:

- section container and resize shell work
- shared section chrome and overlays
- edge-handle positioning work
- CodeMirror/editor layout work
- shared chat/window chrome such as `ProjectChatBottomDock`

In other words, the remaining cost is higher in the section stack than `CallableArea` itself.

## Architectural Focus

- Treat the row/tree path as one architecture cluster, not as isolated files:
  - `ParamContainer`
  - `ParamSwitch`
  - `GetParamSwitch`
  - `ParamDndList`
- The main structural goal is to replace the current recursive row shell contract with a smaller row primitive and a clearer shell boundary.
- Use `improve-codebase-architecture` when the row primitive, shell boundary, or ownership split becomes unclear during implementation.
- Use `debug-with-http-logging` when parity or perf behavior becomes ambiguous enough that traces and screenshots are not sufficient to explain the mechanism.

For the broadened sections-wide pass, treat these as the shared architecture cluster:

- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
- `frontend/src/components/Utils/Resizable/CustomResizable.tsx`
- `frontend/src/components/Section/Container/sectionChrome.ts`
- `frontend/src/components/Params/GroupContainer.tsx`
- `frontend/src/components/Params/ParamContainer.tsx`
- `frontend/src/components/Params/ParamSwitch.tsx`

## Layout Principles

- Default to the flattest DOM structure that preserves behavior.
- Eliminate div soup aggressively:
  - remove generic wrappers that exist only for grouping
  - keep wrappers only when they carry real behavior, semantic value, measurement ownership, or unavoidable positioning responsibility
- Rule out `grid` for the active sections-wide refactor.
- Do not add new `grid` or `subgrid` layout in the implementation path.
- Work from deeply nested layout ownership outward/upward:
  - remove or simplify the innermost wrappers first
  - then simplify the row/group contracts that contain them
  - then simplify the higher-level section shell once the inner contracts are stable
- Reach for simpler techniques first:
  - plain block flow when it is sufficient
  - `relative` + `absolute` positioning for overlays, underlines, and visual chrome
  - pseudo-elements for purely visual affordances
  - `flex` for truly one-dimensional layout when it simplifies the contract
- Prefer `relative` + `absolute` positioning for decorative layers, underlines, badges, hover chrome, and overlays when that removes wrapper nodes or layout coupling.
- Prefer pseudo-elements over extra DOM nodes for purely visual affordances.
- Use `flex` only when the layout is truly one-dimensional and it simplifies the contract without introducing extra measurement or wrapper work.
- Existing `grid` / `subgrid` usage is now something to remove, not something to preserve by default.
- If a target layout truly cannot be achieved without `grid`, stop implementation and report that explicitly instead of introducing `grid` anyway.
- The rendering rule is: use the simplest technique that preserves parity and all existing features.
- Use semantic HTML where it fits naturally, but treat that as a second-pass improvement after the structural/performance simplification is already stable.
- Good candidates for later passes include `section`, `header`, `nav`, `aside`, lists, and other semantic containers that can replace generic wrappers without adding layout risk.
- Do not force semantic tags into places where they complicate parity or make the structure harder to reason about.
- If a layout choice is not clearly simpler or clearly faster, do not keep it by inertia; measure it.

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
- The work log under `docs/plans/worktrees/setta.frontend-performance-11/section-performance-log.md` is append-only.
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

Current status after the accepted Phase 3 checkpoints:

- Treat Phase 3 as complete once the latest accepted filter/reorder traces no longer point at a clear callable-owned seam.
- Do not start Phase 4 just to keep pushing numbers down.
- Only continue callable-specific Phase 4 work when a fresh trace proves the next dominant scripting hotspot is still inside the callable subtree.
- If the next dominant signal has moved to shared page chrome or editor work, record that boundary in the log/report and stop the callable-specific track there rather than refactoring speculative targets.

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
   - Chrome DevTools `Performance` trace metrics for pan, zoom, resize
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

Current closeout status:

- The first, third, fourth, and fifth items above are satisfied by the accepted checkpoints already recorded in the log/report.
- The second item is not yet satisfied:
  - the Phase 2 closeout rerun showed the callable subtree is materially flatter, but pan stayed within noise, zoom stayed effectively flat, and resize was only marginally different on the same locked scenario
  - later Phase 3 work improved the callable filter/reorder path, but it did not convert the locked pan/zoom/resize scenario into a clear callable-owned win
  - the fresh locked resize reopen check also failed to hand ownership back to the callable subtree:
    - the worktree still exposed `ForcedReflow`
    - the dominant contributors stayed in shared chrome/editor work (`eq`, `ProjectChatBottomDock`)
    - callable-owned contributions (`getHandleCenter`, `KwargsControls.updateHeight`) remained small trailing costs
- Therefore this callable-specific track should currently be treated as stopped short of full completion, not as "tasks completed".
- Only reopen the callable track if:
  - a fresh trace proves the locked pan/zoom/resize gap is still callable-owned, or
  - the scope explicitly expands to shared page chrome / editor work that sits outside the callable subtree.

## Active Continuation After The Callable Pilot

The active work is now sections-wide DOM simplification.

The callable work already completed in this branch remains important because it proved two things:

- flattening the subtree is possible without user-facing regression
- the remaining layout contract is defined above the callable subtree, so a broader section-shell pass is justified

Implementation order for the broadened pass:

1. Start at the deepest nested layout ownership in the selected representative sections.
2. Move outward/upward only after the inner contract for that slice is stable and screenshot-verified.
3. Do not start by flattening the top-level section shell while the inner row/group contract is still noisy.
4. After the top-most shared grid layer is removed, pause and re-analyze the remaining structure before committing to the next pass.
5. Preserve all existing user-facing features while simplifying the structure:
   - resize
   - drag/reorder
   - keyboard interactions
   - standalone routes
   - theme variants
   - handles and overlays
   - any other existing section behavior on the representative scenes

### Representative scenarios

Keep the callable scenarios as required controls:

- locked `open` control scene
- `math.sqrt` minimum regression matrix

Add at least two shared section-shell controls before implementation resumes:

- one editor-backed non-callable section
- one non-editor section that still exercises the shared section shell and resizing path

Each accepted checkpoint should compare untouched `main` and this worktree on the same representative scene set in Chrome DevTools.

For any checkpoint that exercises panning, zooming, resizing, or a similar section-shell movement on these scenes, record a Chrome DevTools `Performance` trace for the touched interaction path. Do not treat automated timings alone as sufficient evidence.

Add an occasional large-surface pan/zoom control outside the locked checkpoint scenes:

- `http://127.0.0.1:3011/settings`
- specifically the `All settings` view mode / tab
- use it as a periodic sanity check because it is large and structurally complex
- keep it observation-only for this plan; do not edit that page while doing the section-shell work

### Active phases

#### Phase S0: Shared Section-Shell Baseline

Purpose: identify the section-level grid/subgrid and wrapper contracts that survive above the callable pilot.

Tasks:

1. Capture a fresh DOM audit for representative section types on `main` and this worktree:
   - total nodes
   - max depth
   - grid count
   - subgrid count
   - wrapper-only nodes
2. Capture Chrome DevTools `Performance` traces for the shared resize path and any obviously coupled pan/zoom path.
   - Do not treat Playwright timings or ad hoc stopwatch numbers as a substitute for this trace evidence.
3. Map the shared shell ownership:
   - `SectionContainerCoreResizabe`
   - `CustomResizable`
   - `sectionChrome`
   - shared edge-handle work
   - editor/chat chrome that fires during section resize
4. For each representative section, identify the deepest nested DOM cluster that should be attacked first before moving outward/upward.

Exit criteria:

- The shared section-shell hotspot map is written down.
- The representative scene set is locked.
- The deepest-first attack order for the first pass is written down.

#### Phase S1: Decorative And Wrapper Flattening Across Shared Section Shells

Purpose: remove visual-only nodes and grid usage that are not carrying real layout semantics.

Targets:

- resize visuals
- section hover/selection chrome
- underlines and focus affordances
- status/error badges
- purely visual gutters/dividers

Tasks:

1. Replace wrapper nodes with pseudo-elements where possible.
2. Replace visual-only grid usage with absolute positioning where it keeps parity and reduces coupling.
3. Keep each checkpoint small and screenshot-gated.
4. If a target cannot be completed without `grid`, stop and document the blocker instead of shipping a new grid-based solution.
5. Keep the checkpoints moving from inner layout ownership outward/upward instead of starting at the top-level section frame.

Exit criteria:

- Visual-only wrappers are materially reduced across the shared shell.
- No user-facing behavior changes.
- A follow-up structural audit is recorded before moving to the next pass if the removal changes the visible shell contract.

#### Phase S2: Shared Row / Shell Contract Simplification

Purpose: replace the surviving grid/subgrid section-row contract with a simpler shared primitive that does not depend on grid.

Targets:

- `GroupContainer`
- `ParamContainer`
- `ParamSwitch`
- any shared section-row shell in the section container stack

Tasks:

1. Remove `grid-cols-subgrid` and other surviving row-level grid contracts.
2. Collapse nested row shells that still exist only to satisfy the old grid contract.
3. Prefer a single shared non-grid row primitive instead of multiple similar wrappers.
4. If a row/shell target cannot be reproduced without grid, stop and document the blocker rather than keeping grid as an exception.
5. Continue moving outward/upward only after the inner row/group slice is stable under parity and DevTools checks.

Exit criteria:

- The shared row/shell contract is materially simpler than untouched `main`.
- Grid remains only where it clearly carries real structural value.
- After the top-most shared grid layer is removed, a fresh structural read determines whether another simplification pass is needed.

#### Phase S3: Shared Resizable / Container Simplification

Purpose: simplify the high-level section frame and resize path now that the inner shell has been reduced.

Targets:

- `SectionContainerCoreResizabe`
- `CustomResizable`
- `sectionChrome`

Tasks:

1. Remove unnecessary frame/layout wrappers in the section shell.
2. Reduce layout reads/writes in the resize path where a simpler shell makes them unnecessary.
3. Keep parity on handles, selection, hover, and minimized/fullscreen behavior.
4. Treat this phase as intentionally later than the inner-shell work, not as the starting point.

Exit criteria:

- The shared section shell is flatter than untouched `main`.
- The resize path is re-measured on the representative scenes.

#### Phase S4: Trace-Backed Follow-Up

Purpose: only after the shared DOM simplification lands, revisit any remaining scripting/layout hotspots shown by DevTools.

Tasks:

1. Re-run Chrome DevTools traces on `main` vs this worktree.
2. Continue only where the next hotspot is proven by measurement.
3. Do not keep refactoring by aesthetics alone once the structural work is done.
4. If the previous pass materially changed the shell shape, start this phase with another DOM/ownership audit before deciding what the next pass should be.

Exit criteria:

- The next remaining hotspot is explicitly identified.
- Any further work is justified by evidence rather than assumption.

#### Phase S5: Semantic HTML Cleanup

Purpose: once the simplified non-grid structure is stable, replace generic wrappers with semantic HTML where it fits naturally.

Tasks:

1. Audit the stabilized structure for obvious semantic upgrades:
   - `section`
   - `header`
   - `nav`
   - `aside`
   - lists and list items
2. Apply semantic tags only where they preserve parity and do not complicate the simplified structure.
3. Keep this phase lower priority than the structural/performance work.

Exit criteria:

- Obvious semantic upgrades are applied where they are genuinely helpful.
- No user-facing behavior or layout regressions are introduced.

## Current Blockers At Planning Time

- Baseline capture is still pending.
- CDP availability must be re-verified separately for untouched `main` and this worktree before Phase 0 execution.
- If either CDP session is unavailable, stop and ask the user to start `./ai.sh` in the needed directory.
