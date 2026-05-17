# GPU Flow Architecture Iterations

Date: 2026-05-19

This note summarizes the GPU Flow architecture work on this branch since it
forked from `go-rewrite`. The branch point is:

```sh
git merge-base go-rewrite HEAD
# a0dad90cc212c42683b91fe83b1aefb2a51ae407
```

The reviewed range is:

```sh
git log --reverse --pretty=format:'%h %ad %s' --date=short go-rewrite..HEAD
```

That range contains 894 commits from 2026-04-28 through 2026-05-19. Not every
commit is GPU Flow work, so this note focuses on the commits that changed
`frontend/src/gpuFlow/`, the project GPU surface adapter, GPU Flow E2E probes,
performance reports, and the related architecture docs.

This is a narrative companion to
[HTML-in-canvas architecture](../reference/html-in-canvas-architecture.md), not
a replacement for that reference. The reference doc is the current module map;
this file explains how the architecture moved.

## Starting Point

At the branch point, the project surface still depended on a React Flow /
XYFlow-shaped model for much of the visible project graph: DOM nodes, SVG
edges, DOM controls, minimap behavior, viewport helpers, and gesture ownership
were tightly coupled to the old flow surface. The target was already clear:
make the project canvas a WebGPU-composed surface while keeping browser-owned
DOM behavior where it is semantically required.

The hard problems were ownership problems:

- viewport movement needed to be camera/projection work instead of React DOM
  relayout and texture uploads;
- section geometry, selection, drag, resize, edge handles, and minimap behavior
  needed one coordinate owner;
- active editors and controls needed real browser DOM semantics without making
  the entire project graph DOM-visible;
- retained parameter content needed cached GPU rendering without publishing
  blank, stale, or mixed-generation frames;
- projected DOM controls, DOM islands, retained pages, hit testing, debug
  snapshots, and wheel ownership eventually needed one visible commit boundary.

## Iteration 1: Replace XYFlow With A GPU Viewport

Representative commits:

- `346877b27` webgpu-pan-zoom: add gpu flow device foundation
- `dd751ba18` webgpu-pan-zoom: add node texture manager
- `36b9ca304` webgpu-pan-zoom: add cached node quad renderer foundation
- `ae73296b5` webgpu-pan-zoom: add gpu viewport controller
- `2dabc0781` webgpu-pan-zoom: add gpu selection controller
- `2a4d72bb3` webgpu-pan-zoom: add gpu edge geometry owner
- `1786294bd` webgpu-pan-zoom: replace project xyflow surface
- `d63adaf3e` webgpu-pan-zoom: render project grid on gpu

The first pass established `frontend/src/gpuFlow/` as a real runtime: WebGPU
device setup, renderer pipelines, node texture records, cached node quads, GPU
viewport state, selection, drag, edge geometry, edge hit testing, controls, and
minimap integration.

The important architectural changes were:

- flow contracts, viewport math, mouse location, edge handles, graph geometry,
  and viewport helpers moved to the GPU owner;
- the XYFlow fork, SVG edge renderers, XYFlow controls, and XYFlow minimap path
  were deleted instead of kept as compatibility layers;
- grid, edges, and cached DOM node textures became GPU-rendered content;
- viewport-only pan and zoom avoided repainting or reuploading DOM textures
  when committed textures already covered the visible surface.

This changed GPU Flow from an acceleration layer beside the old graph surface
into the project graph runtime.

## Iteration 2: Keep Browser Semantics Through Active DOM Handoff

Representative commits:

- `67a3aef77` Prototype active DOM teleport for GPU nodes
- `649317c1e` Remove active node clone overlay path
- `5746f197c` gpu-live-dom: suppress teleported node quads
- `f968b9501` gpu-live-dom: finalize uploads before quad restore
- `20b22f254` gpu-live-dom: remove active upload feedback loop
- `756c6129a` gpu-live-dom: hand off canvas control clicks
- `0433362ef` gpu-live-dom: harden component teleport safety
- `76058851d` Keep GPU text controls interactive after pointer release

Once the graph was GPU-rendered, active controls exposed the limit of treating
DOM as texture data. Text selection, caret, focus, IME, native scroll, and form
control behavior need browser DOM, not a copied texture.

This iteration introduced the active DOM handoff pattern:

- project node DOM remained the source for browser behavior;
- pointer activation could project the active source DOM into the visible
  viewport while suppressing the stale GPU quad beneath it;
- the renderer finalized pending uploads before restoring a node quad after
  active handoff;
- source projection and pointer release were hardened so editors and controls
  stayed interactive after the initial click.

The lesson was that GPU Flow should own composition and projection, while the
browser still owns active editing semantics.

## Iteration 3: Restore Interaction Parity And Add Performance Gates

Representative commits:

