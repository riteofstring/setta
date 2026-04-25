# Scene Renderer Strategy Review

Date: 2026-04-22
Worktree: `go-rewrite-pixi-scene`

## Purpose

Review the current `go-rewrite-pixi-scene` plan against:

- the historical `frontend-performance*` branch family in this repo
- the later Pixi / graph-substrate branches
- current external evidence on how serious infinite-canvas products handle pan/zoom, text, and editing

The question is not "can Pixi render something?"

The question is:

- what architecture is most likely to make dense `settings -> All Settings` feel like a highly optimized native app
- what has already been disproven locally
- where Pixi is a good substrate choice versus where it is only another false summit

## Executive Conclusion

The current branch premise is directionally correct.

The repo history strongly supports these statements:

- the live `All Settings` param-row / widget DOM is the main problem, not React Flow by itself
- DOM cleanup helps, but does not remove the motion cliff on its own
- the only large wins came from changing renderer ownership or hiding large inactive DOM surfaces during motion
- hybrid DOM/canvas ownership keeps collapsing back into the same bottlenecks
- first-click activation geometry is an architectural problem, not a last-mile polish problem

The most defensible next move is:

1. keep the React app shell
2. replace the workspace with one scene-owned renderer
3. keep DOM only for active editors and explicit overlays
4. treat Pixi as the first substrate to prove this, not as a sacred commitment

If Pixi cannot clear a bounded Gate 0 on text quality, zoom stability, and first-click activation without falling back to DOM shells, the right move is to pivot to a Skia / Wasm / WebGPU-class path, not to reopen another hybrid branch.

## Clarification On The Historical Branch Count

The current git refs expose `11` reachable `frontend-performance*` refs:

- `frontend-performance`
- `frontend-performance-2`
- `frontend-performance-3`
- `frontend-performance-5`
- `frontend-performance-6`
- `frontend-performance-7`
- `frontend-performance-8`
- `frontend-performance-9`
- `frontend-performance-10`
- `frontend-performance-11`
- `frontend-performance-11-hybrid-rendering`

`frontend-performance-4` is not present in the current repo state.

`frontend-performance-9` and `frontend-performance-11` are mostly checkpoint labels rather than large new architecture branches, but they still matter because they hold key benchmark and decision-state artifacts.

## Current Plan Review

### What the current plan gets right

- It correctly treats this as a renderer-ownership reset, not another DOM flattening pass.
- It correctly rejects hybrid success criteria.
- It correctly fixes the proving surface to `settings -> All Settings`.
- It correctly identifies `Callable` and `Dict` as the right first families.
- It correctly recognizes text quality as a first-class architecture problem.
- It correctly treats "faster but broken" as failure.

### What should be tightened before implementation starts

1. Pixi should remain a falsifiable substrate hypothesis.
   - The plan says this in prose, but the phase sequencing still reads a little too Pixi-assumptive.
   - Make the stop condition explicit: if Pixi cannot deliver stable zoomed text plus reliable first-click activation on the canary without DOM shell fallback, pivot instead of widening.

2. Activation geometry needs to be a Phase 1 concern, not a late interaction concern.
   - `go-rewrite-pixijs` stalled here.
   - The branch proved that retained resting text without section-authoritative / row-authoritative hit geometry becomes a dead end for first-click editing.

3. Text strategy should be locked before broad shell rollout.
   - Pixi's own docs say `Text` rasterizes strings into textures, while `BitmapText` is the high-performance path and supports MSDF/SDF fonts for crisp scaling.
   - Dense zoomable resting labels should assume MSDF/SDF or another equally explicit strategy from the start.

4. Measurement must keep using real interaction traces, not only transform-script probes.
   - The synthetic baselines are useful, but the local branch history shows many false positives until real wheel / pan / click traces were checked.

5. The first acceptance gate should include a DOM-budget target.
   - "Overlay-only DOM" is directionally right, but the branch should name a concrete resting DOM budget for the canary.
   - Otherwise the work can drift back into a DOM-heavy "temporary" state that is functionally hybrid.

## What The Frontend Performance Branches Actually Proved

