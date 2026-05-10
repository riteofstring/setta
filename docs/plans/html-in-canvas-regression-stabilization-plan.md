# HTML-In-Canvas Regression Stabilization Plan

## Goal

Stop the current cycle where one HTML-in-canvas fix creates another visible
regression. The immediate bugs are:

- retained switch animation shows contradictory thumb/track states during one
  click
- main canvas scroll panning stops when the mouse moves over a section during
  the same wheel/trackpad gesture

The broader problem is process: a change must not be called fixed until the
specific visible failure has a failing test first, a passing test after the
implementation, and browser evidence attached to the result.

## Current Evidence

The switch screenshots show one click producing non-monotonic visual state:

- the track appears checked while the thumb is still left
- the thumb jumps right, then back left or center, then right again
- the final state is not the only state transition shown to the user

The panning regression is scroll panning, not pointer dragging. It is
attributed to `93d605646d5f37adac4a6febdc9f5823013ff0e8`, which changed
retained visual ownership in these areas:

- `frontend/src/gpuFlow/GpuFlow/retainedContentControllers.ts`
- `frontend/src/gpuFlow/interactions/retainedContentScroll.ts`
- `frontend/src/gpuFlow/retainedContentRowHover.ts`
- `frontend/src/gpuFlow/retainedContentSwitchAnimation.ts`
- `frontend/tests/e2e/settings/settings-retained-visual-regressions.spec.ts`

The current `panZoom` unit coverage is not enough for this regression. It checks
wheel delta handling inside the viewport controller, but it does not prove
ownership between viewport scroll panning and retained-section wheel scrolling.
The missing test is: start a wheel/trackpad scroll-pan burst on the blank canvas,
move the mouse over a retained section while the burst is still active, then
continue wheeling and assert the viewport keeps moving instead of retained
content consuming the event.

## Non-Negotiable Fix Policy

For these bugs, implementation starts only after a test or reproducible browser
check fails for the observed reason. A passing test that does not fail on the
current regression is not coverage.

Do not claim "fixed" from code inspection. A fix claim requires:

- failing test or captured repro before the change
- implementation commit or patch
- same test passing after the change
- focused adjacent tests passing
- CDP or Playwright visual check for the user-visible path
- a short note explaining what used to fail and what evidence now passes

If the browser result is ambiguous, the status is "not proven", not "fixed."

## Phase 1: Reproduce And Lock The Failures

Add focused Playwright coverage before changing runtime code. Prefer
`frontend/tests/e2e/settings/settings-retained-visual-regressions.spec.ts` for
settings-retained behavior unless a smaller dedicated spec is clearer.

Required red tests:

1. Switch animation frame sequence:
   - Open `/settings`.
   - Locate `Left Side Pane Shifts Map`.
   - Capture a tight switch clip before click, then capture frames using
     `requestAnimationFrame` timing through the animation window.
   - Assert thumb center moves monotonically toward the final side.
   - Assert track color and thumb side do not represent contradictory logical
     states after the click.
   - Run both directions: checked to unchecked and unchecked to checked.
   - Include a rapid double-toggle case so transition reversal is explicit and
     monotonic from the current visual progress, not from a stale endpoint.

2. Canvas scroll pan across section:
   - Open a project/settings canvas with at least one visible section.
   - Start scroll panning on empty canvas with a plain wheel event.
   - Move the mouse over the nearest section body and retained row/control area
     while the viewport `panScrolling` burst is active.
   - Continue plain wheel events while the mouse is over the section.
   - Read `window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport.transform`
     after each wheel event.
   - Assert transform continues changing while the mouse is over the section.
   - Assert `panScrolling` remains true through the burst.
   - Assert retained row hover/control ownership does not become active during
     the active viewport scroll-pan burst.

3. Active viewport scroll pan does not wake retained scroll/hover/control
   owners:
   - During the scroll-pan-over-section sequence, assert retained content does
     not update its own scroll offsets.
   - The section may be hit-tested for visual projection, but active viewport
     scroll panning remains the owner of plain wheel events until the
     `panScrolling` burst ends.

4. Existing visual bundle stays green:
   - Keep the existing hover, scroll, switch, and scrollbar visual tests.
   - Tighten only where they failed to catch this regression.
   - Do not replace visible assertions with internal state-only assertions.

## Why The Existing Tests Missed This

The pan gap is direct: the lower-level wheel tests did not cover the interaction
between `panZoom` and `retainedContentScroll`. The retained scroll controller
could consume wheel events over a section while viewport `panScrolling` was
already active.

The existing e2e pan helpers mostly use panning as setup. They did not assert
continuous viewport movement when the mouse moves from blank canvas to retained
section content during a wheel/trackpad burst. A helper can finish with a
changed viewport even if movement stopped for the section-overlap part of the
gesture.

The switch gap is that current visual analysis is too permissive for the failure
shown in the screenshots. A test must reject contradictory frame sequences, not
just require a few distinct thumb positions or an intermediate frame. The
assertion needs to verify thumb position, track state, and direction together
for every sampled frame.

## Phase 2: Fix Scroll-Pan Ownership

Relevant code:

- `frontend/src/gpuFlow/interactions/panZoom.ts`
- `frontend/src/gpuFlow/interactions/retainedContentInteraction.ts`
- `frontend/src/gpuFlow/interactions/retainedContentScroll.ts`
- `frontend/src/gpuFlow/interactions/wheelOwnership.ts`
- `frontend/src/gpuFlow/GpuFlow/sourceInteraction.ts`
- `frontend/src/gpuFlow/htmlSurfaces/interactionProjector.ts`
- `frontend/src/gpuFlow/GpuFlow/retainedContentControllers.ts`