- `31a22d916` gpu-flow-ux: prioritize scroll panning over wheel zoom
- `41bcdca1c` gpu-flow-ux: route resize handles through active dom
- `d3da1f5d8` gpu-flow-ux: guard edge handle gestures
- `8c2e2f9d2` gpu-flow-ux: render data edge labels
- `4ddea8494` gpu-flow-ux: guard marquee selection targets
- `a7d2af4e2` gpu-flow-ux: add section param compatibility matrix
- `0a29f79d2` gpu-flow-perf: add browser performance probe
- `f0002aa98` gpu-flow-perf: cache node quad vertex uploads
- `2ab355962` gpu-flow-perf: resolve paint dirty owners by ancestry
- `8bbde6fca` gpu-flow-perf: account and evict node textures
- `622bed39a` gpu-flow-perf: add large graph stress fixture
- `05b717ddf` gpu-flow-perf: add interaction latency probe

Replacing the renderer was not enough. The branch then worked through gesture
ownership and visual parity: resize handles, drag and drop modes, marquee
selection, minimap drag, viewport helpers, edge colors and dash patterns, edge
z-order, reconnect anchors, labels, scrollable active elements, and locked node
movement.

Performance work made those fixes measurable:

- browser probes captured frame cadence, interaction latency, and large graph
  behavior;
- node quad vertex uploads and DOM transform sync were cached;
- dirty paint ownership was resolved by ancestry;
- edge overlays stopped rerendering on viewport changes;
- node texture memory was accounted and evicted;
- reports under `perf/reports/frontend/2026-04-30_*` captured the baseline and
  final hardening evidence.

The architecture gained an explicit rule: parity and performance are part of
the same design. A GPU path that only draws faster but breaks ownership,
z-order, hit testing, or interaction cadence is not complete.

## Iteration 4: Generalize HTML Surfaces

Representative commits:

- `8f2c7683c` html-gpu-surfaces: add html surface api probes
- `1c58d0fad` html-gpu-surfaces: route transform paint invalidation
- `5b3735f40` html-gpu-surfaces: add stable source layer
- `1426da416` html-gpu-surfaces: stabilize source placement
- `5b027d017` html-gpu-surfaces: move texture management to surfaces
- `e8d7bc856` html-gpu-surfaces: replace quad renderer with surface renderer
- `46b962ec4` html-gpu-surfaces: add hit scene projection
- `100a499b7` html-gpu-surfaces: add tiled surface rendering
- `07f743c27` html-gpu-surfaces: add shader effect rendering
- `afb5a042b` html-gpu-surfaces: add tile dirty ownership
- `c7a7c1b3e` html-gpu-surfaces: enforce upload budgets
- `3160d16d0` html-gpu-surfaces: enforce visual hit projection

The early GPU node texture path evolved into a reusable HTML-in-canvas surface
layer.

Important changes:

- source hosts became stable direct children of `<canvas layoutsubtree>`;
- texture records moved into `htmlSurfaces/textures.ts`;
- visual records supported flat, tiled, mesh, shader-effect, and later native
  rounded-rect rendering paths;
- hit testing projected through the visual scene instead of relying on DOM
  element geometry as the visible truth;
- dirty tile tracking, upload budgets, source placement checks, and Chrome
  probes became part of the renderer contract.

This separated three concepts that had been tangled together: source DOM,
committed texture snapshots, and visible WebGPU visual records.

## Iteration 5: Move Scene Geometry Into GPU Flow

Representative commits:

- `9f75c5602` gpuflow-resize: add generic node resize controller
- `bf952c01e` gpuflow-resize: own section resize gestures
- `578468571` gpuflow-scene: add layout store API
- `1c0b5b760` gpuflow-scene: initialize layout store adapter
- `a2eb261eb` gpuflow-scene: route node drag through layout store
- `f52948e05` gpuflow-scene: route node resize through layout store
- `daf8e56a2` gpuflow-scene: move port geometry into gpuflow
- `2a448cb09` gpuflow-scene: move selection movement into gpuflow
- `b8dc14b26` gpuflow-scene: move reconnect anchors into scene hit testing
- `574f2bd69` gpuflow-scene: move pan zoom policy to project adapter
- `a3e8b1f92` gpuflow-scene: remove generated contracts from gpuflow

The next ownership boundary was geometry. Drag, resize, selection movement,
port local rects, reconnect anchors, minimap fit view, create placement, and
viewport reads moved through the GPU layout store and project adapters.

The split became:

- GPU Flow owns runtime geometry, coordinate conversion, hit testing, and
  interaction previews;
- project adapters own project-specific policy, persistence, and canonical
  state updates;
- generated contracts do not leak into the generic GPU runtime.

This made `GpuFlowScene` the rendering and interaction contract instead of a
derived byproduct of React Flow DOM state.

## Iteration 6: Make The Project A Full Scene

Representative commits:

- `f95034f29` gpuflow-full-scene: add section scene contract
- `cbd2efeac` gpuflow-full-scene: render nested sections as scene surfaces
- `64820e800` gpuflow-full-scene: move child layout into scene executor
- `317c7b141` gpuflow-full-scene: render scene nodes from live layout store
- `31e199641` gpuflow-full-scene: move nested reparent drops into scene
- `f52ffba86` gpuflow-full-scene: move resize policy into scene
- `8363afa92` gpuflow-full-scene: remove dnd kit from gpu project surface
- `d0b377888` gpuflow-full-scene: route section wheel scroll through scene
- `19a1860d3` gpuflow-full-scene: add retained param content scene
- `25d073a32` gpuflow-full-scene: render retained param content surfaces
- `fc037dab1` gpuflow-full-scene: build project edges from scene anchors
- `1705fca59` gpuflow-full-scene: delete static section surface path

