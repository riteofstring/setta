# GPU Flow Performance and Visual Hardening Plan

## Goal

Push the WebGPU/html-in-canvas project surface from feature parity toward a
high-performance production-quality renderer.

The completed prerequisite plans replaced xyflow with a GPU flow surface, added
same-instance active DOM teleport for live node interaction, and restored pan,
resize, movement, dnd, edges, viewport helpers, section compatibility, and grid
parity. This plan is the next pass: make the renderer fast under stress, make
passive texture output visually match the same node when it is live DOM, add
tests that prove real behavior instead of restating implementation, and remove
dead compatibility code left behind by the replacement.

Primary outcomes:

- Pan, zoom, minimap navigation, viewport animation, and node movement keep GPU
  texture uploads and unnecessary CPU/GPU buffer writes off the hot path.
- Active node controls feel native on first input and remain smooth while the
  rest of the graph stays on cached textures.
- Passive node textures and live teleported DOM line up visually across zoom
  buckets, scroll offsets, active settle, theme changes, and component families.
- Switching a node from passive texture to live DOM and back does not produce a
  perceptible pop, shift, blur change, clipping change, or color/opacity change.
- Large graphs remain usable without unbounded texture memory growth.
- Tests and browser checks assert measurable user-visible or operation-count
  invariants.
- Stale xyflow-era shims, fallback paths, and dead code are audited and removed
  when no longer justified.

## Scope

In scope:

- `frontend/src/gpuFlow/*`
- GPU project wiring under `frontend/src/components/Pages/Project/*`
- GPU-related section, param, resize, dnd-kit, edge, viewport, and minimap
  integration surfaces when they affect renderer performance or visual parity
- focused frontend tests under owner modules and E2E/browser checks under
  `frontend/tests/`
- append-only performance and browser reports under `perf/reports/frontend/`

Out of scope:

- reintroducing xyflow, d3-zoom, dual renderers, or compatibility render paths
- adding non-native html-in-canvas or WebGPU fallbacks
- broad UI redesign unrelated to texture/live-DOM parity
- backend contract changes unless a frontend measurement proves an owner-owned
  contract is the right fix

## Current Hot-Path Risks To Audit First

Use these as starting hypotheses, not as guaranteed bugs. Baseline before
optimizing.

- `GpuNodeQuadRenderer.render()` rebuilds and rewrites node quad vertex data on
  every render, including viewport-only frames where only the camera uniform
  should change.
- `GpuFlow` updates `edgeLabelViewport` through React state when the viewport
  transform changes, which can pull label and reconnect-anchor overlays through
  React during high-frequency pan/zoom.
- `syncGpuNodeDomTransforms()` currently iterates over all mounted nodes. For
  large projects, DOM hit-test transforms should be updated from visible/forced
  node diffs, not from a full graph scan on every viewport frame.
- `markGpuNodeLayerPaintDirty()` maps paint changed elements to node ids by
  scanning every node element. Paint events should resolve node ownership by
  stable DOM ancestry wherever possible.
- Texture records are destroyed on node unmount, but there is no explicit
  texture memory accounting or offscreen LRU eviction policy.
- Active DOM settle already suppresses stale texture flashes for common cases,
  but visual parity still needs broad proof across zoom levels, scrollable
  content, CodeMirror, terminal, spreadsheet, browser/iframe, media, and param
  controls.
- The most important texture/live-DOM fidelity issue is the activation visual
  delta: when a user clicks a field, toggle, slider, editor, or other control,
  the node can appear slightly different while teleported than it did as a
  passive texture before and after the interaction.

## Texture/DOM Fidelity Definition

Texture/DOM fidelity means the same node should look stable across this exact
sequence:

1. passive GPU texture before interaction
2. live teleported DOM during interaction
3. restored passive GPU texture after final upload

The target is not only mathematical alignment. The user should not notice a
visual pop at activation or deactivation.

Likely causes to audit:

- GPU quad position and live DOM position round to different device pixels.
- GPU camera math and CSS `translate(...) scale(...)` produce slightly different
  subpixel placement.
- Texture resolution buckets capture at a different effective scale than live
  DOM rendering at the current zoom.
- Linear texture sampling makes passive text/chrome slightly blurrier than live
  DOM.
- Texture capture includes or excludes clipping, border radius, outline, shadow,
  opacity, scrollbar, or theme styles differently from the teleported DOM path.
