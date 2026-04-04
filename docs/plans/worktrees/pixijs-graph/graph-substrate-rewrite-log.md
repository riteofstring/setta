# Graph Substrate Rewrite Log

Date started: 2026-04-02
Worktree: `pixijs-graph`
Related plan: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-plan.md`
Research source worktree: `setta.pixijs-rewrite`

## Usage

Append-only execution log for the graph substrate rewrite effort.

Every log item should record:

- `Item`
- `Status`
- `Details`
- `Next action`

Recommended status values:

- `todo`
- `in_progress`
- `done`
- `blocked`
- `deferred`

Record:

- architecture decisions
- substrate/runtime milestones
- benchmark evidence
- visual verification
- drag/pan/zoom regressions
- DOM overlay ownership decisions

## 2026-04-02 001

- Item: Initialize the `pixijs-graph` worktree with the latest Ralph loop files and a fresh graph-substrate rewrite plan.
- Status: `done`
- Details:
  - This worktree starts from `main`.
  - The latest Ralph loop infrastructure was ported in from `setta.pixijs-rewrite`:
    - `RALPH.md`
    - `scripts/ralph-default-prompt.md`
    - `scripts/run-codex-loop.sh`
    - `tests/start/test_run_codex_loop_script.py`
  - A fresh durable plan set was created under `docs/plans/worktrees/pixijs-graph/`.
  - Architectural reset for this worktree:
    - do not keep investing in the old shared-page-runtime/DOM-sync renderer lane
    - replace the graph substrate first
    - keep DOM section bodies/editors initially
    - add Pixi ownership only after the custom substrate proves drag/pan/zoom correctness
- Verification:
  - `bash -n scripts/run-codex-loop.sh`
    - result: passed
  - `./ralph.sh --help`
    - result: passed
  - `./ralph.sh --print-prompt`
    - result: passed
    - note: the rendered prompt resolved the new `pixijs-graph` plan, handoff, and history files rather than the old `setta.pixijs-rewrite` docs
  - `source activate.sh && pytest tests/start/test_run_codex_loop_script.py -q`
    - result: passed (`8 passed`, about `45s`)
  - `pnpm -C frontend exec prettier --check ../RALPH.md ../scripts/ralph-default-prompt.md ../docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-plan.md ../docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-handoff.md ../docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log.md ../docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log-index.md ../docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-completed.md`
    - result: passed
- Conclusion:
  - this worktree is now the clean execution base for the graph substrate rewrite
  - the next Ralph slice should start implementing the custom graph-runtime canary instead of reopening the old shared-runtime renderer path
- Next action:
  - introduce the first custom graph/runtime seam for `settings` and render one normal-zoom section body through it with DOM content and custom drag ownership

LOOP_TERMINAL_MARKER: none

## 2026-04-02 007

- Item: Expand the `settings` graph-substrate canary from one visible section to the visible `All Settings` top-level section set.
- Status: `done`
- Details:
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.ts` now returns the visible top-level canary section list instead of a single preferred section and includes each section's `positionAndSizeLocked` state for drag ownership decisions.
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx` now renders that visible section set on the custom surface, fits the initial viewport to the shared section bounds, and routes drag ownership to the section that was actually grabbed.
  - The canary now keeps local per-section DOM size observations so multi-section viewport fitting uses the visible section field without handing ownership back to `xyflow`.
  - `frontend/tests/e2e/settings/settings-view-modes.spec.ts` now proves:
    - more than one canary section is visible on `All Settings`
    - a runtime-discovered draggable section can move without pulling a different visible section with it
    - shared pan/zoom moves multiple visible sections together
    - title editing still works on the broader canary surface
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.test.ts` now locks down the plural visible-section selector and lock-state contract.
- Verification:
  - `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.test.ts`
    - result: passed (`4 passed`)
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings view tabs filter sections and minimap|settings graph substrate canary drags one section and persists the top-level layout|settings graph substrate canary pans and zooms one section on the custom surface|settings graph substrate canary keeps title editing working after pan and zoom'`
    - result: passed (`4 passed`, about `44s`)
  - CDP visual check
    - result: partial pass
    - note: on `http://127.0.0.1:3075/settings`, `All Settings` showed more than one visible canary section and no gross blank/detached-body issue in the normal visible field
    - note: side-by-side gross-drift comparison against the read-only `main` reference did not run because `http://127.0.0.1:3087/settings` returned `ERR_CONNECTION_REFUSED`; `run-006/main-ai.log` shows the reference app died during startup on a settings-project validation error
- Conclusion:
  - the custom graph-substrate canary now covers the visible `All Settings` top-level section field instead of a single representative section
  - the next useful frontier is the staged Gate 1 gross-drift comparison against a healthy `main` oracle session, then any concrete multi-section visual/perf issue that compare exposes
- Next action:
  - restore or refresh the read-only `main` reference session and do the normal-zoom Gate 1 gross-drift compare for the new multi-section canary surface

LOOP_TERMINAL_MARKER: none