| Branch | Main idea | What it proved | Why it stalled |
| --- | --- | --- | --- |
| `frontend-performance` | incremental DOM/layout cleanup on the existing tree | real hygiene wins; corrected rebenchmarks improved transition costs, but this was not a foundational fix | it reduced some overhead without changing the dense live-widget model |
| `frontend-performance-2` | backend fast paths, delta updates, runtime-store splitting | backend cost was real but largely orthogonal; `All Settings` pan/zoom still stayed around the low-`30 FPS` band in branch notes | the bottleneck remained frontend rendering, layout, and widget churn |
| `frontend-performance-3` | broad experiment branch: subscription partitioning, lazy overlays, observer work, workerized filtering, layer-split, motion shell | most ideas were explicitly rejected; the important positive result was that layer-split / motion-shell style rendering modes could make motion much faster | the surviving wins depended on changed rendering modes, not cleanly preserving the normal always-live behavior model |
| `frontend-performance-5` | canvas-engine rewrite with sparse DOM islands | sparse DOM plus scene rendering can be dramatically faster; the branch recorded roughly `321` DOM nodes and `~8.4ms` average frame time on the sparse engine lane versus a `~14k` node legacy baseline with `~60.3ms` average frame time | the comparison was not apples-to-apples because it won by not keeping dense DOM live |
| `frontend-performance-6` | aggressive DOM flattening | large structural simplification helps; viewport descendants reportedly dropped from `8619` to `3915`, and tree depth dropped sharply | even large DOM reduction did not remove the motion cliff on its own |
| `frontend-performance-7` | coalesce non-critical pan/zoom consumers with `renderTransform` | secondary viewport mutation churn could be cut by `4.1x-4.6x` | useful cleanup, but it did not touch the dominant row/widget cost |
| `frontend-performance-8` | minimap optimization ladder | minimap overhead became small enough to show it was not the main bottleneck | minimap work was secondary and could not explain the dense-scene pain |
| `frontend-performance-9` | benchmark checkpoint | this branch holds the March 7 benchmark that matters most: top-level shells stayed fast, while row count and real widgets caused the cliff | it was mainly a measurement branch, but its measurements invalidated many shallow theories |
| `frontend-performance-10` | benchmark-driven deep dive plus canvas-engine parity / SnapDOM / hidden-body experiments | this is the most valuable truth-finding branch; it proved that always-live canvas-engine DOM was still slower than the React Flow path, and that SnapDOM was not the magic fix | it generated strong negative evidence, but no clean ship path |
| `frontend-performance-11` | checkpoint / replay state | mostly a marker branch; it preserved benchmark and replay surfaces rather than introducing a new winning architecture | it did not materially change the architecture story |
| `frontend-performance-11-hybrid-rendering` | hybrid rendering attempts and then explicit reset | this branch finally said the quiet part out loud: local micro-optimizations and hybrid follow-ups were not enough, so the plan pivoted to a renderer rewrite | it ended as an architectural handoff, not a solved product lane |

## The Most Important Local Benchmark Result

The single most important report is still the March 7 staged benchmark:

- `frame-only`: roughly `120 FPS`
- `header-only`: roughly `120 FPS`
- `section-body-shell`: roughly `100 FPS`
- `static-param-list`: roughly `69-88 FPS` depending on settle state
- `full`: roughly `38-43 FPS`

The practical meaning is simple:

- React Flow is not the core problem by itself
- top-level section shells are not the core problem by themselves
- visible row count matters a lot
- the real widget / param-container subtree is the biggest remaining cost

That benchmark alone justifies the current branch's refusal to keep the default visible workspace as a full live DOM tree.

Primary local reference:

- [perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md)

## What The Pixi / Graph-Substrate Branches Proved

