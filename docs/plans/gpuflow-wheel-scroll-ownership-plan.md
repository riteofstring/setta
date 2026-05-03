# GpuFlow Wheel Scroll Ownership Plan

## Goal

Fix two wheel handoff bugs in GpuFlow:

- If the user is already panning the viewport with wheel/trackpad scrolling,
  moving the pointer over a scrollable section or retained-content surface must
  not transfer ownership to section scrolling.
- If the user is scrolling inside a section or retained-content surface and
  that scroll reaches its boundary, the same wheel gesture must not fall
  through into viewport panning.

The intended rule is simple: wheel gestures need one owner for the duration of
the active burst. Viewport wheel pan owns wheel input until the pan burst ends.
Scrollable section content owns wheel input while the pointer is over a
scrollable target, including boundary events that do not change the scroll
offset.

Completion sentinel for automated loops:

`GPUFLOW_WHEEL_SCROLL_OWNERSHIP_PLAN_COMPLETE`

Suggested loop command:

```sh
./scripts/run-codex-plan-loop.sh \
  --plan docs/plans/gpuflow-wheel-scroll-ownership-plan.md \
  --sentinel GPUFLOW_WHEEL_SCROLL_OWNERSHIP_PLAN_COMPLETE \
  --name gpuflow-wheel-scroll-ownership \
  --commit-prefix "gpuflow-scroll:"
```

## Current Evidence

Relevant code paths:

- `frontend/src/gpuFlow/interactions/panZoom.ts`
  - Handles wheel panning on the GpuFlow container.
  - Sets viewport-store `panScrolling: true` during a wheel-pan burst and clears
    it after `150ms`.
  - Runs as a non-capture wheel listener, after capture-phase scroll
    controllers have had a chance to consume the event.
- `frontend/src/gpuFlow/interactions/retainedContentScroll.ts`
  - Runs in capture phase.
  - Consumes the wheel event only when
    `resolveGpuRetainedContentWheelScrollOffset` returns `changed: true`.
  - If a retained surface is at top/bottom and the offset does not change, the
    event falls through to viewport pan.
- `frontend/src/gpuFlow/interactions/sceneScroll.ts`
  - Runs in capture phase.
  - Has the same changed-only consume behavior for section scene scrolling.
- `frontend/src/gpuFlow/retainedContentScroll.ts` and
  `frontend/src/gpuFlow/sceneScroll.ts`
  - Current result types do not distinguish "no scroll target under the mouse"
    from "scroll target exists but is already at its boundary".

This explains both bugs:

- During viewport wheel pan, `panScrolling` is already true from a previous
  wheel event, but retained/section scroll controllers do not check that state
  before claiming later wheel events under the pointer.
- During section/retained scrolling, boundary events produce no changed offset,
  so the event is left for `panZoom.ts`, which then starts panning the viewport.

## Scope Rules

- Only fix GpuFlow wheel ownership between viewport pan, retained-content
  scrolling, and section scene scrolling.
- Do not change pointer-drag panning, keyboard scrolling, scrollbar dragging,
  search reveal, or retained-content performance unless directly required by
  the wheel ownership contract.
- Do not add hidden renderer fallbacks or old/new behavior switches.
- Do not use pointer movement heuristics. Use explicit controller state and
  typed resolver results.
- Preserve native DOM wheel behavior for inputs, textareas, contenteditable
  controls, and explicit `nowheel` / `data-gpu-flow-wheel-target` regions.

## Desired Contract

Add one shared wheel ownership model for GpuFlow wheel controllers:

- Viewport active gestures:
  - If the viewport store says `panScrolling`, `pointerPanning`,
    `paneDragging`, or `wheelZooming`, retained-content and section scene wheel
    controllers must not claim wheel events.
  - In that state they should return early without calling
    `preventDefault()`, so the current viewport owner can continue handling the
    burst.
- Scrollable content targets:
  - If a wheel event hits a retained-content or section-scene scroll target with
    available scroll range, that controller owns the event.
  - If the wheel changes the target offset, consume the event and apply the
    scroll update.
  - If the target is at the relevant boundary and the offset cannot change,
    still consume the event, but do not update scroll state or request a scroll
    frame.