- Active teleport classes or inline styles accidentally change layout, z-index,
  containment, overflow, width, height, font smoothing, or color inheritance.
- Final restore captures before scroll offsets, focus state, or CSS transitions
  settle.

Preferred fixes:

- First make coordinate, scale, clipping, and style state identical.
- Then tune texture resolution and sampler policy if the remaining delta is
  blur or antialiasing.
- Use a short transition or crossfade only if browser text antialiasing makes a
  small measured difference unavoidable, and only after documenting why root
  parity cannot remove it.

## Metrics

Every substantial performance change must report before/after values for the
changed scenario in `perf/reports/frontend/`.

Minimum measurements:

- frame interval and FPS during pan, zoom, viewport animation, node move, and
  active control interaction
- long task count and worst long task duration
- `GPUQueue.copyElementImageToTexture()` count, with active-node and passive-node
  counts separated when possible
- `GPUQueue.writeBuffer()` count and target labels during viewport-only frames
- visible node count, drawn node count, edge vertex count, and texture upload
  queue depth
- DOM style writes during pan/zoom and node movement when instrumentable
- texture memory estimate: allocated bytes, visible bytes, evicted bytes, and
  largest texture
- React render or commit count for overlays that are suspected hot-path work

For visual parity:

- screenshot or pixel-diff artifact paths
- zoom levels checked: `0.5`, `1`, and `2` minimum
- active DOM vs passive texture bounding-box deltas
- before/live/after screenshot deltas for the same node during activation and
  deactivation
- measured device-pixel alignment deltas for GPU quad corners and live DOM
  corners
- effective texture scale, zoom bucket, DPR, sampler mode, and CSS transform for
  each fidelity sample
- stale-flash checks around active restore and final upload

## Phase 1: Baseline Instrumentation

Build reusable browser instrumentation before optimizing.

Requirements:

- Instrument `requestAnimationFrame`, long tasks, and WebGPU queue methods from
  the browser page without adding production test-only branches.
- Wrap `GPUQueue.prototype.copyElementImageToTexture` and
  `GPUQueue.prototype.writeBuffer` in the browser probe so counts reflect real
  runtime behavior.
- Capture current-frame operation summaries from `onNodeLayerFrame` or existing
  public surface callbacks rather than adding broad global state.
- Keep instrumentation isolated to tests, repro scripts, or CDP-injected page
  code.
- Record baselines for:
  - Settings -> All Settings pan and zoom
  - direct node movement
  - active switch/input interaction
  - active pan/zoom while a node is teleported
  - minimap click/drag navigation
  - a large synthetic graph fixture

Suggested artifacts:

- `perf/reports/frontend/YYYY-MM-DD_gpu-flow-performance-baseline.md`
- screenshots or traces under `perf/reports/frontend/` or `perf/artifacts/`

Tests:

- Add focused unit tests only for deterministic instrumentation helpers.
- Do not add tests that merely assert that a spy was installed.

## Phase 2: Viewport-Only GPU Hot Path

Make a pure viewport frame as close as possible to:

1. update camera uniform
2. issue grid, edge, and node draw calls
3. avoid node texture upload
4. avoid unchanged edge buffer upload
5. avoid unchanged node vertex buffer upload
6. avoid React work for overlays that can be transformed imperatively

Implementation targets:

- Cache node quad vertex data in `GpuNodeQuadRenderer`.
  - Reuse the node vertex buffer when drawn quad order and flow geometry are
    unchanged.
  - Rewrite node vertices on node move, resize, culling changes, z-order
    changes, texture visibility changes, or suppression changes.
  - Viewport-only pan/zoom should not rewrite node vertex data.
- Keep existing edge buffer stability and extend tests if coverage misses
  labels, reconnect anchors, or hidden/filter changes.
- Cache camera uniform writes only when the encoded camera is identical.
  Viewport movement should still write camera data, but duplicate frame requests
  with identical camera state should not.
- Audit `GpuEdgeLabelLayer` and `GpuEdgeReconnectAnchorLayer`.
  - If React state updates occur on every viewport tick, move the high-frequency
    positioning to an imperative transform subscription or a local animation
    frame sync.
  - Keep labels accessible and selectable after the viewport settles.

Tests:

- Extend `gpuPipelines.test.ts` so a second viewport-only render with identical
  quads rewrites only the camera buffer.