| Branch | Main idea | What it proved | Why it stalled |
| --- | --- | --- | --- |
| `pixijs-rewrite` | shared-runtime Pixi node-body canary | it proved one narrow attachment bug could be fixed on a normal-zoom section | the handoff says the renderer was blurrier / pixelated, could render blank dark bodies, interaction was not equivalent, and performance was worse than DOM |
| `pixijs-graph` | custom graph substrate first, DOM bodies initially retained | it corrected the architecture in an important way: camera/world ownership had to move outside `xyflow` | the branch never converted that architectural improvement into a dense `All Settings` win and got pulled into local rerender / helper churn |
| `pixijs-graph-panzoom-pivot` | explicit pivot to pan/zoom-first, dual representation, bounded overlays | it stated the right long-term idea: scene-owned pan/zoom with hot/warm/cold activation bands | it was mostly a planning correction, not a landed proof |
| `go-rewrite-pixijs` | retained-canvas graph surface on top of `go-rewrite` | this branch produced the best recent evidence: the retained-canvas rerun improved the synthetic dense baseline from `204.93ms` mean RAF to `111.45ms`, and later hidden-body lanes pushed the canary toward a much lower DOM footprint and materially better motion numbers | it still depended on hiding DOM during motion, and it stalled on first-click retained-text activation because the branch did not yet have scene-authoritative activator geometry |

### The hard lesson from `go-rewrite-pixijs`

The branch's best results are still not enough to call the problem solved:

- durable pre-change baseline:
  - `9553` document nodes
  - `521` buttons
  - `204.93ms` mean RAF
  - `36337ms` long-task total
- retained-canvas dense rerun:
  - `9517` document nodes
  - `507` buttons
  - `111.45ms` mean RAF
  - `18159ms` long-task total

That is a real gain, but it also says something important:

- the scene work helped even before DOM was truly reduced
- the remaining blocker was still the live inactive DOM forest

Then the later motion-shell / retained-graph reports showed the next ceiling:

- on the hidden-body motion lane, DOM fell to roughly `5494-5579` nodes and `47-59` buttons
- motion got much better than the full-live baseline
- but the branch still depended on hiding large motion bodies and still traced significant JS work in `SectionContainerCore`, `SectionContainerCoreResizable`, and `ZoomPane`

Finally, the branch's 2026-04-21 replan report makes the biggest remaining architecture hole explicit:

- `chat.permissionMode` still failed from the retained-text path
- the published click point was still pane-owned, not section-authoritative
- the report concludes that a new primitive is needed: section-authoritative or row-authoritative visible hit geometry for retained text

Primary local references:

- [perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md)
- [perf/reports/frontend/2026-04-18_settings-all-settings-retained-canvas-dense-rerun.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/perf/reports/frontend/2026-04-18_settings-all-settings-retained-canvas-dense-rerun.md)
- [perf/reports/frontend/2026-04-20_settings-all-settings-retained-graph-attribution-report.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/perf/reports/frontend/2026-04-20_settings-all-settings-retained-graph-attribution-report.md)
- [perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md)
- [perf/reports/frontend/2026-04-21_settings-all-settings-chat-pane-activator-geometry-replan-report.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/perf/reports/frontend/2026-04-21_settings-all-settings-chat-pane-activator-geometry-replan-report.md)

## External State Of The Art

### Pattern: serious infinite-canvas tools own the scene

The strongest outside example is Figma.

Figma's official material says:

- Figma originally bet on WebGL to power a smooth infinite canvas in the browser
- by September 18, 2025, Figma had updated its renderer to use WebGPU
- the renderer is written in C++ and compiled to WebAssembly

That is the high-end state-of-the-art pattern:

- bespoke scene graph
- GPU-owned rendering
- non-trivial native/Wasm code where it pays off
- browser UI as shell, not as the primary scene substrate

Sources:

- https://www.figma.com/blog/figma-rendering-powered-by-webgpu/
- https://www.figma.com/blog/webassembly-cut-figmas-load-time-by-3x/
- https://help.figma.com/hc/en-us/articles/360039827194-What-are-the-system-requirements-for-Figma

### Pattern: open-source whiteboards split scene rendering from editing

#### Excalidraw

Excalidraw describes itself as an "infinite, canvas-based whiteboard".

This is relevant because it validates the broad shape of the architecture:

- one canvas-owned scene
- low DOM pressure during navigation
- text / tool editing handled separately from the persistent scene

Inference from its published feature set:

- Excalidraw is a good proof that canvas-first editors work on the web
- it is not a good direct substrate for Setta because its model is shapes/text/images, not hundreds of embedded parameter widgets