This was the clean break from a top-level GPU canvas with DOM-like islands
inside it to a project scene rendered and interacted with through GPU Flow.

It added:

- nested section scene nodes and scene-owned child layout;
- nested drag, reorder, and reparent previews in scene coordinates;
- scene-owned scroll reveal APIs and section wheel routing;
- retained parameter content surfaces;
- scene-owned port anchors and edge connection metadata;
- deletion of the old static section surface path and recursive DOM renderer
  remnants.

The result was a project canvas whose nested structure, edge anchors, resize
previews, section scroll, and retained parameter areas all shared the same
scene coordinate system.

## Iteration 7: Convert Parameter Controls To Descriptor-Owned Surfaces

Representative commits:

- `507da2e16` gpuflow-full-scene: activate retained param dom islands
- `5d41be3bd` gpuflow-full-scene: drag retained param rows
- `d4f03cf24` gpuflow-full-scene: generate param renderer metadata
- `c61fa634c` gpuflow-full-scene: replay retained combobox activation
- `ba1b59b19` gpuflow-full-scene: retain switch controls on canvas
- `da6418d45` gpuflow-full-scene: retain slider controls on canvas
- `1f15c9488` gpuflow-full-scene: retain rotary controls on canvas
- `3f3dd828e` gpuflow-full-scene: retain dropdown choices on canvas
- `3be42d8a3` gpuflow-full-scene: retain date time controls on canvas
- `97ecd6748` gpuflow-full-scene: require retained control descriptors
- `60e0bc6e1` gpuflow-full-scene: derive retained native activation from descriptors
- `92c4bd9a2` gpuflow-full-scene: render edge labels on canvas
- `75da14734` gpuflow-full-scene: render selection overlays on canvas
- `ea5927651` gpuflow-full-scene: render resize affordances on canvas

Parameter rows moved from a mostly DOM-rendered control surface to a
descriptor-owned retained scene:

- row layout, labels, errors, search state, type errors, ports, and drag
  records were generated as retained scene descriptors;
- many controls became canvas-owned retained controls with explicit hit records
  and keyboard/pointer handlers;
- non-text-like controls that still needed native browser behavior became DOM
  islands with narrow activation descriptors;
- edge labels, selection overlays, resize affordances, and drag previews moved
  onto the same canvas/surface ownership path;
- old broad pointer replay and portal preservation paths were narrowed or
  removed.

This made parameter content an explicit scene surface instead of a DOM subtree
whose behavior had to be inferred by hit testing miscellaneous elements.

## Iteration 8: Build The Retained Texture Page Lifecycle

Representative commits:

- `64bd0facb` Name renderer texture boundary as committed snapshots
- `042db2c67` Commit retained texture source windows atomically
- `fb6127f0c` Introduce retained texture snapshot handles
- `9b160eab8` Add retained texture work queue
- `490d4272b` Add retained texture page cache
- `69fa3992f` Add retained content page rasterizer
- `b424baad3` Add retained texture page grid
- `c942d73c9` Add retained texture upload scheduler
- `4f28873d5` Add retained content page manager
- `30047aed8` Render retained content from page textures
- `5a7077bcf` Remove retained content whole-surface overlays
- `97ef5d572` Fix retained page upload starvation

Once retained content was descriptor-owned, whole-surface overlays became too
expensive and too coarse. This iteration introduced page-rasterized retained
content:

- retained source windows committed atomically;
- page grids, page caches, work queues, and upload schedulers owned retained
  texture lifecycle;
- dirty source rects and content invalidation targeted the page cache;
- zoom buckets and hysteresis controlled retained texture resolution;
- page textures replaced whole-surface retained overlays;
- texture work was typed and reported so performance probes could separate
  raster, upload, queue, and draw costs.

The important architectural move was from "rerender a retained area" to
"prove, rasterize, upload, cache, and draw retained page coverage."

## Iteration 9: Stabilize Retained Canvas Behavior

Representative commits:

- `d8081dfe0` Fix retained canvas zoom coverage
- `80298d4a8` Fix retained canvas interaction stability
- `7a8300546` Fix retained canvas visual regressions
- `93d605646` Fix retained settings visual regressions
- `60adba501` Fix retained canvas scroll pan ownership
- `df62ad4fc` Fix retained switch animation compositing
- `52a2f0135` Fix retained switch zoom flash
- `ba593cc20` Fix retained CodeMirror activation

The page system exposed a set of retained-canvas correctness issues: blank
coverage at zoom, stale switch frames, scroll and pan ownership conflicts,
hover artifacts, scrollbar behavior, and CodeMirror activation. This pass made
the retained renderer less monolithic.