Implementation direction:

- Treat active viewport scroll-pan as the exclusive plain-wheel owner until the
  `panScrolling` burst ends.
- Use the shared wheel-ownership predicate for retained content so
  `panScrolling`, `wheelZooming`, `paneDragging`, and `pointerPanning` are all
  blocking states for retained wheel consumption.
- Retained content may handle its own wheel scroll only when no viewport wheel
  gesture is active and the target is not a native wheel target.
- Preserve transform-only viewport frames during scroll pan, then request the
  texture-upload frame when the `panScrolling` timeout ends.

Acceptance:

- The new scroll-pan-over-section Playwright test fails before the fix and
  passes after it.
- `retainedContentScroll.test.ts` covers the exact ownership case: while
  `panScrolling` is true, retained scrolling skips the wheel event so the
  viewport controller can continue panning.
- Existing retained click, drag, scrollbar, and native-island tests still pass.
- Panning remains transform-only during the wheel burst.

## Phase 3: Fix Switch Animation Ownership

Relevant code:

- `frontend/src/gpuFlow/retainedContentSwitchAnimation.ts`
- `frontend/src/gpuFlow/retainedContentSwitchCanvas.ts`
- `frontend/src/gpuFlow/retainedContentCanvasCommands.ts`
- `frontend/src/gpuFlow/GpuFlow/retainedContentControllers.ts`
- `frontend/src/gpuFlow/GpuFlow/flowFrame.tsx`

Implementation direction:

- Separate logical checked state from visual animation progress.
- Start a transition exactly once per logical value change.
- On reversal, start from the current rendered progress, not from the previous
  logical endpoint.
- Render track and thumb from a coherent transition model. If the product wants
  track color to change immediately, the thumb must still move monotonically and
  never visually contradict the target direction.
- Request viewport/manual frames while any switch transition is active.
- Do not let retained page redraw, row hover redraw, texture upload, or scene
  replacement reset switch progress to `checked ? 1 : 0` mid-transition.
- Reduced-motion remains the only intentional snap path.

Acceptance:

- Switch tests fail on the screenshot sequence and pass after the fix.
- A single click cannot produce right-left-right or left-right-left thumb motion.
- Track state and thumb travel are coherent in every captured frame.
- Rapid toggle reversal remains smooth from the current thumb position.
- Focused Vitest coverage covers the transition store, including reversal,
  missing surface cleanup, reduced motion, and active-surface lifetime.

## Phase 4: Strengthen Visual Analysis

Current visual analysis helpers under
`frontend/tests/e2e/settings/settings-retained-visual-analysis.ts` should be
extended instead of scattering ad hoc pixel logic through specs.

Add or tighten helpers for:

- locating switch bounds from either checked or unchecked state
- detecting track color state per frame
- detecting thumb center independent of whether the track is blue or neutral
- normalizing direction explicitly from initial and final logical state
- producing failure JSON with frame name, thumb center, track state, progress,
  and screenshot attachment name

Avoid fragile pass conditions:

- "at least N distinct positions" is not enough
- "has an intermediate frame" is not enough
- normalized progress is not enough if the detector loses the thumb in the bad
  frames

## Phase 5: Regression Gates

Focused commands for this bug batch:

```bash
pnpm -C frontend exec vitest run \
  src/gpuFlow/interactions/panZoom.test.ts \
  src/gpuFlow/interactions/retainedContentInteraction.test.ts \
  src/gpuFlow/retainedContentSwitchAnimation.test.ts \
  src/gpuFlow/retainedContentSwitchCanvas.test.ts
```

```bash
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/settings/settings-retained-visual-regressions.spec.ts \
  frontend/tests/e2e/settings/settings-retained-pan-ownership.spec.ts
```

Before finishing a fix:

```bash
./scripts/quality/check.sh
```

For UI-visible work, the final response must include the required repository
line:

```text
CDP visual check: done (...)
```

or:

```text
CDP visual check: not run (reason)
```

## Working Agreement For Future HTML-In-Canvas Changes

Every HTML-in-canvas change must name the interaction owner it affects:

- viewport pan/zoom
- section drag/resize
- retained row hover
- retained control click/drag
- retained scroll
- native DOM island
- projected HTML source interaction
- texture upload/dirty tracking

If a change crosses owners, add a browser test that exercises the owner
boundary. Examples:

- scroll pan over a retained section
- hover after pan/zoom
- click retained control after scroll
- drag retained scrollbar after viewport transform
- open a native island and pan while its overlay is visible

Do not rely on jsdom-only tests for event ownership boundaries. They are useful
for algorithms and small controller invariants, but they cannot prove browser
wheel targeting, event ordering, `pointer-events`, or canvas/source projection
behavior.

## Reporting Template

Use this template when closing the bug:

```text
Fixed:
- switch animation no longer backtracks; evidence: <test command> passed and
  CDP/Playwright frame capture shows monotonic thumb centers
- scroll panning continues across sections; evidence: <test command> passed and
  viewport transform changes through every section-overlap wheel segment

Regression coverage added:
- <test file>: <test name>

Verification:
- <focused vitest command>
- <focused playwright command>
- ./scripts/quality/check.sh
- CDP visual check: done (...)
```

If any line cannot be filled with real evidence, the bug is not done.
