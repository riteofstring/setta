# Retained Content Scroll Runtime State Plan

## Goal
Make retained section scrolling visually monotonic and smooth by removing the current split ownership between imperative GPU-layer scroll commits and React scene-prop rebuilds.

The immediate regression is visible in settings: during a single downward wheel burst, retained content advances downward overall but intermittently jumps back upward by a few pixels. The latest Chrome recording already shows the same behavior in captured surface state: the GUI retained surface receives positive wheel deltas while its visual scroll position briefly reverses.

## Scope
- In scope:
  - retained content scroll state and scene composition
  - retained content wheel, keyboard, scrollbar, and drag auto-scroll paths
  - retained text-like preview/page invalidation when scroll changes
  - settings E2E coverage for the observed scroll jitter
  - GPU flow retained content tests under `frontend/src/gpuFlow/*`
- Out of scope:
  - unrelated retained control styling
  - backend contracts
  - backward compatibility with the current retained scroll prop/callback shape
  - transitional dual-write or dual-read paths

## Current Diagnosis
Retained content scroll is currently written through two paths:

- The retained content scroll controller batches wheel events and immediately applies the committed offset into `nodeLayerRef.current.scene` so the GPU frame can render without waiting for React.
- The same commit calls back to the project layout adapter, which updates a React state version and rebuilds a new project scene from `contentScrollOffsetsRef`.
- `GpuFlow` later receives that rebuilt `scene` prop and unconditionally replaces `nodeLayerRef.current.scene`.

When those paths interleave, a stale React scene can overwrite a newer imperative scroll scene. The recording shows the backwards ticks aligning with frames that include `viewport` and `deferResolutionUpdates=true`, while normal scroll frames include `texture-upload,manual`.

## Example Repo Takeaways
The examples under `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` do not have a direct retained virtual-scroll equivalent, but they do point to useful principles:

- `html-in-canvas-cracks` keeps viewport-locked visuals fixed on the compositor path and feeds live `window.scrollY` into the render as the current scroll source. Its comments explicitly call out that re-applying `translateY(scrollY)` from the main thread lags compositor scroll and causes visible drift.
- `html-in-canvas-room` relies on native browser event forwarding through transformed DOM rather than reconstructing interaction state through a second delayed model.
- The official demos use `canvas.onpaint` / `requestPaint()` as a synchronization boundary for layoutsubtree pixels.
- `html-in-canvas-dot-dev` tests assert user-visible canvas behavior with pixel checks and real interactions, not internal renderer decisions.

For Setta, the borrowed idea is not "use native DOM scroll everywhere." Our retained content is virtualized and GPU-rendered, so custom scroll state is still appropriate. The key idea to borrow is stricter state ownership: the render frame should consume the one live scroll state, the same way a browser render consumes the current `scrollY`.

## Decision
Refactor retained content around a single GPU-flow-owned runtime state layer.

React/project code should provide structural retained content definitions: surfaces, rows, dimensions, controls, and explicit reset identity. GPU flow should own live retained surface state: scroll offsets, scroll revisions, scrollbar visual state, hover state, and dirty surface tracking. Rendering and hit testing should resolve an effective retained scene from structural definitions plus this runtime state.

There should be no compatibility shim for the current dual-owner API. Remove the old retained scroll callback flow as part of the refactor.

## Implementation Plan
1. Add failing tests for the observed behavior
- Add a Playwright E2E test in `frontend/tests/e2e/settings/`.
- Use the settings GUI retained section because it reproduces the reported issue.
- Drive one-direction downward wheel input over the GUI retained content.
- Capture a frame sequence during the wheel burst.
- Assert visual monotonicity from observed pixels: tracked retained label ink and/or scrollbar thumb position must move in the expected direction without backwards steps beyond a small tolerance.
- Do not assert `scrollOffset`, frame reasons, internal revisions, or implementation-specific callbacks.
- Attach screenshots and frame measurements on failure so regressions are easy to inspect.
- Add a smaller GPU-flow integration test that renders a retained surface, scrolls it, forces an unrelated parent scene refresh, and asserts visible row positions do not move backward. This test should exercise the public component behavior, not the internal reducer shape.

2. Introduce retained content structural definitions
- Split retained content input into a structural definition that is independent of live scroll:
  - surface id and owner section id
  - viewport/content geometry
  - row source input
  - active popup source
  - explicit scroll reset key
- Keep generation of rows/control descriptors where it is today, but stop baking live scroll offset into the project-level scene as the source of truth.
- Remove `contentScrollOffsetsVersion` as a scene rebuild dependency for normal wheel/scrollbar movement.

