# Section Resize Visual Glitches Plan

## Goal
Fix section resize rendering so the section shell, header, body, scrollbars, and
retained params content resize in lockstep while the pointer is still down, and
so pointer release does not produce a visible snap or settle frame.

This plan is based on the latest Chrome recording bundle:

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260507-065513`

## Diagnosis
The resize interaction currently has two geometry sources that diverge during
the drag.

- `frontend/src/components/Pages/Project/GpuProjectSurface/projectNodeResize.ts`
  applies live resize preview geometry to the GPU layout store.
- That preview updates the section node geometry used by the main section DOM
  surface, so `settings-section__gui` changes size on pointer-move frames.
- Retained params content is not driven by the same preview geometry. It is
  generated from `layoutAdapter.scene.contentSurfaces` in
  `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.ts`
  and consumed by
  `frontend/src/gpuFlow/GpuFlow/retainedContentSources.tsx`.
- During active resize, `layoutAdapter.scene.contentSurfaces` remains the
  pre-resize scene until the project size commit lands after pointer release.

The recording shows the split clearly:

- During width shrink, the main `settings-section__gui` source changes across
  drag frames from about `555x345` down to `405x300`, while
  `settings-section__gui:param-content:unpinned` does not resize until after
  release, when it jumps to about `404x238`.
- During width grow, the main source grows across drag frames from about
  `420x300` to `555x375`, while the retained content surface first jumps after
  release to about `554x313`.
- Height shrink and height grow have the same pattern: the shell changes during
  the drag, and the retained content surface changes after release.
- After release, the recording shows multiple frames of retained content upload
  churn, including upload-budget exhaustion around the final grow sequence. That
  explains the visible flicker where the section first appears at one size and
  then settles at another.

The screenshots line up with this:

- When shrinking, the section shell and clipping region move immediately, but
  the retained content remains at the old width, so only part of the visible
  section appears to shrink.
- When expanding, the shell grows immediately, but the retained content remains
  at the old width until resize end, leaving a large empty area.
- On release, the committed project scene finally regenerates retained content
  geometry, causing a second visible resize and texture repaint.

## Root Cause
Active resize patches only the layout-store section preview. It does not produce
a coherent preview scene that also includes retained content surface geometry.
`GpuFlow` therefore renders the section node from one geometry source and
retained content overlays from another.

Pointer release then switches from the preview layout-store geometry to the
committed project scene geometry. Because the retained surface dimensions and
textures are updated only in that second phase, the final frame can briefly
show a mixed or stale layout before all textures settle.

## Fix Plan

### 1. Add a single resize preview scene
Create one active resize preview scene that derives all resize-sensitive GPU
geometry from the same candidate section size:

- section node rects
- nested/group section layout
- DOM island rects, if any are affected by the section
- retained content surface rects and viewport rects
- edge geometry and any section-owned overlays that depend on section bounds

The preview scene should be derived through the existing project GPU scene
helpers instead of adding a parallel TypeScript sizing model. In particular, do
not duplicate non-trivial sizing, bounds, auto/manual-size, or retained-content
layout rules just for resize preview.

Implementation options:

- Preferred if it is fast enough: expose a preview scene from the project GPU
  layout adapter and pass `activePreviewScene ?? layoutAdapter.scene` into the
  `GpuFlow` surfaces during active resize.
- If React render frequency is too expensive: add a small external preview
  scene store, similar in spirit to the current layout store, and have the
  retained content layer subscribe to preview content-surface geometry without
  forcing full React tree updates on every pointer move.

Either design must make the active section node and its retained content
surface come from the same preview result for every drag frame.

### 2. Generate preview content surfaces from preview sections
Generalize the current section resize preview path so it returns a coherent
scene-shaped result, not only preview `sections`.

The new helper should:

- start from the committed project GPU scene
- apply the in-progress resize candidate to the target section
- run the same layout path used for project scenes to update affected section
  geometry
- run the same retained params content surface derivation used by committed
  scenes
- preserve stable surface IDs, such as
  `settings-section__gui:param-content:unpinned`, so texture caches can update
  dimensions instead of recreating unrelated surfaces

This should live near the existing owner path for project GPU scene construction
and resize preview helpers. Avoid moving correctness-sensitive sizing rules into
ad hoc render code.

### 3. Update retained content texture invalidation during preview
When a retained content surface keeps the same ID but its dimensions or viewport
rect change during active resize, mark the surface dirty immediately.

The active section's retained content should upload at interactive priority,
similar to the active section DOM texture. The renderer should treat dimension
changes as real resize work, not as a post-commit refresh.

Keep cache behavior narrow:

- resize or invalidate surfaces whose geometry changed
- keep stable surfaces that did not change
- do not clear all retained surfaces on every pointer move

### 4. Remove the release-time rollback window
On pointer release, keep the preview scene active until the committed project
scene has the same final geometry.

The release sequence should be:

1. Last pointer-move frame renders preview geometry.
2. Pointer-up commits the same final dimensions to project state.
3. The committed project scene catches up to the preview geometry.
4. Preview state is cleared only after the committed scene matches.

This prevents a frame where the renderer falls back to the old committed scene
before the final committed scene is ready.

Also audit the stop path for second-pass clamping or size-mode recomputation.
If release recomputes a slightly different final size than the preview, snapshot
the relevant resize-start policy, initial dimensions, and snapped candidate size
so the commit uses the exact geometry that was rendered.

### 5. Preserve existing resize rules
The fix must keep current resize semantics:

- grid snapping
- manual and auto size modes
- min/max bounds
- aspect-ratio locks
- bottom, right, and bottom-right handles
- nested/group section layout
- embedded terminal width synchronization
- scroll position and retained params viewport behavior

If any of these require duplicated frontend logic, document the reason near the
implementation and keep the duplicate surface minimal.

### 6. Improve recording diagnostics
Add frame diagnostics that make this class of bug obvious in future recordings:

- active resize node ID and handle
- active section node rect and texture source size
- retained content surface rect and texture source size for surfaces owned by
  the active section
- whether those values came from committed scene geometry or preview geometry
- whether active retained content uploads were budgeted or deferred

These fields should appear in the existing `gpu-flow-frame` app-state payloads
so `./scripts/latest-chrome-recording.sh --json` plus `jq` can diagnose stale
preview surfaces without relying only on screenshots.

## Test Plan

### Unit and Integration Tests
Add focused Vitest coverage around the preview derivation and retained-content
update path.

1. Preview scene derivation:
   - resizing a params section returns updated section geometry and updated
     retained content surface geometry in the same result
   - width shrink, width grow, height shrink, and height grow all update the
     retained surface dimensions before commit
   - bottom-right resize updates both dimensions consistently
   - nested/group layouts keep child and sibling positions consistent

2. Resize controller behavior:
   - active resize updates the preview scene on pointer moves
   - pointer-up commits the last preview dimensions exactly
   - preview is not cleared until the committed scene matches the final preview

3. Retained content rendering:
   - a retained surface with the same ID but a changed rect marks its texture
     dirty
   - the active section's retained content is eligible for interactive-priority
     upload during resize
   - unchanged retained surfaces are not invalidated just because another
     section is resizing

Target likely files:

- `frontend/src/components/Pages/Project/GpuProjectSurface/projectNodeResize.test.ts`
- `frontend/src/gpuFlow/sceneResize.test.ts` or a new test beside the new
  preview-scene helper
- `frontend/src/gpuFlow/GpuFlow/flowSurface.test.tsx`
- a focused retained-content test near
  `frontend/src/gpuFlow/GpuFlow/retainedContentSources.tsx` if the logic moves
  there

### Browser Regression Test Matching The Manual Repro
Add a Playwright spec that performs the same resize gestures as the recording,
asserting during the drag rather than only after pointer release.

Suggested spec:

`frontend/tests/e2e/params/section-resize-live-geometry.spec.ts`

Scenario:

1. Open a project with a settings-like params section containing enough rows to
   exercise retained params content and internal scrolling.
2. Locate the target section and the right, bottom, and bottom-right resize
   handles.
3. Start dragging with `page.mouse.down()`.
4. Move in small steps while the pointer is still down.
5. At multiple intermediate steps, read browser-side geometry for:
   - the active section node bounds
   - the active section DOM texture/source size
   - `:param-content:unpinned` retained surface bounds/source size
   - the retained content viewport rect
6. Assert that the retained content surface tracks the active section body
   within a small tolerance, such as `1-2px`, on every sampled drag frame.
7. Capture screenshots at the same states as the manual repro:
   - shrink while dragging
   - grow while dragging before release
   - immediately before release
   - first frame after release
   - settled frame after two animation frames
8. After release, assert there is no second geometry transition larger than the
   tolerance between the pre-release preview, first post-release frame, and
   settled frame.

The key regression guard is that assertions run while the mouse button is still
down. A test that waits until pointer-up before checking size will miss the bug.

### Chrome Recording Verification
Use the same workflow as the manual report for final verification:

1. Run `./scripts/record-chrome-repro.sh`.
2. Reproduce the four gestures:
   - shrink width
   - grow width
   - shrink height
   - grow height or bottom-right grow
3. Close the browser window.
4. Run `./scripts/latest-chrome-recording.sh --json`.
5. Inspect `app_state.ndjson`.

Expected recording evidence after the fix:

- During active resize frames, the active section DOM source and its
  `:param-content:unpinned` retained surface report dimension changes in the
  same drag window.
- The retained surface's first final-size update does not appear only after
  `activeNodePresent` becomes false.
- On release, active section geometry remains within tolerance of the last
  drag-frame preview.
- There is no multi-frame active-section geometry churn after release.
- Upload budget diagnostics may still show other work, but the active retained
  content surface should not be deferred long enough to show stale geometry.

### CDP Visual Check
After implementing the fix, run a chrome-devtools visual check against a live
frontend session:

1. Open the same project/settings view used in the recording.
2. Drag the section narrower and confirm the content clips/resizes with the
   shell while dragging.
3. Drag the section wider and confirm content expands while dragging, not only
   after release.
4. Release after a bottom-right resize and compare the first post-release frame
   with the settled frame.
5. Include the result in the final response as required by the UI workflow.

## Acceptance Criteria
- Section shell, header, body, scrollbar, and retained params content resize
  together while dragging.
- Shrink and grow gestures show no stale old-width or old-height retained
  content region.
- Pointer release does not show a snapback or second settle size.
- The latest Chrome recording proves retained content surface dimensions update
  during active resize frames.
- Automated coverage fails if retained content updates only after pointer-up.
- The implementation does not introduce a parallel frontend sizing model where
  existing project GPU scene/layout helpers can provide the authoritative
  geometry.

## Suggested Execution Order
1. Add diagnostics for active resize geometry and retained content surface
   sizes.
2. Add the failing Playwright or Vitest coverage that samples geometry while the
   pointer is still down.
3. Implement the coherent preview scene path.
4. Wire retained content surfaces to the preview scene and active upload
   priority.
5. Fix release sequencing so preview clears only after committed scene match.
6. Re-run targeted tests, the manual-style Playwright spec, and a Chrome
   recording verification.