- No target:
  - If no scrollable retained/section target is under the pointer, do not
    consume the event. Let pan/zoom decide whether viewport panning should
    happen.

The result types should make this explicit. Avoid interpreting
`changed: false` as "not handled"; use a separate field such as
`handled`, `targeted`, or `ownerSurfaceId` / `ownerSectionId`.

## Acceptance Criteria

Behavior:

- Start wheel-panning the GpuFlow viewport over empty canvas, continue the same
  wheel burst while the pointer is over
  `settings-section__sectionSizingPolicy:param-content:unpinned`; the viewport
  keeps panning and retained-content offset does not change.
- Start wheel-panning the viewport, continue while the pointer is over a
  scrollable section scene; the viewport keeps panning and section scroll offset
  does not change.
- Start retained-content wheel scrolling, continue past top and bottom
  boundaries; retained offset clamps and viewport transform does not change.
- Start section scene wheel scrolling, continue past top and bottom boundaries;
  section offset clamps and viewport transform does not change.
- Horizontal and shift-wheel boundary events do not leak into viewport pan when
  a scrollable content target owns the gesture.
- Wheel events over non-scrollable areas still fall through to viewport pan.
- Native DOM wheel targets still behave natively and are not swallowed by the
  canvas controllers.

Verification:

- Unit coverage proves the controller-level ownership contract for retained
  content, section scene scroll, and pan/zoom interaction ordering.
- Browser verification on `/settings` covers both target surfaces:
  - `settings-section__sectionSizingPolicy:param-content:unpinned`
  - at least one dense or ordinary Settings surface with section overflow
- No console errors or retained/GPU errors during the repro.
- CDP or Chrome repro evidence records viewport transform and content scroll
  offsets before/after each scenario.

## Phase 1: Add Failing Ownership Tests

Files likely involved:

- `frontend/src/gpuFlow/interactions/retainedContentScroll.test.ts`
- `frontend/src/gpuFlow/interactions/sceneScroll.test.ts`
- `frontend/src/gpuFlow/interactions/panZoom.test.ts`
- A new focused interaction test file if cross-controller ordering is clearer
  there.

Work:

- Add retained-content tests for:
  - skips retained wheel handling while `panScrolling` is true.
  - skips retained wheel handling while `pointerPanning` / `paneDragging` is
    true.
  - consumes a wheel event at retained vertical boundary without calling
    `onScrollOffsetsChange`.
  - consumes shift-wheel / horizontal boundary events when the retained target
    owns the gesture.
- Add section scene scroll tests for the same active-pan and boundary behavior.
- Add an integration-style listener ordering test:
  - attach retained or section scroll controller in capture phase.
  - attach pan/zoom wheel handling on the same element.
  - prove boundary wheel events do not reach pan/zoom.
  - prove active viewport pan causes retained/section scroll controllers to
    skip and lets pan/zoom continue.

Acceptance:

- Tests fail against the current code for both bugs.
- Tests assert event consumption, scroll-offset mutation, and viewport transform
  mutation separately, so a later implementation cannot pass by swallowing all
  wheel events.

## Phase 2: Add Shared Active Viewport Gesture Guard

Files likely involved:

- `frontend/src/gpuFlow/interactions/retainedContentScroll.ts`
- `frontend/src/gpuFlow/interactions/sceneScroll.ts`
- Possibly a small shared helper under `frontend/src/gpuFlow/interactions/`.

Work:

- Add a typed helper such as `isGpuViewportWheelGestureActive(store)` that
  checks the viewport interaction flags:
  - `panScrolling`
  - `pointerPanning`
  - `paneDragging`
  - `wheelZooming`
- Call this helper from retained-content and section scene wheel controllers
  before resolving scroll targets.
- Apply this only to wheel events. Keyboard scroll and explicit scrollbar drag
  should not be blocked by wheel-pan burst state unless a test proves they need
  the same ownership rule.

Acceptance:

- While viewport pan/zoom is active, retained-content and section scene
  controllers do not call scroll resolvers, do not mutate offsets, and do not
  consume the event.