Key changes:

- static retained page content, GPU-native retained visuals, and browser-owned
  active controls were treated as separate lifecycles;
- switch transitions moved toward GPU-native rounded-rect visuals instead of
  baking animation state into retained pages;
- row hover and scrollbars became runtime visuals layered with retained pages;
- retained scroll and pan ownership were asserted with behavior tests.

The lesson was that retained pages cache stable structure, while animated,
active, and browser-semantic surfaces need their own owner.

## Iteration 10: Move Runtime State Out Of Scene Mutation

Representative commits:

- `5ed0961b7` Implement retained text-like editor previews
- `0eda94217` Fix retained CodeMirror composition
- `da3bfa2f2` Refactor retained content scroll runtime state
- `3c79b7787` Refactor retained text row snapshots
- `af18baf6f` Fix retained text-like row rendering
- `9fdc1995e` Fix GPU flow pan zoom runtime
- `32e5a8810` frontend: retain gpu flow runtime snapshots

Scroll offsets, viewport transforms, active editor projection, hover state, and
retained-control activation moved into sampled runtime frames instead of being
committed back through scene mutation on every interaction frame.

Important changes:

- retained content scroll state became explicit runtime state;
- `viewportRuntime` became the hot path for pan/zoom and viewport subscribers;
- retained frame sampling used the latest committed scene plus runtime scroll
  and viewport state;
- text-like controls evolved from canvas-drawn approximations toward DOM-derived
  snapshots and active browser-owned editors;
- diagnostics recorded desired runtime state versus published visual state.

The mental model changed from "mutate the scene, then repaint everything" to
"sample scene plus runtime state, then publish a coherent frame."

## Iteration 11: Make Retained Publication Transactional

Representative commits:

- `00aa33ed0` Refactor retained compositor runtime
- `811bfb310` Implement retained runtime frame compositor
- `e3db9ada7` Implement atomic retained display frame pipeline
- `3eb19200c` Refactor retained GPU flow compositor
- `ff0a6aafb` Implement retained content lifecycle compositor
- `1c035eab6` Implement transactional retained compositor

The retained compositor then gained a display-frame boundary. Independently
updated retained artifacts were no longer allowed to leak into the visible
scene as separate decisions.

This introduced:

- `retainedRuntimeFrame.ts` as the sampled retained input frame;
- `retainedDisplayFrame.ts` as the explicit publication result;
- protected resources for textures and pages required by a published frame;
- post-submit maintenance for missing first-visible pages and refinements;
- hold/repair rules when a desired retained frame was not publishable.

Retained publication became transactional: either the retained frame was
publishable as a coherent unit, or the compositor held/repaired according to an
explicit rule.

## Iteration 12: Prefer Continuity, Then Prove Coverage

Representative commits:

- `3dd592066` Refactor GPU Flow retained coverage compositor
- `2dc811568` Implement GPU Flow visual continuity refactor
- `f42f8b8d2` gpu-flow: enforce retained visual continuity

Strict "wait for exact page coverage" logic made retained scroll feel wrong. If
the desired scroll offset changed faster than exact retained pages could be
produced, the visible content could hold an old motion sample for too long.

This iteration added retained coverage proof:

- committed coverage stores and manifests tracked exact and compatible retained
  coverage;
- visible coverage planners classified exact regions, compatible regions, true
  holes, and blocked regions;
- visual epochs made page freshness part of publication logic;
- true-hole retained coverage refused publication;
- previous coherent frames could be held, and cold surfaces could publish
  diagnosed placeholders while first-visible work was queued.

The architecture moved from "do we have the page key?" to "can this committed
generation prove visual, motion, hit-test, source-window, and clip-chain
compatibility for this desired frame?"

## Iteration 13: Generalize Retained Rules To Surface Actors

Representative commit:

- `841d75899` Implement transactional GPU Flow surface compositor

The retained transaction model was generalized into
`frontend/src/gpuFlow/surfaceCompositor/`.

Core concepts:

- `SurfaceActor`: the owner identity for a visual or interactive surface;
- `SurfaceGeneration`: the immutable generation an actor wants to publish;
- `SurfaceCoverageProof`: the reason a generation is exact, compatible,
  blocked, or a true hole;
- `SurfaceDisplayTransaction`: ordered draw commands, protected resources, hit
  index, active DOM island decisions, follow-up work, and motion sample for one
  publishable surface frame.

This gave DOM textures, retained textures, overlays, active islands, and native
visuals a shared publication vocabulary, even though the first concrete use was
still centered on retained content.

## Iteration 14: Move Text-Like Controls Onto A DOM Control Plane

Representative commits:

- `ba99f7387` Implement retained DOM control rendering
- `63ea9305b` Implement GPU Flow DOM control plane

Text-like retained controls remained the hardest boundary. They need browser
text editing semantics, but retained content wants page-rasterized cached
visuals.

The first step rendered passive text-like control DOM as retained source
material, then copied it into retained page textures. That still put visible
text values on a texture correctness path.

The implemented DOM-control plane removed that path:

