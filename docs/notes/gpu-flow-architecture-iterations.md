# GPU Flow Architecture Iterations

Date: 2026-05-27

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

That range contains 1191 commits from 2026-04-28 through 2026-05-27. Not every
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

That implementation added `GpuFlowCommittedSurfaceFrame` in
`frontend/src/gpuFlow/committedSurfaceFrame.ts`. It became the visible
publication boundary for:

- retained page actors;
- projected DOM-control actors;
- DOM island actors;
- retained HTML texture actors;
- GPU-native visual actors;
- hit generation, clip-chain revision, retained scroll revision, z-order, and
  display completeness diagnostics.

`useGpuFlowCommittedSurfaceFrameState()` published the committed frame after a
retained display frame resolved, deduped equivalent render signatures, and
used the committed frame as the source for the visible DOM control and DOM
island layers. The committed frame asserts that canvas retained content, debug
snapshots, DOM controls, DOM islands, GPU-native visuals, HTML texture overlay
actors, and retained scroll samples agree on one display-frame id.

The same final pass also added a wheel gesture ownership arbiter. Wheel pan,
wheel zoom, retained section scroll, focused editor scroll, and native page
wheel paths began preserving the owner for a wheel burst instead of recomputing
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
At that point, `frontend/src/gpuFlow/committedSurfaceRuntime.ts` owned
publication of the current committed content frame, exposed React semantic
snapshots through
`useSyncExternalStore`, and dedupes React-visible updates with
`createGpuFlowCommittedSurfaceFrameRenderSignature()`. A new committed frame
could update the runtime without forcing a React render when its semantic
signature is unchanged.

The main architectural changes were:

- committed content identity is split from live projection samples, so
  viewport pan/zoom can project already committed actors without publishing new
  semantic React state;
- committed actor generations began to separate content, layout/projection,
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

At that stage, the design correction was that GPU Flow had one committed
content frame for what the user sees and interacts with, plus live projection
samples for hot-path viewport and retained-scroll motion. Prepared frames could
queue retained work and candidate actor generations, but they did not
independently drive visible DOM or replace coherent content with startup
placeholders.

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
- `GpuFlowCommittedSurfaceFrame` carried publishability diagnostics,
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

## Iteration 20: Unify Browser-Owned Visual Actors

Representative commits:

- `efabf200a` Add browser visual actor runtime plan
- `aff777088` Implement browser visual actor runtime
- `c243af2e3` Implement GPU Flow browser visual actor runtime
- `4b49c2115` Implement browser visual actor runtime
- `1f76c0ee9` Implement GPU flow browser visual actor runtime
- `a4b4965e0` Implement browser visual actor runtime

The retained Settings finish line exposed one remaining split: committed
surface frames could describe DOM-control coverage while the actual
browser-owned layer was still mounted, parked, or projected by separate
React-visible paths. The May 20 work turned DOM controls and DOM islands into
one browser visual actor family that participates in the same surface
transaction as retained pages and native visuals.

The implementation added `GpuFlowBrowserVisualActorRuntime` and
`surfaceCompositor/browserVisualActorAdapter.ts`.

Key changes:

- browser-owned actors declared visibility, nonempty reason, coverage
  requirement, coverage exemption, representation kind, activation class,
  clip-chain membership, and resource handles before publication;
- DOM-control and DOM-island actors adapt into shared `SurfaceActor`,
  `SurfaceGeneration`, coverage proof, draw-command, protected-resource, and
  z-order fragments instead of using a separate browser-only completeness
  path;
- representation readiness is explicit: live host, exact browser-rendered
  snapshot, compatible previous, blocked awaiting live host, blocked awaiting
  snapshot, true hole, or typed coverage exemption;
- passive display, passive snapshot, active editor, compatible previous, and
  blocked states are variants of one canonical browser actor identity for
  text-like retained controls;