Sources:

- https://github.com/excalidraw/excalidraw
- https://github.com/excalidraw

#### tldraw

tldraw is very actively maintained and has become a strong infinite-canvas SDK, but its official docs also show why it is not an automatic answer here:

- its web renderer is a "DOM canvas"
- off-screen performance depends on culling by setting `display: none`
- z-ordering is managed with CSS `z-index` while keeping DOM stable

Inference from those docs:

- tldraw is great when the visible set stays bounded and its shape model fits
- it is a poor fit for Setta's specific hotspot because your painful case is "a lot of dense content is visible at once", not "a huge document is mostly off-screen"

Sources:

- https://github.com/tldraw/tldraw
- https://tldraw.dev/sdk-features/visibility
- https://tldraw.dev/sdk-features/editor

### React Flow remains a DOM optimization story

The official React Flow performance guidance is:

- memoize components and functions
- avoid reading `nodes` / `edges` broadly
- collapse large node trees
- simplify styles

That is useful advice, but it also reveals the ceiling:

- React Flow's official performance story is still a DOM node / rerender management story
- it does not change the underlying model into a scene-owned GPU workspace

That aligns cleanly with what this repo already observed locally.

Source:

- https://reactflow.dev/learn/advanced-use/performance

### PixiJS is a credible substrate, but only with the right text and ownership model

PixiJS is actively maintained and recently released new `v8.18.1` changes in April 2026.

Its own docs matter here:

- `Text` rasterizes strings into textures
- `BitmapText` uses a pre-generated atlas and is the high-performance path
- `BitmapText` supports MSDF/SDF fonts for crisp scaling
- `HTMLText` uses SVG `foreignObject` and the docs explicitly say to avoid it when you need pixel-perfect performance or hundreds of text blocks
- Pixi accessibility works through a DOM overlay aligned to canvas objects

That is almost exactly the architectural split this branch should want:

- scene-owned resting visuals
- explicit fast text path for dense labels
- DOM overlays where semantics / accessibility / focusable interaction are needed

Sources:

- https://github.com/pixijs/pixijs/releases
- https://github.com/pixijs/pixijs
- https://pixijs.com/8.x/guides/components/scene-objects/text
- https://pixijs.com/8.x/guides/components/scene-objects/text/canvas
- https://pixijs.com/8.x/guides/components/scene-objects/text/bitmap
- https://pixijs.com/8.x/guides/components/scene-objects/text/html
- https://pixijs.com/8.x/guides/components/accessibility

### Konva and Fabric are respectable, but not stronger than Pixi for this problem

Konva is maintained and has solid performance guidance, but its own docs emphasize:

- one canvas per layer
- keep layer counts low
- move dragged shapes to dedicated layers during drag

That is useful for 2D canvas apps, but it is not clearly better than Pixi for a dense, GPU-oriented scene rewrite. It also drifts closer to the multi-canvas / layered composition shape that this repo already learned to distrust.

Fabric.js is also maintained, but its strengths are more around object-model canvas editing than around building a native-feeling large-scene graph surface with a thin DOM overlay contract.

Sources:

- https://github.com/konvajs/konva
- https://konvajs.org/docs/performance/All_Performance_Tips.html
- https://konvajs.org/docs/performance/Layer_Management.html
- https://konvajs.org/docs/
- https://github.com/fabricjs

### Flutter / Skia is the serious "whole app rewrite" alternative

Flutter's official docs show:

- web builds can use `canvaskit`
- WebAssembly builds can use `skwasm`
- `skwasm` can render on a separate thread when browser requirements are met

That makes Flutter / Skia one of the few plausible "rewrite for native feel" alternatives that is clearly maintained and technically serious.

But the tradeoff is much larger:

- full UI stack rewrite
- new language/toolchain
- weaker reuse of the current React/DOM/editor code
- much higher migration cost than a workspace-only renderer replacement

So this is a viable option only if you are willing to pay for a true product-stack restart, not as the default next experiment.

Sources:

- https://docs.flutter.dev/platform-integration/web/renderers
- https://github.com/flutter/flutter

### `html-in-canvas` is still not a production basis