- `GpuFlowDomControlPlane` became a viewport-positioned sibling of the canvas;
- passive controls render as projected `DummyCodeMirror` display hosts, while
  active controls render `ParamInput` from the same descriptor family;
- retained page rasterization keeps the structural row shell, control slot, and
  active/selected underline, but no longer owns text-like value pixels;
- the old retained DOM-control texture slot path was deleted instead of kept as
  a fallback;
- observed-regression coverage was added around DOM-control blanking, scroll,
  activation, visual parity, and performance-sensitive settings paths.

The browser now owns visible text-like value pixels, caret, selection, IME,
focus, and accessibility. The retained GPU path owns surrounding row structure
and canvas-native controls.

## Iteration 15: Commit All Visible Surface Actors Together

Representative commits:

- `30c3cd672` docs: plan committed gpu flow surface actors
- `97131c98c` docs: refine gpu flow committed surface plan
- `befac9173` Refactor GPU flow committed surface actors

The DOM-control plane fixed text-like value rendering, but it exposed a more
general problem: visible layers could still be sampled from different
generations. A retained page could hold a previous coherent display frame while
the DOM control plane advanced to a prepared frame, or a wheel gesture could
cross a projected `.nopan` control and change ownership mid-burst.

The latest implementation adds `GpuFlowCommittedSurfaceFrame` in
`frontend/src/gpuFlow/committedSurfaceFrame.ts`. It is now the visible
publication boundary for:

- retained page actors;
- projected DOM-control actors;
- DOM island actors;
- retained HTML texture actors;
- GPU-native visual actors;
- hit generation, clip-chain revision, retained scroll revision, z-order, and
  display completeness diagnostics.

`useGpuFlowCommittedSurfaceFrameState()` publishes the committed frame after a
retained display frame resolves, dedupes equivalent render signatures, and
uses the committed frame as the source for the visible DOM control and DOM
island layers. The committed frame asserts that canvas retained content, debug
snapshots, DOM controls, DOM islands, GPU-native visuals, HTML texture overlay
actors, and retained scroll samples agree on one display-frame id.

The same final pass also added a wheel gesture ownership arbiter. Wheel pan,
wheel zoom, retained section scroll, focused editor scroll, and native page
wheel paths now preserve the owner for a wheel burst instead of recomputing
ownership from each event target independently.

This made the next problem visible: committed actor identity existed, but the
runtime still needed a sharper split between content publication, React
semantic snapshots, retained section scroll projection, and hot-path viewport
motion.

## Iteration 16: Make The Committed Runtime Canvas-First

Representative commits:

- `8aaebfd8e` docs: plan canvas-first GPU Flow runtime refactor
- `050a053b8` chore: tighten GPU Flow internal surfaces
- `031ba1fde` docs: harden GPU Flow runtime refactor plan
- `5d2178827` Implement GPU Flow canvas-first committed runtime

This iteration completed the cut from "React-visible committed actor state" to
a runtime-owned committed content frame.
`frontend/src/gpuFlow/committedSurfaceRuntime.ts` now owns publication of the
current committed content frame, exposes React semantic snapshots through
`useSyncExternalStore`, and dedupes React-visible updates with
`createGpuFlowCommittedSurfaceFrameRenderSignature()`. A new committed frame
can update the runtime without forcing a React render when its semantic
signature is unchanged.

The main architectural changes were:

- committed content identity is split from live projection samples, so
  viewport pan/zoom can project already committed actors without publishing new
  semantic React state;
- committed actor generations now separate content, layout/projection,
  readiness, retained scroll revision, and live-motion sample identity;
- retained section scroll uses per-surface retained scroll revisions and a
  distinct `"retained-scroll"` frame reason instead of being folded into the
  global `"viewport"` publication path;
- previous coherent retained display frames survive scene/runtime updates when
  there is no true scene reset, avoiding cold placeholders replacing valid
  content during repair or activation;
- passive text-like values moved back onto canvas-owned retained rendering for
  the migrated Settings path, while active editing still activates
  browser-semantic native DOM islands;
- HTML texture lifecycle state was split into `textureRecords.ts` and related
  diagnostics so committed and pending texture records, dirty source rects,
  deferred resolution-only uploads, and eviction accounting have a clearer
  owner.

The design correction is that GPU Flow has one committed content frame for
what the user sees and interacts with, plus live projection samples for
hot-path viewport and retained-scroll motion. Prepared frames can queue
retained work and candidate actor generations, but they do not independently
drive visible DOM or replace coherent content with startup placeholders.

## Iteration 17: Split Content Publication From Projection

Representative commits:

- `226dac66f` Refine GPU Flow committed runtime boundaries
- `52943beb4` Refactor GPU flow projection runtime
- `bdb1f9659` Implement GPU Flow projection runtime refactor

The content-projection refactor corrected the interim canvas-first text path
and hardened viewport/retained-scroll frame ownership.

The important changes were:

- readable text-like retained parameter rows are DOM-owned again; passive
  values render through projected `DummyCodeMirror` browser DOM or snapshot
  sources, and active editing stays browser-owned through sampled active
  descriptors and the project DOM-island activation path;