- the browser visual runtime subscribed to the committed surface runtime
  outside React semantic deduplication and staged DOM-control host assignments,
  snapshot-source controls, DOM-island elements, projection transforms, and
  offscreen parking from the committed content frame;
- committed surface publication began gating on actual browser visual readiness,
  requests follow-up texture-upload work when browser coverage is missing,
  holds previous coherent projection when that is the valid outcome, and fails
  loudly for true-hole browser visual coverage;
- starvation diagnostics record blocked actor ids, required representation,
  pending work id, age, blocked frame count, visible actor count, and whether
  the frame blocked or held previous;
- Chrome repro mode remains instrumentation and visual evidence collection,
  not a rendering policy input.

This iteration tightened the commit boundary from "the descriptor says a
browser control should be visible" to "the published transaction proves the
actual browser representation the user will see and hit is live, exact
snapshot, compatible previous, or explicitly blocked." It also made browser
visual evidence part of the finish-line reports, so descriptor counts cannot
mask blank text-like controls.

## Iteration 21: Cut Over To One Visible Publication Authority

Representative commits:

- `5288f9536` Plan GPU Flow single publication authority cutover
- `27773b6ee` gpuflow: cut over visible publication authority
- `adfa10269` Consolidate GPU flow publication authority
- `1e23e447a` Harden GPU flow publication token guards
- `b03a2b3bf` Add GPU flow publication diagnostics tests
- `0f2e8eef6` Finalize GPU flow publication authority cutover
- `64fa47352` Centralize GPU flow frame publication authority
- `7b2775f43` Move visible publication authority phases into kernel
- `557319aa7` Consolidate visible frame publication proof ownership
- `95f1d9a6c` Extract visible frame publication authorities
- `481c5db03` Bind GPU flow commits to oracle authority proof
- `bceb468e9` Cut over GPU flow actor proof authority
- `5e009c277` Move GPU flow presentation authority into kernel
- `e76971675` Move GPU flow publication completion authority into kernel
- `932910655` Move GPU flow publication decisions into kernel
- `6889f25cf` Defer GPU flow canvas submission until publication
- `76f34afa5` Promote browser visual hosts during publication
- `fbd5af845` Defer React semantic surface notifications
- `9af1f70d6` Defer browser visual store notifications
- `f5a9803e8` Make GPU Flow publication token issuer private
- `4b5810334` Remove committed surface lifecycle publication tokens
- `451960b95` Demote publication candidates to prepared facts
- `8ddc9e45a` Prove visible publication presentation evidence
- `59013debc` Reduce presentation proof diagnostics complexity

The browser visual actor runtime made the final ownership problem explicit:
content publication, motion projection, browser host promotion, canvas
submission, React semantic notifications, retained display side effects, and
blocked/held diagnostics were all visible-frame decisions, but parts of them
could still be completed by separate helpers.

The May 21-23 cutover ultimately moved those decisions behind one coherent
visible-frame engine:

- `visibleFrameCoordinator.ts` samples one live projection frame, selects the lane,
  prepares content and motion candidates, asks the engine-owned proof reducers
  to prove the candidates, and returns exactly one outcome: presented,
  projected, held, blocked-cold-start, or aborted;
- content and motion candidates are prepared facts, not permission to mutate
  visible state. They become visible only after actor proofs, resource
  protection proofs, compatible-previous proofs, and presentation evidence
  agree;
- outcome tokens are minted by the visible-frame presentation-token path and
  guard every side effect that can make a frame visible or release resources
  from an aborted candidate;
- canvas submission is deferred until visible-frame presentation, so the frame
  that produces WebGPU output is the same frame whose DOM/browser visual
  generation has been staged and proven exposable;
- the visible-frame presentation path completes browser visual host promotion,
  browser visual store notifications, React semantic surface notifications,
  retained display publication, projection debug ids, overlay transforms,
  node-layer presentation state, and selected resource release from one
  presentation barrier rather than from preparation;
