# Retained Canvas Visual Regression Stability Plan

## Goal

Fix the current retained settings visual regressions with durable behavioral
coverage so the same user-visible bugs do not keep returning.

This plan covers:

- hover highlights lagging, splitting, or covering multiple rows
- retained switch controls snapping instead of animating
- retained scrollbars partially appearing or appearing inconsistently
- retained section scroll positions resetting after viewport pan or zoom

Do not add compatibility paths, feature flags for old behavior, fallback DOM
renderers, timing sleeps, or transitional dual render modes. Replace the broken
ownership model directly.

## Latest Recording Evidence

The latest Chrome recording analyzed for this plan is:

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260511-123422`

The recording has enough information to plan the fix. No additional logging is
needed before writing the first failing tests.

Relevant events from `app_state.ndjson`:

- `1,822` `gpu-flow-frame` events
- `1,022` `gpu-flow-retained-content-visual-state` events
- `293` `gpu-flow-retained-row-hover-redraw` events
- `2` `perf-settings-update` events

Observed failures:

- `256` of `293` hover redraw events dirtied more than one retained row.
- The hover dirty row set reached `12` rows, and dirty source rect height
  reached `1200px`.
- GUI hover examples show dirty rects growing from `96px` to `120px` while the
  pointer target is a single row. This matches the visual split and multi-row
  hover highlight.
- The `Left Side Pane Shifts Map` switch state changed from `true` to `false`
  at frame `194`, then back to `true` at frame `211`.
- The same recording has `0` animation frame reasons, so retained switch visual
  state snaps between final values instead of animating through intermediate
  thumb positions.
- The GUI retained surface scroll offset reached `y: 237` at frame `452`, then
  reset to `y: 0` at frame `455`. Immediately after that, viewport frames
  started for pan/zoom, which matches the reported reset after scrolling then
  panning or zooming.
- Scrollbar visual-state events show retained scrollbar geometry exists, but
  current code has two visual owners: scrollbar draw commands are rasterized
  into retained texture pages and also emitted as native solid rounded-rect
  overlay visuals. That split ownership can produce partial or inconsistent
  scrollbar visibility.

## Diagnosis

### Hover State Is Treated As Cached Texture Content

Hover is currently pushed through retained content dirtying and texture page
upload. Recent hover rows are intentionally accumulated to keep fast pointer
movement from leaving stale pixels, but that makes the dirty region grow beyond
the current row. Under fast movement, delayed repaint/upload can show both the
old and current hover states, or a large merged hover band.

Hover is transient interaction state. It should be drawn from the latest hit
target for the current frame, not stored as durable retained content.

### Switch Animation State Exists But Is Not Frame-Owned

The retained switch animation store exists, but the normal retained page frame
path does not own switch animation advancement. A switch value change changes
the retained scene and page content, but no animation frame loop owns the thumb
transition, and frame maintenance does not receive switch animation state.

Switch animation is transient control state. It must not be encoded as static
content identity, and it must not depend on full retained page replacement.

### Scrollbar Has Split Visual Ownership

Retained scrollbar commands are both:

- rasterized as retained content draw commands
- converted to native solid rounded-rect overlay visuals

The same visual therefore has two rendering paths with separate clipping,
z-index, cache, and invalidation behavior. Partial scrollbars are an expected
class of bugs when geometry and visibility are split this way.

Scrollbar hit testing, visual drawing, clipping, and z-index need one owner.

### Scroll Offset Is Not Stable Across Scene Rebuilds

Retained content scroll offsets can be applied to a scene, but viewport pan or
zoom can rebuild or resync scene content with default retained scene offsets.
The recording shows a concrete reset from `y: 237` to `y: 0` immediately before
viewport frames.

Retained scroll offset is user navigation state. It must be stored outside the
derived retained scene and re-applied to every scene rebuild until content or
viewport bounds force a clamp.

## Non-Goals

- Do not use internal diagnostics as the pass/fail criterion for regression
  tests.
- Do not keep hover as cached retained page content.
- Do not add sleeps or larger upload budgets to hide hover lag.
- Do not animate switches by delaying settings updates.
- Do not keep rasterized and overlay scrollbars as parallel visual paths.
- Do not reset scroll offsets on viewport pan, zoom, fit view, LOD changes, or
  retained texture refresh.
- Do not add broad logging as a substitute for visual invariants.

## Implementation Phases

### 1. Add Failing Visual Repro Tests First

Before changing retained rendering behavior, add focused tests that reproduce
the bugs as a user sees them. These tests must fail against the current
implementation before any fix is started. If a proposed test passes, it is not
reproducing the bug and must be rewritten before implementation continues.

The tests must be user-path tests. They should use real pointer movement,
clicks, wheel scrolling, pan, and zoom. The pass/fail assertions must inspect
the visible result: screenshots, pixel bands, element snapshots of rendered
canvas state, or user-visible row text positions. Internal retained row ids,
dirty rects, event counts, frame diagnostics, and texture page metadata may be
attached as debug artifacts, but they are not sufficient assertions.

Add a dedicated Playwright spec under `frontend/tests/e2e/settings/`, with
stable screenshot clips and pixel analysis for these behaviors:

- Hover one settings row, then move rapidly across adjacent rows. At every
  sampled point, exactly one visual row may show hover styling. The hover band
  must align to the row under the pointer and must not leave a stale band on
  the previous row.
- Click `Left Side Pane Shifts Map`. Capture at least three screenshots during
  the first transition window. The switch thumb must occupy an intermediate
  position between the old and final positions before settling. A direct snap
  from old to final state must fail the test.
- Scroll a retained settings section until a lower row is clearly visible. Pan
  and zoom the canvas. The same row content must remain visible after the
  viewport interaction settles, and the scrollbar thumb must remain at the same
  logical scroll position within a small pixel tolerance.
- Scroll a retained settings section so a vertical scrollbar is visible, then
  hover rows and pan/zoom. The scrollbar must render as a single coherent
  vertical control: full track and thumb inside the retained viewport, no
  partial orphan segment, no duplicate bar, and no frame where only a clipped
  fragment appears.

Each test must first be run against the current implementation and observed to
fail for the intended visible reason. Capture the failing screenshots as test
artifacts. Only after the red state is confirmed should the implementation
phases below start.

### 2. Move Hover To A Transient Overlay Owner

Replace retained texture hover dirtying with a current-frame hover visual owner.

Required changes:

- Keep hover hit testing in retained scene coordinates.
- Store only the current hover target and, if needed for one-frame cleanup, the
  immediately previous hover target.
- Remove the recent-hover-row accumulation path as a visual correctness
  mechanism.
- Draw the hover background from a transient row overlay or non-cached draw
  primitive during the current frame.
- Do not make hover change retained content versions or page content
  signatures.
- Do not upload retained texture pages only because hover changed.

Acceptance:

- Rapid pointer movement never displays hover on more than one row.
- Hover follows the row under the pointer within the next rendered frame.
- Hover visual bounds still match the full retained row extent.

### 3. Make Switch Animation A Frame-Owned Transient Control State

Switch animation should be owned by retained interaction/frame state, not by
static retained page content.

Required changes:

- Synchronize previous and next switch checked values when retained scenes are
  rebuilt.
- Start a transition when a retained switch checked value changes.
- Request animation frames while any retained switch transition is active.
- Redraw only the switch control visual rect or draw the switch as a transient
  overlay primitive.
- Pass switch animation state through the normal retained page frame path until
  the animation is no longer page-rasterized, so intermediate progress can be
  drawn.
- Keep animation progress out of retained content identity and row segment
  content signatures.
- Treat reduced-motion preference as a deliberate snap path and test it
  separately, not as the default behavior.

Acceptance:

- A retained switch click produces visible intermediate thumb positions before
  settling.
- Settings state updates immediately; animation is visual only.
- The active switch row does not blank or trigger full-section retained
  replacement.

### 4. Give Scrollbar One Visual Owner

Choose one retained scrollbar visual owner and delete the other path. The
preferred owner is an overlay primitive derived from retained scroll layout,
because scrollbar position is transient view state and should not require
retained content page uploads.

Required changes:

- Keep scrollbar layout generation shared for hit testing and drawing.
- Remove scrollbar commands from retained page rasterization if overlay owns the
  visual.
- Ensure overlay scrollbar visuals are clipped by the retained viewport, not by
  stale texture page source windows.
- Ensure scrollbar z-index is above retained content rows and below active DOM
  islands or popups as appropriate.
- Make hover/active scrollbar styling update through overlay state, not retained
  page replacement.
- Add visual tests that fail if only part of the track/thumb appears or if two
  scrollbar visuals overlap.

Acceptance:

- Scrollbar track and thumb appear consistently when content overflows.
- No partial orphan scrollbar segment appears during hover, scroll, pan, zoom,
  or texture upload.
- Scrollbar hit target and visible geometry remain aligned.

### 5. Persist Retained Scroll Offsets Across Viewport And Scene Changes

Make retained scroll offsets canonical user state keyed by stable retained
surface identity.

Required changes:

- Store retained content scroll offsets outside the derived retained scene.
- Re-apply stored offsets every time settings scenes or content surfaces are
  rebuilt.
- Preserve offsets across viewport pan, zoom, fit view, LOD changes, texture
  refresh, hover changes, switch animation, and settings updates.
- Clamp offsets only when content dimensions or viewport dimensions make the
  previous offset invalid.
- Use stable logical surface ids as keys. Do not key scroll state by transient
  scene object identity or texture page identity.
- Keep DOM islands and retained hit testing synchronized to the re-applied
  offset.

Acceptance:

- After scrolling inside a retained section, pan and zoom do not reset the
  section to the top.
- The same visible row remains visible after viewport interaction settles.
- The scrollbar thumb preserves the same logical scroll position, clamped only
  when content size changes.

### 6. Remove Obsolete Paths And Strengthen Diagnostics

After the visual tests are green, remove the paths that caused the regressions.

Required deletions:

- recent hover row accumulation as a visual invalidation strategy
- hover-triggered retained page uploads
- switch animation code paths that are never synchronized with frame rendering
- duplicate rasterized scrollbar visual path if overlay owns scrollbars
- any viewport scene rebuild path that silently drops retained scroll offsets

Keep targeted Chrome-repro diagnostics for retained visual state while this
area is actively changing. They should remain debug evidence only; tests must
continue to assert visible behavior.

## Verification

Run focused checks after each phase:

- The new failing-then-green Playwright visual regression spec.
- Focused Vitest coverage for the state owners only after visual tests are
  already red.
- `pnpm -C frontend exec vitest run <changed frontend test files>`
- `./scripts/run-playwright-e2e.sh settings/<new-spec>.spec.ts --max-failures=0`
- `./scripts/record-chrome-repro.sh` for settings retained content, preserving
  before/after artifacts.

Before considering the plan complete, run:

- `./scripts/quality/check.sh`

Final acceptance criteria:

- The first implementation commit contains visual tests that fail on the
  current broken behavior.
- Hover shows on exactly one row and follows the pointer without stale split
  bands.
- Retained switches visibly animate through intermediate thumb positions.
- Retained scrollbars appear as one coherent visual with no partial fragments.
- Retained section scroll position survives pan and zoom.
- The latest Chrome recording after the fix no longer shows hover dirty rects
  growing across many rows or retained scroll offsets resetting to zero during
  viewport interaction.
