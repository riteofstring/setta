# GPU Flow Architecture Iterations

Date: 2026-05-17

This note summarizes the GPU Flow architecture work from the last six days of
commits, reviewed with:

```sh
git log --since='6 days ago'
```

It is a narrative companion to
[HTML-in-canvas architecture](../reference/html-in-canvas-architecture.md), not
a replacement for that reference. The current implementation details remain in
the reference doc; this file explains how the architecture moved and why.

## Starting Point

At the start of this run, GPU Flow already rendered the project canvas through
WebGPU/html-in-canvas:

- DOM section bodies were mounted under `<canvas layoutsubtree>` and uploaded as
  HTML textures.
- Retained parameter rows were rasterized into texture pages.
- The renderer composed grid, edges, DOM textures, retained pages, and overlay
  surfaces into one WebGPU scene.

The recurring problems were not about one missing draw call. They were ownership
and publication problems:

- retained settings content could publish blank, stale, or visually regressed
  rows;
- retained section wheel scrolling and viewport pan/zoom could fight over
  ownership or lag behind the desired runtime state;
- text-like controls needed browser semantics, but their visible retained
  pixels depended on copied snapshots;
- retained page publication was too tied to page-grid identity and repair work
  instead of explicit coverage proof;
- performance investigations needed clearer separation between camera-only
  frames, texture uploads, retained-page work, and DOM projection.

## Iteration 1: Stabilize Retained Canvas Behavior

Representative commits:

- `7a8300546` Fix retained canvas visual regressions
- `93d605646` Fix retained settings visual regressions
- `60adba501` Fix retained canvas scroll pan ownership
- `df62ad4fc` Fix retained switch animation compositing
- `52a2f0135` Fix retained switch zoom flash
- `ba593cc20` Fix retained CodeMirror activation

This pass made the retained renderer less monolithic. Static retained page
content, GPU-native retained visuals, and browser-owned active controls started
being treated as separate surfaces with separate lifecycles.

Important changes:

- switch transitions moved toward GPU-native rounded-rect visuals instead of
  baking animation state into static retained pages;
- row hover and scrollbars became runtime visuals layered with retained pages;
- retained scroll/pan ownership was asserted with behavior tests rather than
  inferred from event handlers;
- CodeMirror activation was handled as a browser-owned path instead of a
  retained-canvas text drawing problem.

The architectural lesson was that retained pages should cache stable structure,
while highly interactive or animated surfaces need their own ownership model.

## Iteration 2: Move Runtime State Out Of Scene Mutation

Representative commits:

- `5ed0961b7` Implement retained text-like editor previews
- `0eda94217` Fix retained CodeMirror composition
- `da3bfa2f2` Refactor retained content scroll runtime state
- `3c79b7787` Refactor retained text row snapshots
- `af18baf6f` Fix retained text-like row rendering
- `9fdc1995e` Fix GPU flow pan zoom runtime
- `32e5a8810` frontend: retain gpu flow runtime snapshots

This phase separated transient interaction state from canonical project layout.
Scroll offsets, viewport transforms, active editor projection, hover state, and
retained-control activation were sampled into runtime frames instead of being
committed back through scene mutation on every interaction frame.

Important changes:

- retained content scroll state moved into explicit runtime state;
- `viewportRuntime` became the hot path for pan/zoom and viewport subscribers;
- retained frame sampling used the latest committed scene plus runtime scroll
  and viewport state;
- text-like control rendering evolved from canvas-drawn approximations to
  DOM-derived row snapshots and active browser-owned editors;
- diagnostics started recording the difference between desired runtime state
  and published visual state.

This changed the mental model from "update the scene, then repaint everything"
to "sample the scene plus runtime state, then publish a coherent frame."

## Iteration 3: Make Retained Frames Atomic

Representative commits:

- `00aa33ed0` Refactor retained compositor runtime
- `811bfb310` Implement retained runtime frame compositor
- `e3db9ada7` Implement atomic retained display frame pipeline

The retained compositor then gained a stronger display-frame boundary. Instead
of letting independently updated retained artifacts leak into the visible scene,
GPU Flow began constructing a retained runtime frame and publishing it as a
single display decision.