- blocked and held outcomes carry frozen-frame identity and explicit reasons
  instead of leaking partial side effects or letting a failed content candidate
  advance visible state;
- visible-frame diagnostics now distinguish selected lane, candidate proof
  result, actor/resource/presentation proof failures, browser visual
  starvation, held-previous age, cold-start shell publication, and completed
  frame debt.

The architecture changed from "a committed surface frame is the shared visible
boundary" to "a committed surface frame is one prepared input to a visible frame
transaction." The visible-frame engine is now the authority that decides which
prepared facts become user-visible and which effects are allowed to run.

## Iteration 22: Harden Visible-Frame Outcomes And Evidence

Representative commits:

- `d218256f0` Add GPU Flow visible frame reducer
- `6df5adc81` Add GPU Flow visible frame engine lifecycle
- `2a71cf9aa` Bridge GPU Flow transactions into visible frame engine
- `5459a0ef8` Run GPU Flow publication through visible frame engine
- `3d41cf819` Split GPU Flow engine proof selection
- `984458842` Split GPU Flow transaction proof adapters
- `6739dff25` Split GPU Flow presentation proof authority
- `b0f20e5a6` Split GPU Flow retry cooldown lanes
- `0f0a63eeb` Stamp GPU Flow presentation identity
- `30b9b8dc2` Move GPU Flow starvation policy into engine
- `ece0705e5` Move visible frame resource lifetime into registry
- `79de7e575` Cover active editor abort and clip cases

After the visible-frame authority cutover, the next pass made that authority
operationally harder to misuse. The old publication modules had been removed,
but the engine still needed sharper lifecycle types, retry rules, resource
ownership, identity evidence, and active-editor coverage.

This iteration tightened the finish-line contracts:

- `visibleFrameStateMachine.ts` became the explicit lifecycle reducer for
  `presented`, `projected`, `held`, `blocked-cold-start`, and `aborted`
  outcomes, with production publication routed through the engine instead of
  legacy publication authority shells;
- actor proof selection, transaction proof adapters, presentation proof
  authority, candidate action, content decision, and fault parsing were split
  into focused modules so candidate preparation cannot also complete
  presentation side effects;
- visible-frame resource lifetime moved into `visibleFrameResourceGraph.ts`,
  making protected resources and releases part of the selected outcome rather
  than an incidental cleanup path;
- retry behavior became lane-specific: browser-visual blocked content debt,
  content/maintenance held-previous blocks, and motion held-previous blocks now
  cool down separately instead of immediately replaying rejected candidates
  during retained motion;
- starvation policy moved into the engine, so held-previous age, frame-count
  budgets, content interleave, maintenance interleave, and motion settle windows
  are visible-frame decisions rather than scheduler side effects;
- presentation identity now carries content-frame id, presentation id,
  projection sample id, browser host epochs, and debug-snapshot evidence through
  committed frames, projected hosts, repro payloads, and outcome reports;
- active text-editor coverage was verified across retained motion, held
  candidate aborts, clip-boundary projection, focus/selection preservation, and
  accessibility exposure.

The practical change is that "visible publication" is no longer just a module
name. It is a lifecycle with typed outcomes, resource ownership, bounded retry
policy, and observable presentation identity.

## Iteration 23: Make Visible Resource Debt Budgeted Work

Representative commits:

- `676768581` Separate browser visual prep from diagnostics
- `7de7419c0` Make visible frame resources budgeted owner debt
- `cd617526b` Route frame context deferral through budget broker
- `725da7e38` Feed resource graph debt into frame budget decisions
- `3744349f3` Drive resource preparation from frame budget
- `e0e4d07bd` Remove resource graph drain escape hatch
- `2574c092b` Let visible resource debt preempt motion
- `9fb5383d5` Require budgeted resource work selection
- `a312bc63c` Prioritize critical visible surface first uploads
- `c2913672d` Recompute frame context after budget lane preemption