- Add a regression test where node geometry changes and the node vertex buffer
  is rewritten exactly once.
- Add a project-surface or overlay test proving viewport changes do not trigger
  React remounts of edge labels or reconnect anchors.

Browser verification:

- CDP check with `writeBuffer` labels during pan/zoom.
- Confirm `copyElementImageToTexture` count remains zero for viewport-only
  movement after initial textures exist.

## Phase 3: DOM Hit-Test Transform Scaling

Keep DOM hit testing aligned with GPU output while reducing DOM work for large
graphs.

Required behavior:

- Visible and forced nodes have correct screen-space DOM transforms after pan,
  zoom, viewport animation, minimap navigation, node move, resize, and active
  restore.
- Culled nodes are parked offscreen with `pointer-events: none`.
- Active and settling nodes are never incorrectly parked or made noninteractive.
- The implementation does not scan and write every mounted node on every
  viewport frame when only a small visible subset changed.

Implementation targets:

- Add a DOM transform sync cache owned by GPU flow or the node layer.
- Drive transform updates from:
  - next visible node ids
  - previous visible node ids
  - forced visible ids
  - active, settling, and pending-paint ids
- Skip style and dataset writes when the computed transform, visibility, pointer
  state, and interactive state are unchanged.
- Consider a viewport-interaction mode where pointer events for passive DOM
  hit-test nodes are temporarily disabled during high-velocity pan/zoom, but
  only if browser verification proves it improves frame stability without
  harming first-click handoff after the gesture.

Tests:

- Unit-test the diffing helper with visible-set enter, exit, move, zoom, active,
  and settle cases.
- Add a non-tautological test that counts DOM writes for a large mounted-node
  set where only a small visible subset changes.
- Add a browser check for first click on a node immediately after pan/zoom.

## Phase 4: Paint Dirty Ownership

Resolve changed paint elements to node ids without an O(nodes) scan.

Required behavior:

- Paint events for child controls mark the owning node dirty.
- Paint events for a whole node mark that node dirty.
- Paint events that only cover the canvas or unrelated portal content do not
  dirty every node.
- Active-node final paint detection still works after restore.

Implementation targets:

- Prefer DOM ancestry from the changed element:
  - `closest('[data-gpu-flow-node="true"]')`
  - stable `data-id` or equivalent owner metadata
- Keep a narrow fallback only when the browser reports a changed element that is
  an ancestor of the node element and there is no direct node ancestry path.
- Document any fallback with the exact browser paint event shape that requires
  it.

Tests:

- Add tests for child changed element, node changed element, ancestor changed
  element, unrelated changed element, and active pending-paint clearing.
- Include a large node-map case that proves child changed-element resolution is
  not O(nodes).

## Phase 5: Texture Memory Accounting And Eviction

Prevent large projects from retaining unbounded GPU texture memory.

Required behavior:

- Estimate memory per texture from pixel width, pixel height, and format.
- Track total allocated texture bytes and visible texture bytes.
- Evict offscreen textures by LRU or equivalent deterministic policy when a
  configurable budget is exceeded.
- Never evict:
  - visible nodes
  - active teleported nodes
  - settling nodes
  - pending-final-paint nodes
  - focused persistent-interaction nodes
  - nodes currently queued for an interactive final upload
- Evicted nodes recapture normally when visible again.
- Eviction must not cause stale texture flashes, active upload failures, or
  unbounded recapture loops.

Implementation targets:

- Add memory fields or helper methods to `NodeTextureRecord` or
  `NodeTextureManager`.
- Add an eviction API owned by `NodeTextureManager`; do not scatter texture
  destruction across callers.
- Make eviction reason and protected ids visible in frame/debug results so
  browser probes can report them.
- Tune initial budgets conservatively. Prefer a project setting or internal
  constant over a magic number buried in eviction code.

Tests:

- Texture accounting tests for DPR, zoom bucket, max texture clamp, and resize.
- Eviction ordering tests for offscreen records.
- Protection tests for active, settling, visible, focused, and dirty
  interactive nodes.
- Browser stress test showing memory stabilizes after panning across many nodes.

## Phase 6: Large Graph Stress Fixture

Create a repeatable stress scenario that uses the production GPU flow path.

Requirements:

- Use production renderer logic rather than mocks or a separate fake renderer.
- Generate synthetic project/node data in a disposable test or fixture path.
- Cover:
  - many nodes with varied sizes
  - many edges
  - culling boundaries
  - zoom buckets
  - pan across sparse and dense regions
  - node move and selection movement
  - texture eviction and recapture