Important changes:

- `retainedRuntimeFrame.ts` introduced an explicit sampled frame for retained
  content;
- retained page frame surfaces, native visuals, DOM islands, hit records, and
  scroll offsets were tied to the same sampled frame;
- `retainedDisplayFrame.ts` made publication explicit and testable;
- texture/page resources required by a published frame were protected from
  eviction;
- post-submit retained maintenance became follow-up work instead of a
  prerequisite for every interaction frame.

The architecture became more transactional: either the retained frame was
publishable as a coherent unit, or the compositor held/repaired according to an
explicit rule.

## Iteration 4: Prefer Scroll-First Continuity

Representative commits:

- `3eb19200c` Refactor retained GPU flow compositor
- `ff0a6aafb` Implement retained content lifecycle compositor

Retained section scrolling exposed a weakness in strict "wait for exact page
coverage" logic. If the desired scroll offset changed faster than exact retained
pages could be produced, the visible content could hold an old scroll position
for too long.

This iteration favored motion continuity:

- retained scroll offsets could publish against compatible existing coverage
  while exact replacement pages caught up;
- first-visible page work stayed urgent, while passive refinements could defer;
- lifecycle decisions distinguished static retained page content from native
  runtime visuals and active browser-owned controls;
- retained page maintenance became scheduler-owned post-submit work.

The important shift was from exactness-first publication to continuity-first
publication, constrained by explicit compatibility and nonblank coverage rules.

## Iteration 5: Replace Page Identity With Coverage Proof

Representative commits:

- `1c035eab6` Implement transactional retained compositor
- `3dd592066` Refactor GPU Flow retained coverage compositor
- `2dc811568` Implement GPU Flow visual continuity refactor
- `f42f8b8d2` gpu-flow: enforce retained visual continuity

The next problem was proving that previously committed retained pages were safe
to reuse. Page-grid identity alone was not enough: a coarse page, a zoomed
target, and a changed row segment could look similar structurally but differ in
semantic coverage.

This iteration introduced explicit retained coverage modeling:

- committed coverage stores and manifests tracked exact and compatible retained
  coverage;
- visible coverage planners classified exact regions, compatible regions, true
  holes, and blocked regions;
- visual epochs made page content freshness part of publication logic;
- transactions refused to publish true-hole retained coverage;
- previous coherent frames could be held, and cold surfaces could publish
  diagnosed placeholders while first-visible work was queued.

The architecture moved from "do we have the page key?" to "can this committed
generation prove visual, motion, hit-test, source-window, and clip-chain
compatibility for this desired frame?"

## Iteration 6: Generalize To Surface Actors

Representative commit:

- `841d75899` Implement transactional GPU Flow surface compositor

The retained-only transaction model was then generalized into
`frontend/src/gpuFlow/surfaceCompositor/`.

Core concepts:

- `SurfaceActor`: the owner identity for a visual or interactive surface, such
  as a DOM section, retained parameter content, edge label, selection overlay,
  resize overlay, drag overlay, active DOM island, native retained visual, or
  retained DOM-control source.
- `SurfaceGeneration`: the immutable generation a surface actor wants to
  publish.
- `SurfaceCoverageProof`: the reason a generation is exact, compatible,
  blocked, or a true hole.
- `SurfaceDisplayTransaction`: the ordered draw commands, protected resources,
  hit index, active DOM island attachment decision, follow-up work, and motion
  sample for one publishable surface frame.

This generalized the retained compositor's safety rules so DOM textures,
retained textures, overlays, active islands, and native visuals can all be
described in one publication vocabulary.

The result is a cleaner split:

- frame building asks each owner for desired actor generations;
- transaction resolution decides whether the desired frame is publishable;
- post-submit maintenance schedules missing or refinement work;
- diagnostics explain publication outcomes without relying on renderer internals
  as the public contract.

## Iteration 7: Revisit Text-Like Control Ownership

Representative commits:

- `ba99f7387` Implement retained DOM control rendering
- `39a482577` docs: plan GPU Flow DOM control plane refactor
- `b6b0d85a7` docs: tighten GPU Flow DOM control plane plan
- `5a43c0a3a` docs: update html in canvas architecture

Text-like retained controls have been the hardest boundary. They need browser
text editing semantics, but retained content wants cached, page-rasterized
visuals.

The implemented step moved from canvas-drawn text-like snapshots to retained
DOM-control sources:

- passive text-like control DOM is mounted as source material;
- retained page upload copies those DOM controls into page texture slots;
- active controls reuse the same descriptor but are projected as live DOM for
  focus, selection, caret, IME, and keyboard behavior;
- retained DOM-control publication records whether it selected passive texture,
  live projected source, previous coherent frame, or diagnosed cold blank.

That improved the ownership model compared with hand-rendered text-like canvas
approximations, but it still kept visible passive controls on a retained texture
correctness path. The latest
[DOM control plane plan](../plans/gpu-flow-dom-control-plane-refactor-plan.md)
is the architectural response to the remaining failure mode: DOM source state
can be correct while copied retained pixels are blank or stale.

The planned direction is now clearer:

- retained GPU pages should render section structure, labels, rows,
  decorations, canvas-owned controls, scrollbars, and GPU-native visuals;
- visible DOM-owned text-like controls should render as projected real DOM;
- focus, typing, caret, selection, IME, accessibility, and native input events
  should stay on the DOM path;
- retained page publication should stop treating DOM-control texture snapshots
  as the correctness path for visible editable controls.

## Current Architecture After These Iterations

GPU Flow now has these major architectural boundaries:

- Project owners remain canonical for section structure, dimensions, parameter
  values, edge connections, and persistence.
- `GpuFlowScene` describes the renderable project scene, while runtime frames
  sample transient viewport, scroll, hover, active control, and interaction
  state.
- DOM section sources and HTML overlays are browser DOM captured into WebGPU
  textures through html-in-canvas.
- Retained parameter content is project-owned display-list data rasterized into
  retained texture pages.
- GPU-native retained visuals handle scrollbars, row hover, and switch
  transitions without dirtying static retained pages for every visual tick.
- DOM islands and active retained DOM controls preserve browser-owned semantics
  for controls that should not be emulated by canvas.
- The retained display path publishes through explicit transaction and coverage
  proof, not through opportunistic page repair.
- `surfaceCompositor/` gives the runtime a shared vocabulary for actors,
  generations, coverage, protected resources, draw order, hit indexes, and
  follow-up work.

## Design Direction

The six-day arc moved GPU Flow in five important ways:

1. From canvas-owned everything to ownership by interaction semantics.
2. From scene mutation during interactions to sampled runtime frames.
3. From page identity to explicit coverage and compatibility proof.
4. From pre-publish repair to publishable transactions plus scheduler-owned
   maintenance.
5. From retained-only compositor rules to generalized surface actor rules.

The remaining pressure is text-like controls. The architecture has enough
transaction and coverage machinery to avoid publishing incoherent retained
frames, but live editable controls are still better modeled as DOM-owned visual
surfaces than as copied retained page pixels. The DOM control plane plan is the
next iteration that follows from the commit history.

## Verification Trail

Useful reports from this run:

- [GPU Flow retained snapshot runtime refactor](../../perf/reports/frontend/2026-05-13_gpu-flow-retained-snapshot-runtime-refactor.md)
- [GPU Flow scroll-first retained compositor refactor](../../perf/reports/frontend/2026-05-15_gpu-flow-scroll-first-retained-compositor-refactor.md)
- [GPU Flow transactional retained compositor](../../perf/reports/frontend/2026-05-15_gpu-flow-transactional-retained-compositor.md)
- [GPU Flow transactional surface compositor after report](../../perf/reports/gpu-flow-transactional-surface-compositor-after-20260516.md)

These reports show the same architectural progression from a different angle:
fewer hidden publication decisions, more explicit diagnostics, and regression
coverage that checks visible behavior, frame cadence, scroll ownership, DOM
alignment, and retained visual continuity.