Once the visible-frame engine owned outcomes, the next failure mode was that
resource preparation could still behave like a side channel. Browser visual
host work, snapshot preparation, retained page repair, texture uploads, and
section actor work were visible prerequisites, but they were not all competing
inside one bounded frame budget.

This iteration moved resource work into the visible-frame decision path:

- browser visual preparation stopped being diagnostic-only state and became
  resource graph debt with owner, priority, lane, and deadline;
- `visibleFrameBudgetBroker.ts` started selecting content, maintenance,
  motion, browser visual, retained page, texture, and section-structure debt
  before candidate preparation runs;
- resource graph debt can preempt projection motion when the selected visible
  work is safety or continuity critical;
- the old "drain everything" escape hatch was removed, so visible-frame work
  must be explicitly selected, prepared, presented, deferred, or diagnosed as
  over budget;
- critical first-visible uploads and concrete browser visual debt are selected
  before lower-priority catch-up work.

The architectural move was from "the engine notices resources are missing" to
"the engine budgets the resource work needed to make a visible frame true."

## Iteration 24: Move Presenter Effects Behind Presentation Evidence

Representative commits:

- `a81c9ca57` Defer GPU Flow DOM transform presentation
- `be17a4643` Gate DOM transforms on visible frame presentation
- `da179aa4b` Stamp DOM transform presentation identity
- `b63268581` Enforce frozen browser visual presentation barriers
- `557f115f1` Defer HTML surface texture eviction to presentation
- `9aefae962` Require DOM transform evidence for visible commits
- `4b804f814` Require texture eviction evidence for visible commits
- `c429f5315` Bind commit tokens to projection transaction kind
- `3a488fba8` Guard production HTML surface renders as deferred
- `9070db429` Move visible frame resource work before publication

The budgeted-resource pass made another boundary visible: side effects could be
correctly selected but still run too early. DOM transform application, texture
eviction, canvas submission, browser visual promotion, retained display
publication, and resource release all needed to be tied to the same selected
visible-frame presentation.

This pass tightened presentation into an evidence-bearing barrier:

- DOM transforms are stamped with presentation identity and gated by the
  selected visible-frame token;
- texture eviction is deferred until presentation and requires eviction
  evidence for the frame being presented;
- frozen browser visual barriers prevent blocked or held candidates from
  mutating live hosts while their prepared content is not selected;
- HTML surface renders on the production path are treated as deferred work
  until the visible-frame presenter admits them;
- presentation tokens are bound to the projection transaction kind, so content,
  motion, held, and blocked outcomes cannot reuse the wrong authority proof.

The result is that preparation can stage facts, but only presentation evidence
can expose them or retire the resources behind the previously visible frame.

## Iteration 25: Rename Prepared And Presented Boundaries

Representative commits:

- `2957785ee` Enforce strict visible frame projection coverage
- `090a50cf7` Route visible presentation through coordinator authority
- `73745189a` Centralize visible-frame outcome reductions
- `c371fe240` Split visible frame state machine reductions
- `38178504d` Rename visible semantic runtime to presented surface runtime
- `579140c54` Rename committed surface owner to prepared content
- `af00cef8a` Rename presentation token runtime APIs
- `709ee6022` Rename visible frame scheduler runtime to reducer runtime
- `ccad36155` Route browser visual prep through resource graph
- `3c23d9645` Guard visible frame reducer boundaries

After the engine was working, the names were carrying the wrong mental model.
"Committed surface" implied the prepared content frame was already visible.
"Publication" blurred content preparation, reducer selection, and presenter
effects. The May 26 pass renamed the runtime around what the code actually
does.

The important structural changes were:

- `GpuFlowCommittedSurfaceFrame` became `GpuFlowPreparedContentFrame`: a
  prepared content fact with actor generations, retained display state, browser
  visual fragments, completeness diagnostics, and presentation proof;