- Existing native wheel target preservation remains unchanged.

## Phase 3: Distinguish Boundary Ownership From No Target

Files likely involved:

- `frontend/src/gpuFlow/retainedContentScroll.ts`
- `frontend/src/gpuFlow/sceneScroll.ts`
- `frontend/src/gpuFlow/interactions/retainedContentScroll.ts`
- `frontend/src/gpuFlow/interactions/sceneScroll.ts`
- Existing retained/section scroll tests.

Work:

- Extend retained-content wheel resolution to return an explicit ownership
  result:
  - no target under pointer
  - target owns wheel but offset unchanged
  - target owns wheel and offset changed
- Preserve the current fail-loud validation for invalid geometry and offsets.
- Extend section scene wheel resolution with the same ownership distinction.
- Update controllers so:
  - `changed: true` consumes event, applies scroll state, and requests a frame.
  - `handled/targeted: true` with no change consumes event and stops
    propagation, but does not update state or request a frame.
  - no target leaves the event alone for pan/zoom.
- Keep map allocation and scene update behavior on the changed path only.
  Boundary no-op events must stay cheap.

Acceptance:

- Boundary events no longer fall through to viewport pan.
- Non-target events still fall through to viewport pan.
- Existing scroll clamping tests remain meaningful and cover both top and
  bottom boundaries.

## Phase 4: Verify Pan/Zoom Does Not Regress

Files likely involved:

- `frontend/src/gpuFlow/interactions/panZoom.ts`
- `frontend/src/gpuFlow/interactions/panZoom.test.ts`
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuSurface.tsx`

Work:

- Verify `panZoom.ts` does not need a new ownership field. It should remain the
  fallback owner after capture-phase scroll controllers decline an event.
- If needed, add a narrowly scoped assertion that viewport pan continues during
  an active `panScrolling` burst even when the pointer is currently over a
  scrollable scene area.
- Confirm project-level `disabled` callbacks continue to handle zoom activation
  keys without competing with the new active-gesture guard.

Acceptance:

- Wheel pan on empty canvas still works.
- Wheel zoom and pinch zoom still work.
- Pan-on-scroll and zoom-on-scroll precedence tests remain green.

## Phase 5: Browser Verification

Commands:

```sh
pnpm -C frontend exec vitest run \
  src/gpuFlow/interactions/retainedContentScroll.test.ts \
  src/gpuFlow/interactions/sceneScroll.test.ts \
  src/gpuFlow/interactions/panZoom.test.ts \
  src/gpuFlow/retainedContentScroll.test.ts \
  src/gpuFlow/sceneScroll.test.ts
```

Then run:

```sh
./kill.sh
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Use CDP on `/settings` for these manual or scripted scenarios:

- Wheel pan over empty canvas, move over retained content, continue wheel input.
- Retained content scroll to bottom, continue wheel input.
- Retained content scroll to top, continue wheel input.
- Section scene scroll to boundary, continue wheel input.
- Native DOM input/textarea wheel target sanity check, if one is active.

Record:

- viewport transform before/after each wheel burst
- retained-content scroll offset before/after each wheel burst
- section scene scroll offset before/after each wheel burst
- console errors
- a screenshot or snapshot showing the Settings surface loaded

Save an append-only report under `perf/reports/frontend/`.

Acceptance:

- All unit tests pass.
- `./scripts/quality/check.sh` passes.
- CDP visual verification confirms the handoff behavior.
- A fresh Chrome repro or CDP report shows no viewport pan on content-boundary
  wheel events and no content scroll takeover during active viewport pan.

## Decision Checkpoint

If this cannot be solved cleanly with explicit wheel ownership state and typed
resolver results, do not add pointer-position or timing heuristics.

Instead, document the exact conflicting controller order and choose one owner:

- viewport pan wins during active viewport wheel bursts
- scrollable retained/section content wins when directly targeted and not
  already inside a viewport pan burst

Do not emit `GPUFLOW_WHEEL_SCROLL_OWNERSHIP_PLAN_COMPLETE` unless both reported
bugs pass unit and browser verification.
