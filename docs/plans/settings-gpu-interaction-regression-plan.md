# Settings GPU Interaction Regression Plan

## Goal
Fix the settings GPU surface interaction regressions shown in the latest Chrome
recording, and replace the current weak coverage with user-path tests that fail
when settings rows, retained controls, resize handles, or the pane itself get
stuck behind stale interaction state.

This plan is based on the latest recording bundle:

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260507-184708`

## Current Evidence
The latest recording contradicts the previous verification.

- The visible settings screenshot still shows a blue/cyan active band across the
  `Left Side Pane Shifts Map` row inside `settings-section__gui`.
- After settings opens, many click events resolve only to the GPU wrapper or the
  canvas, not to a specific retained row/control. The recording currently cannot
  tell which retained row or control should have owned the click.
- `gpu-flow-frame` app-state samples show `activeNodeId:
  "settings-section__gui"` staying active across long interaction windows,
  including resize/paint/animation frames.
- Pointer capture transitions are suspicious: many interactions have
  `pointerdown` on the canvas and `pointerup` on the wrapper div, and some later
  clicks record only `pointerup` without a matching recorded `pointerdown`.
- The frame diagnostics only include renderer-level data such as active node ID,
  upload diagnostics, viewport, and texture counts. They do not include retained
  hit-test owner, selected/highlighted row, active DOM island, node drag/resize
  state, pane drag state, selection bounds, or element-from-point diagnostics.

## Why The Existing Tests Failed Us
The tests that were used are not enough for this bug class.

- `frontend/tests/e2e/sections/section-sizing.spec.ts` directly calls
  `setActiveSectionIds` through `page.evaluate`. That can make resize handles
  appear without proving that the real section click path, hit testing, active
  state ownership, and pointer capture cleanup work.
- Several retained-param tests compute target points from internal scene data.
  That is useful for narrow geometry tests, but it does not prove that a user can
  repeatedly click visible controls after scrolling, resizing, and interacting
  with other controls.
- Existing settings tests mostly assert that nodes are visible and that view
  modes contain the expected count. They do not assert row highlight cleanup,
  retained control ownership, pointer state cleanup, or post-interaction
  operability.
- The previous visual verification was too narrow. It did not validate the exact
  settings GUI surface after a click-around sequence like the recording.

## Non-Negotiables
No future fix for this area is done until these conditions are met.

- Reproduce the recording behavior first, with a failing Playwright or CDP
  scenario, before making the behavioral fix.
- Do not use direct UI-store mutation to activate settings sections in the
  regression test. Setup may use backend/project APIs, but the tested
  interaction must use real pointer, wheel, keyboard, and focus events.
- Assert both visual state and operability. A test that only checks DOM presence
  or layout dimensions is not sufficient.
- Every pointer sequence must end with clean state: no stale active resize, node
  drag, pane drag, marquee selection, retained scrollbar drag, active retained
  popup, or stuck selected/highlighted retained row unless that state is expected
  and visible.
- Keep the root fix in the GPU flow/project-surface owner paths. Do not hide the
  problem by removing useful focus states or adding broad catch-all fallbacks.

## Phase 1: Build A Real Repro
Add a focused settings regression spec, likely:

`frontend/tests/e2e/settings/settings-gpu-interaction-regression.spec.ts`

The spec should open `/settings` from the real home/settings route and exercise
`settings-section__gui` the way the recording does:

1. Open settings from the home left rail.
2. Zoom/scroll the GPU pane to the GUI section.
3. Click several visible settings rows and controls, including a switch, a
   dropdown, and a text/numeric field.
4. Wheel-scroll inside the section.
5. Resize the GUI section with a real pointer gesture.
6. Click outside the row/control, then click another control.
7. Assert the section remains interactive after every step.

Required assertions:

- The visible hit target under each click is inside the GPU pane and maps to the
  expected retained control or resize handle.
- The blue row highlight is absent after pointer release unless a focused
  control intentionally owns that exact focus/selection state.
- The GUI section can still toggle a switch, open and close a dropdown, focus a
  text/numeric field, and resize after the click-around sequence.
- `settings-section__gui` does not remain the active interaction node after a
  control click has ended, except during the short animation/paint window that is
  explicitly allowed by the owner logic.
- The pane canvas/wrapper does not intercept a click that should belong to a
  retained control or DOM island.

## Phase 2: Add Missing Diagnostics
The current Chrome recording is not enough to identify the exact stale state
owner. Add diagnostics behind a development/debug flag and include them in
`gpu-flow-frame` app-state payloads so the recorder captures them.

Add frame fields for:

- active interaction mode: none, node resize, node drag, pane drag, retained
  content drag, retained scrollbar drag, selection drag, connection, or DOM
  island editing
- active node ID and why it is retained/interactive
- selected/hovered/pressed retained row ID and retained control ID
- retained hit result under the current pointer: surface ID, row ID, control ID,
  hit kind, local rect, and owner section ID
- `document.elementFromPoint` summary under the pointer
- active DOM island section/param IDs and focus owner
- `nodesSelectionBounds` and user-selection/marquee state
- pointer capture owner, last pointerdown target, last pointerup target, and
  whether capture was released
- active retained popup and retained scrollbar drag state

Also improve `./scripts/record-chrome-repro.sh` output for this class of bug:

- capture at least one screenshot on start, after each click, after each resize
  release, and at shutdown
- include a pointer-location overlay or event coordinate log that can be matched
  to screenshots
- include a compact app-state summary around each click/pointerup event

No external tooling is required before starting the fix. The missing piece is
in-repo logging/recording detail, not a new third-party tool.

## Phase 3: Identify The Highlight Owner
Trace the blue band to its real source before changing styling.

Likely owners to audit:

- retained row drawing in
  `frontend/src/gpuFlow/retainedContentRowCanvas.ts`
- retained control drawing in
  `frontend/src/gpuFlow/retainedContentControls.ts` and related canvas files
- retained hit/interaction state in
  `frontend/src/gpuFlow/interactions/retainedContentInteraction.ts`
- selection bounds in `frontend/src/gpuFlow/selectionBounds.ts` and
  `frontend/src/gpuFlow/interactions/selection.ts`
- active-node rendering and resize overlays in
  `frontend/src/gpuFlow/GpuFlow/*`
- settings retained-param adapters under
  `frontend/src/components/Pages/Project/GpuProjectSurface/*RetainedParam*`

The fix should clear stale hover/pressed/selected row state on pointerup,
pointercancel, lostpointercapture, scroll, pane click, and DOM island
deactivation as appropriate. It must not remove the legitimate focus indicator
for the currently focused control.

## Phase 4: Fix Interaction State Cleanup
Audit every path that can leave the GUI section active or non-interactive after
real input:

- `frontend/src/gpuFlow/GpuFlow/flowSurface.tsx`
- `frontend/src/gpuFlow/GpuFlow/sourceInteraction.ts`
- `frontend/src/gpuFlow/GpuFlow/retainedContentControllers.ts`
- `frontend/src/gpuFlow/interactions/retainedContentInteraction.ts`
- `frontend/src/gpuFlow/interactions/nodeResize.ts`
- `frontend/src/gpuFlow/interactions/nodeDrag.ts`
- `frontend/src/gpuFlow/interactions/selectionDrag.ts`
- `frontend/src/gpuFlow/htmlSurfaces/frame.tsx`
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuActiveParamDomIslandDeactivation.ts`

Specific cleanup requirements:

- pointerup, pointercancel, blur, lostpointercapture, and Escape must converge
  through explicit cleanup paths instead of leaving owner-specific state behind
- retained control interactions must release capture/state even when pointerup
  lands on the wrapper div instead of the canvas
- resize handles must not keep the section active after the resize settles
- scrolling a retained section must not leave the last row highlighted as a
  pressed/dragged row
- clicking a retained control must not make the pane overlay steal subsequent
  events

## Phase 5: Replace Weak Regression Coverage
Add tests at three levels.

1. User-path E2E:
   `frontend/tests/e2e/settings/settings-gpu-interaction-regression.spec.ts`
   opens settings, uses real pointer/wheel/keyboard input, and proves the GUI
   section remains operable after the exact click-around/scroll/resize sequence.

2. Focused retained interaction tests:
   Add Vitest coverage near
   `frontend/src/gpuFlow/interactions/retainedContentInteraction.test.ts` for
   pointerup, pointercancel, lostpointercapture, scroll, and pane click cleanup.

3. Frame diagnostics tests:
   Extend `frontend/tests/e2e/gpuFlowPerformanceProbe.test.ts` or add a focused
   recorder payload test so `gpu-flow-frame` diagnostics keep exposing the state
   needed to debug this class of regression.

Tests must not be tautological. In particular, the E2E test must not compute the
expected result by duplicating the same retained hit-test logic under test.

## Phase 6: Verification Gate
The fix is accepted only after all of this is true:

- The new settings regression test fails before the fix and passes after it.
- The latest Chrome recording sequence can be rerun without the blue stuck row
  highlight and without losing section interactivity.
- `pnpm -C frontend exec vitest run` is run on the touched GPU flow tests.
- The relevant Playwright spec is run through `./scripts/run-playwright-e2e.sh`.
- `./scripts/quality/check.sh` passes for the final changed files.
- Final UI response includes `CDP visual check: done (...)` with the settings
  GUI screenshot or `CDP visual check: not run (reason)` if the browser tooling
  is unavailable.

## Tooling And Logging Needed
The immediate fix does not need more external tooling. It does need better
first-party recording data.

Required additions:

- `gpu-flow-frame` diagnostics for retained hit owner, active interaction mode,
  active DOM island, selection bounds, pointer capture owner, and row/control
  highlight state.
- Chrome recording screenshots around click, wheel, resize release, and final
  state.
- A small debug helper callable from Playwright/CDP that returns the live GPU
  interaction snapshot for a screen point.

Without these, the next failure will again be diagnosed from screenshots and
guesswork instead of from owner-state evidence.