- canvas retained row drawing still owns labels, row chrome, focus treatment,
  hover, clipping, hit testing, scrollbars, and final GPU composition, but it
  no longer draws text-like value pixels for DOM-owned controls;
- `GpuFlowCommittedSurfaceFrame` now carries publishability diagnostics,
  actor-family generation ids, text coverage proof, projection horizon
  diagnostics, and coherence checks for retained pages, DOM controls, DOM
  islands, HTML texture actors, native visuals, and hit/debug state;
- viewport and retained-scroll reasons route to a draw-only projection frame
  over the previous committed display when possible. That frame redraws cached
  resources and projects mounted DOM actors without sampling retained runtime
  frames, resolving retained page frames, resolving display transactions,
  creating committed content frames, publishing React semantic state, or
  uploading passive textures;
- retained-scroll projection remaps committed retained page visuals only for
  surfaces whose live scroll offset changed, while unchanged surfaces reuse the
  committed flat visuals;
- the DOM-control plane separates live browser text actors from capture-only
  snapshot sources. Bounded visible actors are mounted and projected as real
  DOM; excess readable passive controls render browser DOM into HTML-surface
  snapshot textures with `exact-snapshot` coverage;
- hidden low-LOD mounts stay bounded, pointer events stay disabled for passive
  display actors, and live retained scroll offsets keep browser-rendered text
  attached during section scroll.

## Iteration 18: Make Projection Runtime Motion-First And Obligated

Representative commits:

- `eaaea93bf` Implement GPU Flow projection runtime
- `98df8d44b` Complete GPU Flow projection state wiring
- `56c3f2c55` Implement GPU flow projection host horizon
- `510089ceb` Finalize GPU Flow projection hold coherence
- `bd04fb8ce` Implement GPU Flow projection runtime obligations
- `542ebd15d` Implement motion-first GPU Flow projection runtime
- `cfcf61200` Implement GPU Flow DOM projection horizon
- `4707c320a` gpu-flow: guard projection publication completion
- `cc9ce10d5` Tighten GPU Flow projection transaction authority
- `10aec7b48` Implement GPU flow projection compatibility proofs
- `36bc09199` Add GPU flow projection transaction diagnostics
- `2453ae28b` Honor GPU Flow projection interleave budgets

The first projection split still left too much implicit behavior in the frame
loop. Mixed reasons such as `retained-scroll + paint + texture-upload` could
fall back to content publication, and DOM-control readiness could still depend
on a React/content commit even while canvas motion projected forward.

This iteration made projection a first-class runtime contract:

- every visible frame starts from an immutable live projection sample carrying
  viewport state, retained scroll offsets and deltas, motion velocities, canvas
  size, device pixel ratio, and the current wheel gesture owner;
- the visible publication scheduler chooses a `content`, `maintenance`,
  `motion`, or `idle` lane and keeps debt queued until the selected lane
  actually publishes a visible frame;
- motion projection frames redraw already committed actors and project mounted
  DOM actors, but reject retained runtime sampling, display transactions,
  texture uploads, committed content publication, and other content work;
- held-previous projection transactions preserve the previous committed frame,
  hit projection, DOM transform batch, activation mapping, and debug identity
  together, with explicit age and frame-count budgets;
- projection horizon obligations classify visible, active-pinned, near-future,
  and maintenance actors with acceptable coverage states rather than relying on
  a binary "ready" flag;
- DOM-control projection gained a bounded directional horizon, live promotion
  from retained scroll samples, compatible-previous proofs, and mounted-host
  budgets so readable controls can be prepared before a React commit catches
  up;
- projection transaction diagnostics now carry committed frame id, sample id,
  transaction id, transaction kind, lane, held-previous state, and gesture owner
  through canvas, DOM-control projection, frame performance events, and
  Playwright probes.

The architectural shift is that projection is no longer just a fast draw path.
It is an obligated transaction system: motion can lead, content and
maintenance remain accountable debt, and every visible projection has a
diagnosable reason why its browser-owned and GPU-owned actors are exact,
compatible, blocked, or held.

## Iteration 19: Finish The Retained Settings Runtime

Representative commits:

- `75fe3a934` Complete GPU Flow retained settings runtime
- `175749438` Add GPU Flow runtime measure attribution
- `ddc3b7745` Implement retained settings GPU flow finish line
- `232eb3885` Finish retained settings runtime flow

The Settings surface became the stress case for the whole architecture: large
retained scenes, many readable text-like controls, nested sections, active DOM
islands, retained scroll, viewport zoom, hover, page repair, and upload
budgets all exercised the same frame loop.

The finish-line work tightened the runtime around that surface:

- retained display publication now performs bounded pre-publish maintenance and
  held-previous repair before publishing, while rejecting cold placeholders for
  visible retained content;
- retained page work carries projection-horizon generations, estimated
  raster/upload cost, queue identity, stale-work rejection, and executed-work
  metrics so repair and refinement are separable from hot motion;