## 2026-04-02 005

- Item: Add custom pan/zoom ownership to the `settings` graph-substrate canary and prove the checked section stays attached on the custom surface.
- Status: `done`
- Details:
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx` now owns background pan on the canary root instead of depending on legacy `xyflow` pane ownership.
  - The same canary root now owns anchored wheel zoom for the checked `settings` / `All Settings` slice.
  - The canary syncs pan/zoom interaction state back into shared `useReactFlow` and `useMisc` flags so DOM-backed section internals still receive the expected viewport-interaction signals.
  - Added a stable `graph-substrate-canary-viewport` test target so automated checks can read the live transform directly.
  - Updated `frontend/tests/e2e/settings/settings-view-modes.spec.ts` with a focused canary pan/zoom proof on the custom surface while keeping the existing drag proof on the same slice.
- Verification:
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary (drags one section and persists the top-level layout|pans and zooms one section on the custom surface)'`
    - result: passed (`2 passed`, about `26s`)
  - CDP visual check
    - result: passed
    - note: on `http://127.0.0.1:3075/settings`, `All Settings` showed `graph-substrate-canary`, `.react-flow__pane` stayed absent, background pan changed the live viewport transform while the DOM-backed section remained attached, wheel zoom changed the viewport scale from `1.94099` to `2.70719`, and no error boundary/crash surfaced
- Conclusion:
  - the checked canary now owns drag, pan, and zoom on the new substrate for one normal-zoom `settings` section
  - Gate 0 no longer lacks viewport ownership on this slice; the remaining near-term risk is DOM interaction/editing handoff on the same custom surface
- Next action:
  - prove one representative DOM-backed interaction/editing path still works correctly after the custom substrate takes drag/pan/zoom ownership, then expand canary coverage only if that handoff is stable

LOOP_TERMINAL_MARKER: none

## 2026-04-02 002

- Item: Add the first shared graph-substrate viewport transform helpers and route existing viewport math through them.
- Status: `done`
- Details:
  - Added `frontend/src/components/Pages/Project/graphSubstrate/viewportTransform.ts` as a pure source of truth for:
    - world-to-screen and screen-to-world point conversion
    - world/screen delta conversion
    - anchored zoom around a screen point
    - fit-to-bounds viewport resolution
  - Added focused Vitest coverage in `frontend/src/components/Pages/Project/graphSubstrate/viewportTransform.test.ts`.
  - Routed existing `xyflow` point conversion and fit-to-bounds math through the new helper in `frontend/src/forks/xyflow/core/utils/graph.ts`.
  - Routed `setCenter` through the same helper in `frontend/src/forks/xyflow/core/hooks/useViewportHelper.ts` so the current app path already shares the new transform contract.
  - This is still foundation work only:
    - no custom graph/runtime seam yet
    - no custom drag ownership yet
    - no Pixi body rendering
- Verification:
  - `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/viewportTransform.test.ts src/forks/xyflow/core/utils/graph.test.ts`
    - result: passed (`19 passed`)
  - CDP visual check
    - result: passed
    - note: fresh sub-agent bootstrap smoke opened the worktree bootstrap URL, observed redirects to `/home` and `/settings`, and saw no blank-screen regression on the settings surface
  - `pnpm -C frontend exec eslint src/components/Pages/Project/graphSubstrate/viewportTransform.ts src/components/Pages/Project/graphSubstrate/viewportTransform.test.ts src/forks/xyflow/core/hooks/useViewportHelper.ts src/forks/xyflow/core/utils/graph.ts`
    - result: not run cleanly
    - note: existing frontend eslint config failed to resolve `@eslint/js` in this environment; no dependency changes were made
- Conclusion:
  - the rewrite now has a reusable transform contract that is already exercised by the current app path
  - the next slice should stop at the nearest real composition boundary and introduce a `settings`-only custom viewport/runtime seam rather than another utility-only hop
- Next action:
  - add a stable custom viewport state model plus the first `settings` canary seam that consumes `viewportTransform.ts`

LOOP_TERMINAL_MARKER: none

## 2026-04-02 003

- Item: Land the first `UIPage`-level `settings` graph-substrate canary that renders one DOM-backed section outside `xyflow`.
- Status: `done`
- Details:
  - Added `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx`.
  - Added `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.ts` plus focused model coverage.
  - `frontend/src/components/Pages/Project/UiPage.tsx` now makes the first real implementation choice in this rewrite:
    - `settings` project + `All Settings` view mode uses the custom graph-substrate canary
    - all other routes/view modes still use legacy `ReactFlow`
  - The canary currently renders one visible top-level section with the existing DOM `SectionContainer` on a custom transformed surface.
  - The canary mirrors the current custom viewport into `useReactFlow` state so section internals that still read shared zoom continue to see the right transform on this slice.
  - Updated `frontend/tests/e2e/settings/settings-view-modes.spec.ts` so the `All Settings` expectation now checks for the custom canary rather than assuming the old all-`ReactFlow` path.
  - This intentionally stops the seam-lift lane at `UIPage`; the next useful work is interaction ownership inside the canary, not forwarding the same contract through more wrappers.