- the old semantic/committed runtime became `presentedSurfaceRuntime.ts`,
  which exposes the frame that actually became visible;
- `visibleFrameScheduling.ts` became `visibleFrameReducerRuntime.ts`, and
  reducer state, reducer decisions, reducer debt, content work lanes, and
  unpresented completion paths were named around reduction rather than
  scheduling;
- outcome reduction was split and centralized so lifecycle transitions,
  blocked proofs, selected resource debt, and presentation completion are
  reduced in one vocabulary;
- strict projection coverage and coordinator-owned presentation authority made
  projection-only success impossible without the coverage and token proof for
  the selected outcome.

The design correction was not cosmetic. It separated prepared content,
presented surface state, visible-frame reduction, and presentation effects into
different owners with names that match their authority.

## Iteration 26: Stabilize Cadence And Continuity Repair

Representative commits:

- `75335d92a` Allow visible repair preparation during motion
- `6115a40a4` Expose classified visible frame debt age
- `e45389498` Force retained scroll continuity repair after debt ages
- `e27d5c4e1` Keep continuity repair out of deferred skip
- `3b4a5803c` Record visible debt diagnostics on surface frames
- `ef04f9716` Force safety debt ahead of motion
- `918be0ff7` Promote GPU flow actor resources into graph lifecycle
- `03b6f0ee7` Budget continuity repair during GPU flow motion
- `e4052af12` Stabilize GPU flow visible frame cadence
- `6cbafa07a` Skip full content prep during motion repair
- `3a0c94697` Reuse identical prepared content frames
- `0b505c519` Reuse identical retained display frames
- `ca580d081` Defer viewport-only continuity catchup work
- `e86ffef2c` Clear content debt for retained compatible pages

The manual Chrome recordings after the visible-frame refactor showed that the
source had the right ownership shape but could still feel broken: retained
section scroll and pan/zoom were able to keep choosing motion or held outcomes
while safety or continuity debt aged for hundreds of frames. The engine could
explain the debt, but it did not always spend the budget needed to repair it.

The cadence pass changed the runtime rules:

- visible debt is classified as safety, continuity, or quality and carries age
  into reducer, budget, and surface-frame diagnostics;
- aged safety and continuity debt can force or reserve repair work during
  motion instead of being skipped by a projection-only frame;
- continuity repair uses a bounded path that can prepare the needed retained
  pages, actors, or browser visuals without forcing a full content pass on
  every motion frame;
- identical prepared content frames and retained display frames are reused, so
  cadence work does not create churn when content facts have not changed;
- viewport-only catch-up can be deferred, while retained-compatible pages clear
  content debt instead of keeping the repair loop alive;
- section header actors and actor resources are promoted into the resource
  graph lifecycle so first-visible section structure is part of the same
  visible-frame contract as retained pages and browser visuals.

This iteration made the visible-frame architecture more honest about the
remaining user-facing pressure: frame cadence and scroll continuity are not
secondary telemetry. They are conformance requirements that must be satisfied
by the same resource graph, reducer, and presentation boundary.

## Current Architecture

After these iterations, GPU Flow has these major boundaries:

- Project owners remain canonical for section structure, dimensions, ordering,
  parameter values, edge connections, and persistence.
- `GpuFlowScene` and the GPU layout store describe renderable geometry,
  clipping, section layout, port anchors, scroll state, and in-progress
  interaction previews.
- DOM section sources and HTML overlays are browser DOM mounted under
  `<canvas layoutsubtree>` and uploaded as cached WebGPU HTML textures.
- `htmlSurfaces/textures.ts`, `htmlSurfaces/textureRecords.ts`, and the
  texture helper modules own committed and pending texture handles, dirty
  source rect identity, dirty tile summaries, memory snapshots, diagnostics,
  paint deferral, upload ordering, and eviction for HTML texture actors.
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
- `GpuFlowBrowserVisualActorRuntime` owns browser-owned visible
  representations for DOM controls and DOM islands: live host assignment,
  browser-rendered snapshot source coverage, compatible-previous records,
  projection transforms, offscreen parking, and readiness diagnostics.