The WICG `html-in-canvas` work is exciting because it points toward a future where HTML can be drawn into canvas while keeping DOM semantics.

But today the official status is still:

- a living explainer
- Chromium implementation behind a flag
- not something you can responsibly bet the product on right now

Source:

- https://github.com/WICG/html-in-canvas

## Recommendation For Setta

### Recommended primary path

Build a single-scene retained renderer for the workspace and keep the app shell in React.

Concrete version of that recommendation:

1. one workspace scene
2. one camera model
3. one picking / hit-test model
4. one bounded DOM overlay layer for active editors, menus, popovers, chat, and accessibility exceptions
5. no DOM section shells on the default visible canary

### Recommended substrate choice

Use Pixi first, but do it in a way that preserves the ability to pivot.

That means:

- use a bespoke scene model owned by Setta
- use imperative Pixi objects, not `@pixi/react`, for the hot path
- allow `pixi-viewport` only as a bootstrap helper if it accelerates camera bring-up, but do not let it define the long-term ownership model
- commit early to `BitmapText` + MSDF/SDF for dense resting labels
- keep `Text` / `HTMLText` off the dense zoomable hot path

### Architecture rules that should be explicit

1. Scene-owned authoritative geometry
   - section rects
   - row rects
   - label rects
   - activator rects

2. First-click activation via scene geometry
   - do not route first-click editing through collapsed hidden anchors as the authority
   - the retained scene must publish the visible hit geometry that the DOM editor overlay will consume

3. DOM overlays are local, not structural
   - mount editors in place
   - keep outer row chrome scene-owned and visually stable
   - do not reintroduce DOM row shells as "temporary"

4. Dense-scene text is not optional polish
   - if text is blurry, late-rasterized, or visibly snapping between scales, the canary failed

### Fast-fail gates

The branch should stop and pivot if any of these remain red after a bounded bootstrap:

1. `All Settings` still needs DOM section shells or DOM row shells to be visually acceptable at rest.
2. First-click editing still depends on hidden DOM anchors rather than scene-authoritative hit geometry.
3. Dense resting DOM does not fall by roughly an order of magnitude from the current `~9.5k` / `521-button` baseline.
4. Zoom still relies on plain raster text scaling and looks obviously blurry or unstable.
5. The best Pixi win still comes mainly from hiding DOM during motion while leaving DOM as the true resting owner.

### What not to choose as the primary next stack

Do not choose these as the primary substrate for the next serious attempt:

- more React Flow / DOM optimization as the main plan
- tldraw as the workspace renderer
- Excalidraw as the workspace renderer
- Konva / Fabric as the main rewrite target

Why:

- React Flow stays in the already-exhausted DOM optimization lane
- tldraw is still fundamentally a DOM-rendered canvas system with culling, which does not match the "most content visible at once" hotspot
- Excalidraw is too shape-centric and too far from the Setta interaction model
- Konva / Fabric are credible libraries, but neither is a stronger fit than Pixi for a single-scene GPU-first workspace rewrite

### When the "whole app rewrite" becomes rational

A larger rewrite becomes rational only if all of the following become true:

- browser-first scene ownership is still the right product shape
- Pixi cannot clear text / zoom / activator gates cleanly
- you are willing to pay for a language/tooling migration
- you want a much more native-feeling runtime than the current React stack is likely to deliver

At that point, the serious candidates are:

- custom Wasm + WebGPU engine for the workspace
- Flutter / Skia (`canvaskit` / `skwasm`) if a full-stack rewrite is acceptable

That is a real option. It is just not the cheapest next option.

## Bottom Line

The current `go-rewrite-pixi-scene` branch is starting from the right philosophical premise:

- stop paying the dense visible DOM cost
- stop pretending hybrid ownership is "close enough"
- move to one scene

The local branch history and external evidence both say the same thing:

- the winning architecture is scene-owned pan/zoom with bounded DOM overlays
- not another DOM-first optimization pass

Pixi is a reasonable first substrate for that architecture.

It is not the final goal.

The final goal is a scene-owned workspace with:

- premium pan/zoom
- crisp stable text
- first-click editing
- a DOM budget that stays small because the default visible surface is not DOM anymore