3. Add a GPU-flow retained runtime state store
- Add a runtime state object owned by `GpuFlow` or the retained content controller layer.
- Store per-surface:
  - current clamped scroll offset
  - monotonic scroll revision
  - dirty flags for row canvas, text-like preview pages, DOM islands, and scrollbar visuals
  - transient hover/active scrollbar state where appropriate
- Apply scroll updates through a single command path:
  - wheel
  - keyboard reveal
  - scrollbar track/thumb
  - drag auto-scroll
  - project search/reveal commands
- Each command should synchronously update runtime state and return the surfaces that need redraw.

4. Resolve effective scenes inside GPU flow
- Add a resolver that combines structural scene definitions with retained runtime state immediately before hit testing and rendering.
- Build retained row scenes using the current runtime scroll offset for each surface.
- Clamp offsets when surface geometry/content height changes.
- Delete runtime state for removed surfaces.
- Reset only when the owner-provided scroll reset key changes. Avoid heuristic resets based on row labels or content shape.

5. Remove React scene-prop overwrite races
- Update the `GpuFlow` scene prop effect so structural scene changes cannot overwrite newer retained runtime offsets.
- Stop writing retained wheel scroll offsets through React state as part of the critical render path.
- If project code still needs to observe offsets for non-render behavior, expose a read-only notification after runtime commit. That notification must not drive the next rendered frame.
- Remove obsolete `retainedContentScroll.getScrollOffsets` / `onScrollOffsetsChange` ownership assumptions instead of preserving them behind adapters.

6. Update retained rendering invalidation
- Make row canvas redraw, text-like preview redraw, DOM island sync, and scrollbar visuals consume the same committed runtime scroll revision.
- Ensure a scroll command produces exactly one visual position for all retained layers in that frame:
  - row labels
  - CodeMirror/text-like previews
  - native DOM islands
  - scrollbar thumb
  - hit records
- Keep texture upload deferral for viewport zoom/pan, but do not treat retained surface scroll as a viewport interaction that can reuse an older retained scene.

7. Update reveal and keyboard paths
- Move retained keyboard reveal and project search reveal onto the same runtime scroll command path.
- Scene-section scroll can remain separate, but any retained content reveal must resolve against the GPU-flow runtime state rather than a project-scene scroll-offset map.
- Add tests for reveal-after-scroll so search/keyboard navigation does not reintroduce React-owned retained offsets.

8. Clean up old state and tests
- Remove old retained scroll offset maps from project layout adapter state if they are only used for rendering.
- Update existing retained content tests to assert behavior through the new command/resolver boundaries.
- Keep tests focused on production paths and avoid generator drift or tautological reducer tests.

9. Verify
- Run targeted Vitest for retained content and GPU flow controller tests.
- Run the settings retained content Playwright tests, including the new failing-first monotonic scroll test.
- Run `./scripts/quality/check.sh` unless the active change scope is explicitly narrowed.
- Use CDP visual verification on `/settings` to confirm downward and upward scroll bursts are smooth, with no backwards ticks in retained labels or text-like previews.

## Acceptance Criteria
- During a one-direction wheel burst, visible retained content rows and the scrollbar thumb move monotonically in the expected direction within a small pixel tolerance.
- Retained labels, text-like previews, DOM islands, hit records, and scrollbar visuals agree on one committed scroll position per frame.
- Parent React scene refreshes cannot roll retained content back to an older scroll offset.
- Retained content scroll no longer requires React state to rebuild the project scene for every wheel frame.
- No backward-compatibility shim, old-field alias, dual-read path, or transitional adapter remains for the previous scroll ownership model.
- Settings retained content Playwright coverage fails before the refactor and passes after it.

## Risks and Mitigations
- Risk: The refactor touches many retained content call sites.
  - Mitigation: Start with failing behavior tests, then migrate all scroll command producers to one runtime command path before cleanup.
- Risk: Search/reveal commands currently assume project-owned scroll maps.
  - Mitigation: make reveal an explicit retained runtime command and test reveal-after-scroll.
- Risk: Runtime state can survive after content identity changes.
  - Mitigation: require an explicit scroll reset key from the structural owner and prune removed surfaces.
- Risk: Texture/page invalidation can become inconsistent across retained labels and text-like previews.
  - Mitigation: make dirty tracking revision-based and assert visible alignment in E2E.

## Execution Order
1. Add failing observed-behavior tests for monotonic retained scrolling.
2. Add structural retained content definitions without live scroll ownership.
3. Add GPU-flow retained runtime state and scroll command reducer.
4. Resolve effective retained scenes from structure plus runtime state for render and hit testing.
5. Migrate wheel, scrollbar, keyboard, drag auto-scroll, and reveal commands.
6. Remove project React retained scroll render ownership and obsolete APIs.
7. Update existing retained tests and add reveal-after-scroll coverage.
8. Run targeted tests, full quality check, and CDP visual verification.