- `surfaceCompositor/` provides the shared actor, generation, coverage,
  transaction, diagnostics, protected-resource, and follow-up-work vocabulary.
- `surfaceCompositor/browserVisualActorAdapter.ts` adapts DOM-control and
  DOM-island actors into that shared vocabulary, so browser-owned visual
  coverage participates in the same transaction as retained pages and native
  visuals.
- `GpuFlowPreparedContentFrame` is the prepared content boundary that ties
  retained pages, DOM controls, DOM islands, HTML texture actors, GPU-native
  visuals, hit testing, debug snapshots, retained scroll samples, browser
  visual fragments, and completeness diagnostics to one prepared fact.
- `preparedContentPresentationProof.ts` binds each prepared content frame to a
  presentation batch, actor-manifest digest, DOM generation evidence, canvas
  generation evidence, browser visual fragment digest, and surface transaction
  digest.
- `presentedSurfaceRuntime.ts` exposes the prepared content frame that actually
  became the presented surface for React semantic subscribers and browser visual
  layers.
- `GpuFlow/visibleFrameActorAdapters/browserVisualProofs.ts` and
  `GpuFlowBrowserVisualActorRuntime` gate browser-owned visual readiness and
  record starvation when visible nonempty browser-owned actors cannot produce
  live, snapshot, or compatible-previous coverage.
- Prepared content frames are not publication by themselves. They become
  visible only when the visible-frame reducer and presentation authority select
  them, while live projection samples can advance without independently
  advancing React-visible presented content.
- `GpuFlow/visibleFrameStateMachine.ts`, `GpuFlow/visibleFrameCoordinator.ts`,
  `GpuFlow/visibleFrameStateMachineReduction.ts`,
  `GpuFlow/visibleFrameReducerRuntime.ts`,
  `GpuFlow/visibleFrameContentPlan.ts`, `GpuFlow/visibleFrameProjectionWork.ts`,
  and `GpuFlow/visibleFrameTransactionProofs.ts` own the single visible-frame
  coordinator, reducer authority, prepared content and motion facts,
  actor/resource/presentation proofs, projection work plans, presentation
  token issuance, and completion accounting that select presented, projected,
  held, blocked-cold-start, or aborted outcomes.
- `GpuFlow/visibleFramePresentationAuthorityProofs.ts`,
  `GpuFlow/visibleFrameResourceGraph.ts`,
  `GpuFlow/visibleFramePresentationTokens.ts`, and
  `GpuFlow/visibleFrameIdentityAttributes.ts` bind visible-frame outcomes to
  protected resources, presentation tokens, content-frame ids, presentation ids,
  projection sample ids, browser host epochs, and debug/repro identity.
- `GpuFlow/visibleFramePresentation.ts` owns presenter effects: canvas
  submission, presented-surface store mutation, browser visual host promotion,
  browser visual notifications, retained display state, projection debug ids,
  overlay transforms, node-layer frame state, and resource release all require
  an outcome token for the selected visible frame.
- `GpuFlow/visibleFrameBudgetBroker.ts`,
  `GpuFlow/visibleFrameClassifiedDebt.ts`, and
  `GpuFlow/visibleFrameResourceGraphResources.ts` classify safety, continuity,
  quality, content, maintenance, motion, and concrete resource debt, select
  bounded preparation work, and record selected, deferred, and over-budget debt
  in surface-frame diagnostics.
- `projectionRuntime.ts` owns immutable live projection samples, projection
  transactions, held-previous debug state, and projection horizon obligations.
- `projectionSchedulerPolicy.ts` supplies motion/content policy helpers, while
  the visible-frame reducer runtime arbitrates content, maintenance, and motion
  lanes and only clears debt after the selected outcome is reduced and
  presented or explicitly recorded as unpresented.