- DOM-control hosts mount progressively in large scenes, with active and
  visible controls prioritized and passive controls deferred without breaking
  projection compatibility;
- the project GPU layout adapter gained a small scene cache and view-mode
  prewarm path so scene derivation does not dominate Settings runtime frames;
- nested section layout sizing and gap rules were pulled into focused project
  helpers instead of being folded into the adapter;
- runtime performance marks attribute committed-surface publication,
  DOM-control host assignment, DOM-control projection, projection-surface
  resolve, retained display transactions, retained page frames, page raster,
  page upload, work scheduling, and texture eviction;
- Chrome repro reporting now treats projection content work, cold placeholder
  publication, true-hole publication, held-previous over-budget frames,
  retained budget misses, post-settle upload spikes, and missing projection
  diagnostics as finish-line failures.

The result is a concrete runtime contract for the retained Settings path:
motion-heavy frames should publish as projection frames, content frames should
publish exact or compatible retained coverage, retained repair should happen
under explicit budgets, and the performance probe should be able to explain
where every GPU Flow millisecond went.

## Current Architecture

After these iterations, GPU Flow has these major boundaries:

- Project owners remain canonical for section structure, dimensions, ordering,
  parameter values, edge connections, and persistence.
- `GpuFlowScene` and the GPU layout store describe renderable geometry,
  clipping, section layout, port anchors, scroll state, and in-progress
  interaction previews.
- DOM section sources and HTML overlays are browser DOM mounted under
  `<canvas layoutsubtree>` and uploaded as cached WebGPU HTML textures.
- `htmlSurfaces/textureRecords.ts` owns committed and pending texture handles,
  dirty source rect identity, dirty tile summaries, memory snapshots,
  diagnostics, and eviction ordering for those HTML texture actors.
- Retained parameter content is project-owned descriptor data rasterized into
  retained texture pages.
- GPU-native retained visuals handle scrollbars, row hover, and switch
  transitions without dirtying static retained pages for every visual tick.
- Readable passive text-like retained values are browser-owned DOM-control
  actors: live projected hosts when budgeted, or browser-rendered snapshot
  source textures when live projection is not available. Active text-like
  editing stays browser-owned through active descriptors and the DOM-island
  path. Canvas retained drawing owns row chrome but not text-like value pixels.
- `GpuFlowDomControlPlane` and DOM islands preserve browser-owned semantics for
  text editing, non-text-like retained controls, and editable labels that
  should not be emulated by canvas.
- `surfaceCompositor/` provides the shared actor, generation, coverage,
  transaction, diagnostics, protected-resource, and follow-up-work vocabulary.
- `GpuFlowCommittedSurfaceFrame` is the visible commit boundary that ties
  retained pages, DOM controls, DOM islands, HTML texture actors, GPU-native
  visuals, hit testing, debug snapshots, retained scroll samples, and
  completeness diagnostics to one frame.
- Committed surface frames own content publication; live projection samples can
  advance without independently advancing React-visible committed content.
- `projectionRuntime.ts` owns immutable live projection samples, projection
  transactions, held-previous debug state, and projection horizon obligations.
- `projectionScheduler.ts` arbitrates content, maintenance, and motion lanes,
  and only clears publication debt after the chosen lane actually publishes.
- DOM-control projection is bounded by a directional horizon, mounted-host
  budgets, and compatible-previous proofs, so browser-owned readable controls
  can stay visually continuous through retained scroll and viewport motion.
- Retained display publication includes pre-publish page maintenance and
  bounded held-previous repair before a retained display frame becomes visible.
- GPU Flow runtime measurements now attribute projection, content publication,
  retained page work, DOM-control projection, scheduling, and eviction phases
  to the frame performance stream and Chrome repro reports.
- The viewport and retained-scroll transforms remain live so pan, zoom, and
  retained section scroll can project already committed actors without waiting
  for React render, retained publication, or texture upload.

## Design Direction

The branch moved GPU Flow in these directions:

1. From a React Flow / XYFlow-shaped DOM graph to a WebGPU-owned project
   runtime.
2. From viewport changes that touched DOM and texture state to camera/projection
   frames over cached content.
3. From ad hoc active overlays to explicit browser-owned source projection.
4. From DOM-derived geometry to `GpuFlowScene` and GPU layout store ownership.
5. From section DOM subtrees for parameter rows to descriptor-owned retained
   parameter content.
6. From whole retained overlays to page-rasterized retained texture coverage.
7. From page identity to explicit retained coverage and visual continuity
   proof.
8. From retained-only compositor rules to generalized surface actor
   transactions.
9. From copied text-like snapshots to visible projected DOM controls.
10. From independently advanced visible layers to one committed surface frame.
11. From React-owned committed publication to a runtime-owned committed
    content frame with separate live projection samples.
12. From a combined content/projection path to draw-only projection frames for
    viewport and retained-scroll reasons.
13. From canvas-drawn text-like passive values back to browser-owned readable
    DOM actors with explicit committed-frame coverage proof.