- Verification:
  - `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.test.ts`
    - result: passed (`3 passed`)
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts`
    - result: passed (`2 passed`, about `22s`)
  - CDP visual check
    - result: passed
    - note: the inherited bootstrap token/session was stale at first; one allowed `./aireset.sh` recovery started a fresh session and the follow-up CDP check on `http://127.0.0.1:3076/settings` verified:
      - `graph-substrate-canary` visible
      - exactly one `graph-substrate-canary-section` visible
      - surface not blank
      - `.react-flow__pane` absent on `All Settings`
- Conclusion:
  - the rewrite now has its first real product seam and no longer depends on `xyflow` ownership for the checked `UIPage` canary route selection
  - Gate 0 still is not complete because drag/pan/zoom ownership has not moved onto the new surface yet
- Next action:
  - implement top-level section drag on `SettingsGraphSubstrateCanary` and prove the DOM body stays attached while moving

LOOP_TERMINAL_MARKER: none

## 2026-04-02 004

- Item: Add custom top-level drag ownership to the `settings` graph-substrate canary and harden the shared viewport helpers for non-`xyflow` routes.
- Status: `done`
- Details:
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx` now owns drag on the checked canary slice instead of falling back to `xyflow` drag ownership.
  - The canary keeps a preferred visible section selected while dragging so the rendered card does not swap to another top-left candidate mid-move.
  - The canary uses a local position override during drag, then commits the final top-level position through the existing top-level layout persistence path on release.
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.ts` now prefers live `nodeInternals` geometry and supports preferred-section selection.
  - `frontend/src/forks/xyflow/core/hooks/useViewportHelper.ts` now no-ops when `d3Zoom` / `d3Selection` are absent, which fixes the canary-route crash that CDP found after the first drag implementation.
  - Added `frontend/src/forks/xyflow/core/hooks/useViewportHelper.test.ts` to lock down the null-d3 guard.
  - Updated `frontend/tests/e2e/settings/settings-view-modes.spec.ts` so the drag proof:
    - finds a real draggable point inside the canary section
    - verifies drag activation and movement
    - restores both top-level layout and the original active view mode afterward
- Verification:
  - `pnpm -C frontend exec vitest run src/forks/xyflow/core/hooks/useViewportHelper.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryModel.test.ts src/components/Pages/Project/graphSubstrate/viewportTransform.test.ts`
    - result: passed (`14 passed`)
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts`
    - result: passed (`3 passed`, about `32s`)
  - CDP visual check
    - result: passed
    - note: on `http://127.0.0.1:3075/settings`, `graph-substrate-canary` was visible, `.react-flow__pane` stayed absent on `All Settings`, the canary section body remained attached to its shell/header during drag and after release, and no route crash/error boundary appeared after drop
- Conclusion:
  - Gate 0 drag ownership now exists on the new substrate for the checked `settings` canary slice
  - the next useful frontier is custom pan/zoom ownership on the same surface, not more seam lifting or harness-only cleanup
- Next action:
  - implement custom pan/zoom on `SettingsGraphSubstrateCanary` and prove the DOM-backed section stays attached and visually stable during pan/zoom as well

LOOP_TERMINAL_MARKER: none

## 2026-04-02 006

- Item: Fix and prove section-title editing on the `settings` graph-substrate canary after custom pan/zoom ownership.
- Status: `done`
- Details:
  - `frontend/src/components/Section/Header/SectionTitle.tsx` now wraps editable section titles in both `nodrag` and `setta-prevent-section-on-click-trigger`.
  - This stops the custom canary section container from treating title double-clicks as drag starts and also avoids parent section activation consuming the same interaction.
  - `frontend/tests/e2e/settings/settings-view-modes.spec.ts` now includes a focused canary test that:
    - opens `All Settings`
    - pans and zooms the custom surface
    - double-clicks the visible section title into edit mode
    - renames the section through the DOM header input
    - restores the original section name afterward
- Verification:
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary (drags one section and persists the top-level layout|pans and zooms one section on the custom surface|keeps title editing working after pan and zoom)'`
    - result: passed (`3 passed`, about `37s`)
  - CDP visual check
    - result: passed
    - note: on `http://127.0.0.1:3075/settings`, `All Settings` showed the `gui` canary section title inside a `nodrag setta-prevent-section-on-click-trigger` wrapper, and double-clicking that title converted it into a focused header `input` on the live custom surface
- Conclusion:
  - the one-section `settings` graph-substrate canary now has a proven DOM-backed editing handoff after custom drag/pan/zoom ownership
  - the active Gate 0 interaction/editing gap on the checked slice is closed
- Next action:
  - expand the custom substrate beyond one top-level `All Settings` section while keeping DOM-backed bodies attached, interactive, and not obviously worse than the DOM baseline

LOOP_TERMINAL_MARKER: none
