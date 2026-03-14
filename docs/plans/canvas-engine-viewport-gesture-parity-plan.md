# Canvas Engine Viewport And Gesture Parity Plan

## Goal
Close the highest-impact viewport behavior gaps between the experimental
`CanvasEngineHost` path and the current React Flow path so the engine can be
used for realistic manual testing on existing projects.

## Why This Slice First
- The current host does not yet share React Flow's viewport transform semantics.
- Persisted project viewports and viewport controls therefore frame content
  poorly on real projects, especially the large Settings views.
- Trackpad pinch currently falls back to browser page zoom instead of canvas
  zoom, which blocks normal navigation testing.

These are upstream parity issues. Until they are fixed, other interaction work
is hard to evaluate because the host does not start in a usable camera state.

## Current Known Gaps
1. Initial framing mismatch
- `projectConfig.viewport` stores the React Flow transform tuple semantics.
- `CanvasEngineHost` currently interprets the same numbers as a world-origin
  camera.
- Result: large views can appear blank or badly framed even though the host is
  active.

2. External viewport control mismatch
- Existing zoom controls and other viewport writers still target the React Flow
  transform store.
- The engine host only writes into that store; it does not yet robustly follow
  external transform updates.

3. Pinch zoom
- The host handles wheel zoom through React's `onWheel`.
- That is not enough to reliably suppress browser page zoom for trackpad pinch
  gestures.

4. Touch gesture parity
- The host has no explicit two-pointer touch pinch path yet.
- This should be a later slice after desktop trackpad parity is stable.

## Immediate Implementation Steps
1. Transform bridge
- Keep the engine's internal world-space camera.
- Add explicit conversion helpers between:
  - engine camera world origin
  - React Flow translate/scale viewport transform
- Use those helpers for:
  - initial camera hydration from `projectConfig.viewport`
  - syncing engine camera back into the React Flow store
  - following external React Flow transform updates when they occur

2. Native wheel/pinch handling
- Move the host wheel handling off the React JSX `onWheel` path and onto a
  native `wheel` listener with `{ passive: false }`.
- Match React Flow's macOS pinch behavior:
  - `ctrlKey` + wheel means trackpad pinch
  - apply the same delta scaling convention
  - call `preventDefault()` to stop browser page zoom

3. Verification
- Add unit coverage for:
  - viewport transform conversion and hydration
  - external React Flow transform updates reflected in engine camera
  - native wheel / pinch zoom behavior
- Extend Playwright coverage with:
  - a viewport framing sanity check on the experimental host
  - a pinch-equivalent ctrl+wheel zoom check
- Run a headed CDP check on the worst-case Settings view and record the before
  and after framing behavior.

## Follow-On Steps
After this slice is stable, the next viewport-adjacent parity work should be:
- fit-view parity
- minimap parity or temporary minimap disablement with explicit rationale
- touch pinch support
- keyboard/command viewport controls

## Acceptance Criteria
- Enabling `useCanvasEngineV1` on the Settings project no longer yields a
  practically blank `All Settings` view solely because of viewport mismatch.
- Trackpad pinch no longer page-zooms the browser while the gesture is over the
  engine host.
- Existing React Flow viewport writers can move the engine camera in the
  experimental path without diverging state.
