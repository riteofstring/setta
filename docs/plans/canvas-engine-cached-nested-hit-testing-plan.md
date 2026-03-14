## Canvas Engine Cached Nested Hit-Testing Plan

### Goal

Make cached nested preview sections directly selectable on the experimental
canvas-engine path after their DOM islands unmount.

### Problem

The engine already keeps cached nested preview geometry alive for:

- rendering
- marquee selection
- nested edge visibility

But direct section hit testing still only checks top-level scene rects. Once a
nested DOM island unmounts, clicking its cached preview falls through to the
parent rect or the pane instead of selecting the nested section.

### Scope

This slice covers direct section hit testing and click-selection for cached
nested previews.

In scope:

- scene-adapter hit testing that can resolve top-level or cached nested preview
  rects
- preferring nested preview hits over the parent top-level rect
- host pointer handling so cached nested preview clicks select the nested
  section without starting a bogus top-level drag
- focused unit/browser coverage

Out of scope:

- full nested drag parity after DOM unmount
- mounting a full recursive live-DOM editing surface from cached previews
- solving every cached-preview interaction gap in the same slice

### Implementation Steps

1. Extend scene hit testing to consider cached nested preview rects.
   - Reuse the existing nested preview spatial index.
   - Resolve a topmost hit across top-level rects and nested preview rects.
2. Keep host behavior narrow.
   - Top-level section hits keep the current drag/resize behavior.
   - Cached nested preview hits apply section selection only.
3. Prefer structural geometry over heuristics.
   - Use the cached world-space preview rects already owned by the scene
     adapter.
   - Do not introduce new DOM probing in the hit-test path.
4. Add regression coverage for:
   - scene-adapter cached nested section hit testing
   - browser selection of a cached nested preview after DOM-island unmount

### Verification

- `vitest` for scene-adapter and host coverage
- targeted Playwright on `canvas-engine-host.spec.ts`
- CDP visual check on a disposable project:
  - create nested child content
  - zoom out until DOM islands unmount
  - click the cached nested preview and confirm the nested section becomes
    active

### Exit Criteria

This slice is done when, after nested DOM islands unmount:

- clicking a cached nested preview selects the nested section
- the click does not start a bogus top-level drag session
- nested preview hits win over the parent top-level rect at the same location