- DOM-control projection is bounded by a directional horizon, mounted-host
  budgets, and compatible-previous proofs, so browser-owned readable controls
  can stay visually continuous through retained scroll and viewport motion.
- Retained display publication includes pre-publish page maintenance and
  bounded held-previous repair before a retained display frame becomes visible.
- GPU Flow runtime measurements now attribute projection, content preparation,
  retained page work, DOM-control projection, visible-frame reduction, resource
  debt, presentation, and eviction phases to the frame performance stream and
  Chrome repro reports.
- The viewport and retained-scroll transforms remain live so pan, zoom, and
  retained section scroll can project already presented actors without waiting
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
10. From independently advanced visible layers to one prepared content frame.
11. From React-owned committed publication to a runtime-owned prepared content
    frame with separate live projection samples and presented surface state.
12. From a combined content/projection path to draw-only projection frames for
    viewport and retained-scroll reasons.
13. From canvas-drawn text-like passive values back to browser-owned readable
    DOM actors with explicit prepared-frame coverage proof.
14. From live-only passive text actors to bounded browser-rendered snapshot
    artifacts for excess visible passive controls.
15. From projection as an optimization to motion/content/maintenance
    publication lanes with transaction identity and accountable debt.
16. From current-frame DOM-control readiness to horizon-prepared,
    compatibility-proven browser actors.
17. From retained Settings as a bug-fixing target to a measured finish-line
    runtime with phase attribution and explicit failure budgets.
18. From DOM-control and DOM-island-specific visibility paths to a shared
    browser visual actor runtime.
19. From descriptor-count completeness to actual browser representation
    coverage: live host, exact snapshot, compatible previous, blocked, or true
    hole.
20. From Chrome recording as an accidental rendering-policy input to Chrome
    recording as screenshot-backed browser visual evidence.
21. From distributed visible side effects to one visible publication authority
    that selects commit, hold-previous, or blocked.
22. From publication candidates that could imply side effects to prepared facts
    adjudicated by actor, resource, compatible-previous, and presentation
    proofs.
23. From implicit DOM/canvas readiness to explicit presentation evidence for
    the browser visual generation and deferred canvas submission.
24. From shared publication helpers to module-private outcome tokens that guard
    presented-frame mutation, browser visual promotion, retained display
    updates, projection state, reducer debt completion, and resource release.
25. From a single authority cutover to a visible-frame lifecycle with typed
    presented, projected, held, blocked-cold-start, and aborted outcomes.
26. From generic blocked/held retries to lane-specific retry cooldowns and
    engine-owned starvation budgets.
27. From local frame ids to presentation identity that ties content frame,
    projection sample, browser host epoch, debug snapshot, and repro evidence
    together.
28. From resource preparation as follow-up work to budgeted visible-frame debt
    selected before candidate preparation.
29. From presenter side effects that could run during preparation to DOM
    transform, canvas, texture eviction, browser visual, and resource-release
    effects gated by presentation evidence.
30. From committed-surface vocabulary to prepared content, presented surface,
    visible-frame reducer, and presentation-effect owners.
31. From motion winning indefinitely over stale retained-scroll content to
    safety and continuity debt with age, deadlines, reserved repair budget, and
    observed cadence conformance.