14. From live-only passive text actors to bounded browser-rendered snapshot
    artifacts for excess visible passive controls.
15. From projection as an optimization to motion/content/maintenance
    publication lanes with transaction identity and accountable debt.
16. From current-frame DOM-control readiness to horizon-prepared,
    compatibility-proven browser actors.
17. From retained Settings as a bug-fixing target to a measured finish-line
    runtime with phase attribution and explicit failure budgets.

The remaining pressure is not whether GPU Flow should be canvas-first or
whether active/browser-semantic text-like controls should use real DOM. Those
decisions have been made in code. The ongoing pressure is tightening the
commit boundary so every new visual or interactive surface declares its owner,
generation, coverage proof, projection policy, and interaction ownership
explicitly, then proving that contract in the frame performance stream as the
same rules spread beyond the Settings stress path.

## Verification Trail

Useful reports from this branch:

- [WebGPU HTML texture probe](../../perf/reports/frontend/2026-04-28_webgpu_html_texture_probe.md)
- [GPU Flow live DOM final verification](../../perf/reports/frontend/2026-04-29_gpu-flow-live-dom-final-verification.md)
- [GPU Flow performance visual hardening final](../../perf/reports/frontend/2026-04-30_gpu-flow-performance-visual-hardening-final.md)
- [HTML GPU surfaces completion verification](../../perf/reports/frontend/2026-05-02_html-gpu-surfaces-completion-verification.md)
- [GPU Flow scene ownership baseline](../../perf/reports/frontend/2026-05-03_gpuflow-scene-ownership-phase1-baseline.md)
- [GPU Flow retained content final stabilization](../../perf/reports/frontend/2026-05-06_gpuflow-retained-content-final-stabilization.md)
- [Retained canvas tiled LOD baseline](../../perf/reports/frontend/2026-05-10_retained-canvas-tiled-lod-baseline.md)
- [Retained canvas tiled LOD after](../../perf/reports/frontend/2026-05-10_retained-canvas-tiled-lod-after.md)
- [GPU Flow retained snapshot runtime refactor](../../perf/reports/frontend/2026-05-13_gpu-flow-retained-snapshot-runtime-refactor.md)
- [GPU Flow retained compositor runtime refactor](../../perf/reports/frontend/2026-05-14_gpu-flow-retained-compositor-runtime-refactor.md)
- [GPU Flow scroll-first retained compositor refactor](../../perf/reports/frontend/2026-05-15_gpu-flow-scroll-first-retained-compositor-refactor.md)
- [GPU Flow transactional retained compositor](../../perf/reports/frontend/2026-05-15_gpu-flow-transactional-retained-compositor.md)
- [GPU Flow transactional surface compositor after report](../../perf/reports/gpu-flow-transactional-surface-compositor-after-20260516.md)
- [GPU Flow visual continuity refactor after report](../../perf/reports/gpu-flow-visual-continuity-refactor-after-20260516.md)
- [GPU Flow DOM control plane refactor after report](../../perf/reports/gpu-flow-dom-control-plane-refactor-after-20260517.md)
- [Committed surface actor refactor strict sample](../../perf/reports/frontend/2026-05-17_gpu-flow-committed-surface-actor-refactor-strict.jsonl)
- [GPU Flow canvas-first committed surface runtime](../../perf/reports/frontend/2026-05-18_gpu-flow-canvas-first-committed-surface-runtime.md)
- [GPU Flow content projection runtime refactor after report](../../perf/reports/gpu-flow-content-projection-runtime-after-20260518.md)
- [GPU Flow principled projection runtime after report](../../perf/reports/gpu-flow-principled-projection-runtime-after-20260518.md)
- [GPU Flow held-previous projection report](../../perf/reports/gpu-flow-principled-projection-runtime-held-previous-20260519.md)
- [GPU Flow projection publication completion guard](../../perf/reports/gpu-flow-principled-projection-runtime-publication-completion-20260519.md)
- [GPU Flow principled projection runtime verification](../../perf/reports/gpu-flow-principled-projection-runtime-verification-20260519.md)
- [GPU Flow DOM-control projection horizon](../../perf/reports/gpu-flow-dom-control-projection-horizon-20260519.md)
- [GPU Flow projection transaction diagnostics](../../perf/reports/frontend/2026-05-19_gpu-flow-projection-transaction-diagnostics.md)
- [GPU Flow retained settings finish-line after](../../perf/reports/frontend/2026-05-19_gpu-flow-retained-settings-finish-line-after.md)
- [GPU Flow retained settings runtime measures](../../perf/reports/frontend/2026-05-19_gpu-flow-retained-settings-runtime-measures-after.md)
- [GPU Flow retained settings runtime finish line](../../perf/reports/gpu-flow-retained-settings-runtime-finish-line-20260519.md)

Together, these reports show the same architectural progression from the
measurement side: less hidden publication work, more explicit diagnostics, more
observed-behavior regression coverage, and clearer separation between live
viewport motion, retained section scroll projection, retained texture work, DOM
projection, committed visible frames, projection transaction debt, and retained
finish-line budgets.