- Keep fixture generation deterministic.

Suggested scales:

- smoke: 250 nodes
- medium: 1,000 nodes
- stress: 5,000 nodes
- stretch: 10,000 nodes if the local machine can run it reliably

Success criteria:

- Pan/zoom FPS stays near display refresh for smoke and medium after initial
  texture warmup.
- Stress scale remains interactive and avoids runaway memory.
- No passive texture uploads occur during viewport-only movement.
- DOM transform writes scale with visible/previous-visible nodes, not total
  mounted nodes.

## Phase 7: Texture And Live DOM Visual Parity

Prove that cached textures and the live teleported DOM present the same node
without a perceptible switch-state pop.

Required behavior:

- Passive texture and live DOM have matching:
  - screen position
  - size
  - transform origin
  - z-index order
  - border radius and clipping
  - opacity and theme colors
  - scroll offsets
  - minimized/expanded state
  - active/selected state when applicable
- Clicking into a text field or toggle does not make the node visibly shift,
  resize, sharpen, blur, recolor, lose clipping, gain a different shadow, or
  change opacity while it is live DOM.
- Releasing or blurring the active control does not flash a stale or subtly
  different texture before the final post-restore upload is visible.
- Final settle hides live DOM only after the restored node has produced a valid
  final texture upload.
- No stale texture flash is visible after switch, text input, slider, resize,
  scroll, CodeMirror edit, terminal input, or theme change.

Implementation targets:

- Build an activation-delta visual probe that captures:
  - passive texture immediately before pointer/focus activation
  - live DOM after teleport but before meaningful control mutation when possible
  - live DOM during the interaction
  - restored texture after final upload
- The probe should compare:
  - live active node bounding rect
  - passive GPU quad expected rect
  - GPU quad corner positions snapped to device pixels
  - live DOM corner positions snapped to device pixels
  - screenshot pixels for stable regions
  - text/chrome sharpness or pixel-diff around labels and input chrome
  - scroll offsets captured before and after teleport
- Add targeted diagnostics for texture resolution and sampling:
  - current zoom bucket
  - DPR
  - texture pixel dimensions
  - CSS dimensions
  - sampler filtering mode
- Audit active teleport presentation styles and preserved classes. The
  teleported node must keep the same width, height, overflow, border radius,
  transform origin, containment, font smoothing, theme ancestry, and CSS custom
  properties as the passive source node.
- Extend existing compatibility fixture data if it already owns representative
  section and param families.
- Add targeted fixes at the owner surface:
  - transform math in GPU flow
  - device-pixel snapping policy for matching GPU quad and live DOM corners
  - texture resolution and sampler policy
  - active DOM teleport style restoration
  - CSS containment, clipping, and theme inheritance
  - section or param component metadata for stable target descriptors
  - final paint/upload ordering

Tests and verification:

- Unit tests for deterministic transform and style restoration helpers.
- Unit tests for before/live/after fidelity helpers that compare real rects,
  style snapshots, and texture metadata rather than internal flags.
- Browser screenshots at zoom `0.5`, `1`, and `2`.
- CDP check for activation pop and stale flash by sampling visible state before
  teleport, immediately after teleport, during interaction, after restore, and
  after final upload.
- Prioritize these concrete activation samples:
  - text input focus and first typed character
  - switch or toggle first click
  - slider pointerdown before drag
  - CodeMirror focus if available
  - terminal focus if available

## Phase 8: Active Interaction Latency

Keep native controls native and measurable.

Required behavior:

- First meaningful input is not lost for switches, buttons, sliders, color
  pickers, dropdowns/comboboxes, text inputs, CodeMirror, terminal, chat input,
  spreadsheet, browser/iframe, media controls, and dropzone.
- Active node uploads remain deferred while the node is teleported.
- Final upload happens once the node is restored and painted.
- Interacting with one node does not cause unrelated visible nodes to upload
  unless they are independently dirty.

Implementation targets:

- Add an interaction latency probe for representative controls.
- Record:
  - pointerdown to visible DOM response
  - keydown/beforeinput to visible text response
  - active-node upload count while teleported
  - final-upload count after restore
  - long tasks during interaction
- Fix component-specific target descriptors where handoff still depends on DOM
  paths that are unstable across renders.