The remaining pressure is not whether GPU Flow should be canvas-first or
whether active/browser-semantic text-like controls should use real DOM. Those
decisions have been made in code. The ongoing pressure is tightening the
visible-frame boundary so every new visual or interactive surface
declares its owner, generation, representation coverage, projection policy, and
interaction ownership explicitly, then proving visual continuity and frame
cadence from browser-observed evidence instead of trusting internal invariants
alone.

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
- [GPU Flow browser visual finish-line report](../../perf/gpu-flow-browser-visual-finish-line-report.md)
- [GPU Flow browser visual actor runtime finish-line report](../../perf/gpu-flow-browser-visual-actor-runtime-finish-line-20260520.md)
- [GPU Flow visible frame baseline](../../perf/reports/frontend/2026-05-23_gpu-flow-visible-frame-baseline.md)
- [GPU Flow visible frame retry follow-up](../../perf/reports/frontend/2026-05-23_gpu-flow-visible-frame-retry-followup.md)
- [GPU Flow visible frame final verification](../../perf/reports/frontend/2026-05-23_gpu-flow-visible-frame-final-verification.md)
- [GPU Flow browser-style visible frame refactor verification](../../perf/reports/frontend/2026-05-24_gpu-flow-browser-style-visible-frame-refactor-verification.md)
- [GPU Flow browser-style visible frame conformance checklist](../plans/gpu-flow-browser-style-visible-frame-conformance-checklist.md)

The May 21-23 coherent visible-frame cutover is covered mainly by focused
Vitest authority and boundary suites plus retained Settings E2E coverage:
[visibleFrameStateMachine.test.ts](../../frontend/src/gpuFlow/GpuFlow/visibleFrameStateMachine.test.ts),
[visibleFrameCoordinator.test.ts](../../frontend/src/gpuFlow/GpuFlow/visibleFrameCoordinator.test.ts),
[visibleFrameTransactionProofs.test.ts](../../frontend/src/gpuFlow/GpuFlow/visibleFrameTransactionProofs.test.ts),
[visibleFramePresentationProofsBoundary.test.ts](../../frontend/src/gpuFlow/GpuFlow/visibleFramePresentationProofsBoundary.test.ts),
[visibleFramePresentationTokenBoundary.test.ts](../../frontend/src/gpuFlow/GpuFlow/visibleFramePresentationTokenBoundary.test.ts),
[visibleFrameResourceGraph.test.ts](../../frontend/src/gpuFlow/GpuFlow/visibleFrameResourceGraph.test.ts),
and the visible-frame baseline, retry follow-up, and final verification reports
linked above.

The May 24-27 resource-budget, presentation-boundary, rename, and cadence
passes are covered mainly by focused Vitest authority and boundary suites plus
the conformance checklist:
[visibleFrameBudgetBroker.test.ts](../../frontend/src/gpuFlow/GpuFlow/visibleFrameBudgetBroker.test.ts),
[visibleFrameResourceGraph.test.ts](../../frontend/src/gpuFlow/GpuFlow/visibleFrameResourceGraph.test.ts),
[visibleFramePresentation.test.ts](../../frontend/src/gpuFlow/GpuFlow/visibleFramePresentation.test.ts),
[visibleFrameTransactionPresentationEvidence.test.ts](../../frontend/src/gpuFlow/GpuFlow/visibleFrameTransactionPresentationEvidence.test.ts),
[visibleFrameReducerRuntimeRetainedScroll.test.ts](../../frontend/src/gpuFlow/GpuFlow/visibleFrameReducerRuntimeRetainedScroll.test.ts),
[visibleFrameSurfaceFrameDiagnostics.test.ts](../../frontend/src/gpuFlow/GpuFlow/visibleFrameSurfaceFrameDiagnostics.test.ts),
[preparedContentFrame.test.ts](../../frontend/src/gpuFlow/preparedContentFrame.test.ts),
and
[presentedSurfaceRuntime.test.ts](../../frontend/src/gpuFlow/presentedSurfaceRuntime.test.ts).

Together, these reports show the same architectural progression from the
measurement side: less hidden publication work, more explicit diagnostics, more
observed-behavior regression coverage, and clearer separation between live
viewport motion, retained section scroll projection, retained texture work, DOM
projection, browser visual representation coverage, prepared content frames,
presented surface state, visible-frame outcomes, projection transaction debt,
resource debt budgets, and retained finish-line budgets.
