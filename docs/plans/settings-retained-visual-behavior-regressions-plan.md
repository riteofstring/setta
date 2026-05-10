# Settings Retained Visual Behavior Regressions Plan

## Goal

Fix the current retained settings visual regressions with failing user-visible
tests first, then a single ownership model for row highlights, retained section
scrolling, and switch animation.

This plan covers the bugs shown in the two latest Chrome recordings and the
attached screenshots:

- the retained row hover/highlight band is visually too dark in dark mode
- same-direction scrolling inside a retained settings section visibly reverses
  before continuing
- retained switches animate non-monotonically, with the thumb and track snapping
  through contradictory states during one click

This supersedes the relevant parts of
`docs/plans/retained-canvas-visual-regression-stability-plan.md` for this
specific bug batch. Keep the older plan as background for retained canvas
architecture, but implement this plan against the current repro evidence.

## Recording Evidence

The current evidence is sufficient. Do not ask for another Chrome recording
before writing the first failing tests.

Latest recording bundles:

- `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260511-133350`
- `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260511-134126`

Useful facts from the bundles:

- `recording-20260511-133350` includes `1965` `gpu-flow-frame` events and
  `1299` `gpu-flow-retained-content-visual-state` events. The GUI switch
  changed repeatedly: `true -> false -> true -> false -> true -> false -> true`
  across frames `1, 155, 170, 186, 209, 229, 256`.
- `recording-20260511-134126` includes `1670` `gpu-flow-frame` events and
  `236` `gpu-flow-retained-content-visual-state` events.
- In both recordings, all retained section wheel input lands on the GPU canvas,
  so native DOM scroll behavior is not the owner of the visible jank.
- The GUI retained surface scroll offset moves backward during same-direction
  scroll input. In `134126`, the GUI surface climbs from `0` to about `145`,
  then backs up through `138`, `133`, jumps forward, then drops through `39`,
  `26`, `83`, and back to `0` before continuing. In `133350`, the same surface
  reaches `237`, then backs up through `233`, `220`, `199`, `176`, `91`, `137`,
  `91`, `68`, and `0` during the scroll sequence.
- Current tests already cover some retained behavior, but they do not fail for
  these visual regressions. For example, the switch test only proves that an
  intermediate frame exists; it does not prove the thumb moves monotonically
  toward the new state. The scroll tests do not assert monotonic visible motion
  during continuous wheel input. The hover tests assert coverage, not acceptable
  darkness/contrast.

## Step 1: Add Failing Visual Repro Tests First

Before changing implementation code, add or tighten Playwright visual tests
under `frontend/tests/e2e/settings/`. These tests must be run against the
current implementation and observed to fail for the visible reason under test.
If any proposed test passes, rewrite it before implementation continues.

Use real user input: pointer movement, clicks, wheel scrolling, keyboard
modifiers when needed, and viewport interactions. Internal retained diagnostics
may locate stable screenshot clips and be attached to failures, but the
assertions must judge the rendered result a user sees.

Required red tests:

1. Row highlight darkness:
   - Open `/settings`, fit the `gui` settings section, and hover
     `Left Side Pane Shifts Map`.
   - Capture a stable row clip before hover and during hover.
   - Assert the hover band remains visibly present but does not reduce row text
     contrast or background luminance beyond an allowed dark-mode threshold.
   - The current `rgba(30, 41, 59, 0.72)` dark hover overlay should fail this
     threshold if it produces the captured dark band.

2. Switch animation monotonicity:
   - Click `Left Side Pane Shifts Map` once.
   - Capture a tight switch clip at `0ms`, then several frames over the first
     transition window, then the settled frame.
   - Detect the switch thumb centroid and track color from pixels.
   - Assert thumb motion is monotonic toward the final side, never reverses more
     than a 1px tolerance, and the track does not flip between contradictory
     checked/unchecked colors after the value changes.
   - This replaces the weaker existing assertion that merely requires any
     intermediate frame.

3. Retained section scroll monotonicity:
   - Place the pointer over the visible `gui` retained section and send a
     same-direction wheel sequence matching the recording cadence.
   - Capture the retained content clip and scrollbar clip after each wheel or
     after each animation frame flush.
   - From pixels, derive either scrollbar thumb top or row/text-band vertical
     displacement.
   - Assert same-direction scroll never visibly moves backward by more than a
     small tolerance and never snaps to the top while wheel deltas continue in
     the same direction.
   - The current scroll offset reversals in the recordings should make this
     fail.

4. Regression bundle test:
   - Add one short end-to-end scenario that combines hover, switch click, and
     retained scroll on the `gui` section.
   - It should assert the final visual state is coherent and attach the
     per-frame screenshots. This catches cross-owner regressions where each
     isolated behavior looks acceptable but the combined user path fails.

## Step 2: Fix Row Highlight Ownership And Contrast

Treat hover/highlight as transient row state, not durable retained page content.
The current owner is primarily:

- `frontend/src/gpuFlow/retainedContentRowHover.ts`
- `frontend/src/gpuFlow/retainedContentCanvasTheme.ts`
- row state drawing in `frontend/src/gpuFlow/retainedContentRowCanvas.ts`

Implementation requirements:

- Keep the highlight as a current-frame visual owner aligned to the row's full
  visible bounds.
- Define a dark-mode hover color that preserves text contrast and stays subtle
  at the current section scale. Prefer an explicit palette value with measured
  contrast, not an opacity guess.
- Do not remove legitimate focus, selected, search, or active-control states.
  The test should distinguish hover from focus/selection.
- Avoid making hover create retained content version churn or full-surface
  texture uploads.

Acceptance:

- The hover band is visible but not darker than the normal row by enough to
  obscure text.
- Exactly the intended row is highlighted.
- The screenshot test fails before and passes after the change.

## Step 3: Make Retained Scroll Updates Single-Writer And Monotonic

The scroll evidence points at stale or competing retained scroll offset writers.
Likely owner paths:

- `frontend/src/gpuFlow/interactions/retainedContentScroll.ts`
- `frontend/src/gpuFlow/retainedContentScroll.ts`
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.ts`
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuRetainedParamInteractionAdapter.tsx`

Implementation requirements:

- During one wheel gesture, compute each new offset from the latest committed or
  pending offset for that surface, never from a stale scene snapshot.
- Coalesce pending wheel deltas per surface in order. A later flush must not
  overwrite a newer pending offset with an older map.
- Keep retained content offset state keyed by stable surface ID and clamp only
  against current content and viewport bounds.
- Make the frame visual state read from the same offset owner used by hit
  testing, scrollbar drawing, retained DOM island placement, and texture source
  windows.
- If viewport pan/zoom and retained content wheel scroll can both run in nearby
  frames, define explicit ownership so viewport transform updates cannot reset
  content offsets.

Acceptance:

- Same-direction wheel input produces monotonic visible content motion and
  scrollbar thumb motion.
- Scroll offsets do not snap to `0` unless content bounds truly require it.
- Existing reveal, keyboard navigation, scrollbar drag, and param drag
  auto-scroll tests still pass.

## Step 4: Make Switch Animation Frame-Owned And Monotonic

The switch animation store exists, but the visible sequence can still jump
between contradictory states. Relevant owners:

- `frontend/src/gpuFlow/retainedContentSwitchAnimation.ts`
- `frontend/src/gpuFlow/retainedContentSwitchCanvas.ts`
- `frontend/src/gpuFlow/retainedContentCanvasCommands.ts`
- `frontend/src/gpuFlow/GpuFlow/retainedContentControllers.ts`
- `frontend/src/gpuFlow/GpuFlow/flowFrame.tsx`

Implementation requirements:

- Start a switch transition exactly once per logical value change.
- Keep settings state updates immediate; animation is visual only.
- Request frames while any switch transition is active.
- Render the switch thumb from transition progress for every frame until
  settled.
- Ensure retained page replacement, texture upload, or content signature changes
  cannot regress the displayed thumb back toward the old side.
- Track color and thumb position must agree about the logical direction. If the
  track color updates immediately, the thumb may animate, but it may not snap
  old/new/old/new during one click.
- Respect reduced-motion as a deliberate snap path only when the browser reports
  reduced motion; test default and reduced-motion separately.

Acceptance:

- The new monotonic switch screenshot test fails before and passes after.
- A single click never shows a right-side thumb, then a left-side thumb, then a
  right-side thumb again for one value transition.
- Texture upload diagnostics do not show full retained section churn just for
  switch progress frames.

## Step 5: Keep Diagnostics, But Do Not Test Internals As Behavior

The current recordings had enough evidence for this plan, so no logging is
needed before the first failing tests. Add small diagnostics only if they make a
failed visual test easier to debug.

Useful additions if needed:

- Include the retained surface's committed offset, pending offset, and scene
  offset in `gpu-flow-retained-content-visual-state`.
- Include active switch transition progress per visible switch.
- Include the resolved row hover target and palette color used for the current
  frame.

These values are debug attachments only. The pass/fail assertions remain based
on screenshots and visible motion.

## Step 6: Verification Gate

Focused verification:

- Run the new Playwright visual spec and confirm it fails before implementation.
- After fixes, run the same spec through `./scripts/run-playwright-e2e.sh`.
- Run focused Vitest coverage for changed retained scroll, hover, and switch
  owner modules with `pnpm -C frontend exec vitest run <paths>`.
- Run the existing retained settings specs that previously failed to catch this:
  `settings-retained-visual-regressions.spec.ts`,
  `settings-retained-interaction-stability.spec.ts`, and
  `settings-retained-scroll-performance.spec.ts`.
- Use Chrome DevTools visual verification on `/settings` after the fix.

Final gate:

- `./scripts/quality/check.sh`
- Final UI response must include `CDP visual check: done (...)` or
  `CDP visual check: not run (reason)`.