Tests:

- Non-tautological tests should assert actual target resolution, first-click
  effect, pointer capture continuity, typed value visibility, or upload counts.
- Avoid tests that only restate selector lists or internal flag transitions.

## Phase 9: Cleanup And Authority Audit

Remove dead code after performance and visual parity are stable.

Audit targets:

- stale xyflow or ReactFlow compatibility classes, helpers, comments, and tests
  that no longer define a public contract
- unused GPU flow helpers added during the replacement
- broad fallback paths that silently hide unsupported browser APIs
- legacy active texture upload loops or timing shims
- duplicated type aliases or local mirrors where owner-defined or generated
  surfaces exist
- tautological tests that only reproduce implementation logic

Rules:

- Keep `react-flow__*` classes only when they remain an intentional DOM/test
  compatibility contract and document that reason near the owner if unclear.
- Remove dead code with focused tests or a search/audit note proving no owner
  still depends on it.
- Do not remove compatibility behavior that is still user-visible without an
  explicit owner decision.
- Do not add migration shims or dual paths as part of cleanup.

## Phase 10: Final Verification

Run a final browser and quality pass after fixes.

Required browser checks:

- Settings -> All Settings at zoom `0.5`, `1`, and `2`
- high-speed wheel pan and trackpad-style scroll pan
- zoom in/out and animated fit/reset/go-to-section navigation
- minimap click and drag
- direct single-node and multi-node movement
- resize right, bottom, and bottom-right handles
- active switch, text input, slider, dropdown/color, CodeMirror, terminal, chat,
  spreadsheet, browser/iframe, media, and dropzone where available
- dnd-kit sortable and moving-free mode at zoom `0.5`, `1`, and `2`
- edge selection, context menu, connection preview, valid drop, invalid drop,
  and reconnect
- texture/live-DOM visual parity fixture
- activation before/live/after pop checks for text fields and toggles
- large graph stress fixture

Required quality checks:

- focused Vitest suites for changed owners
- focused Playwright or CDP scenarios for visible interaction work
- `./check_quality.sh` unless a concrete environment blocker is documented

Final report must include:

- before/after performance summary
- operation-count summary for texture uploads and GPU buffer writes
- visual parity artifacts
- texture memory and eviction summary if eviction was implemented
- remaining risks or explicit blockers
- `CDP visual check: done (...)` with scenarios listed, or a concrete blocker

## Suggested Loop Command

This plan can run through the dedicated wrapper:

```bash
./scripts/run-codex-gpu-flow-performance-visual-hardening-loop.sh \
  --output-dir /tmp/gpu-flow-performance-visual-hardening-loop \
  --iterations 80 \
  --progress-log-interval-seconds 300
```

Use these browser flags for WebGPU/html-in-canvas checks:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Use `./aireset.sh` with the same environment only when a clean disposable app
state is required.

## Completion Sentinel

Emit this exact line only after all phases are complete, fresh audit finds no
remaining actionable work under this plan, required reports and checks are
recorded, and the worktree is clean:

```text
GPU_FLOW_PERFORMANCE_VISUAL_HARDENING_PLAN_COMPLETE
```

## Success Criteria

The plan is complete when:

- viewport-only pan/zoom does not upload node textures after warmup
- viewport-only pan/zoom does not rewrite unchanged node vertex buffers
- DOM transform work scales with visible/previous-visible nodes rather than the
  full mounted graph
- edge labels and reconnect anchors do not force high-frequency React work on
  every viewport frame
- dirty paint ownership is resolved without scanning every node for normal
  changed-child events
- texture memory is accounted for and bounded, or a measured report proves the
  current retained-texture behavior is acceptable for the target graph scale
- active controls respond on first input with native DOM latency
- active-node uploads are deferred while teleported and final uploads happen
  only after restore plus paint
- passive textures and live DOM are visually aligned at zoom `0.5`, `1`, and
  `2`
- activation and deactivation of representative controls do not produce a
  perceptible node appearance pop, and measured before/live/after deltas are
  recorded
- large graph stress checks have recorded FPS, long-task, upload, buffer-write,
  and memory data
- focused tests assert user-visible behavior, operation counts, or owner
  contracts rather than implementation restatements
- dead compatibility code and stale shims found by the audit are removed or
  documented as intentional contracts
- CDP visual verification and `./check_quality.sh` are recorded, or concrete
  blockers are documented
