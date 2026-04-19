# Go-Rewrite Pixi Scene Plan

Date: 2026-04-21
Worktree: `go-rewrite-pixi-scene`
Execution base: `origin/go-rewrite`
Related references:
- `docs/notes/performance/frontend-performance-branches-retrospective.md`
- `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`

## Goal

Replace the visible xyflow graph area with a Pixi-owned scene that keeps the same overall section layout, feels premium during pan/zoom, and preserves first-click editing through bounded DOM overlays.

This is not a "small optimization" plan. It is a renderer-ownership reset.

## Product requirements

The finished path must satisfy all of these:

- `settings` -> `All Settings` is visibly fast during pan and zoom.
- The graph still looks like Setta sections, not generic boxes or an empty surface.
- Layout remains recognizable:
  - same section positions
  - same relative sizing
  - same section hierarchy and ordering
- Zoom feels stable:
  - no obvious blur smear
  - no snap-after-zoom redraw
  - no shell/body detachment
  - no blanking or pop-in during normal wheel zoom
- Editing still starts on the first click for representative controls.
- DOM stays off the default visible hot path except for explicit exceptions.

The new path does not need exact pixel-for-pixel parity on day one, but it must feel like the same product.

## Hard decisions

### 1. The visible xyflow surface is being replaced, not decorated

The new default visible graph surface must be Pixi-owned.

That means Pixi owns:

- camera and viewport transform
- pan/zoom interaction
- visible section shells and headers
- visible row chrome
- resting labels and values
- selection, hover, highlight, and focus affordances
- background, guides, and other graph-surface primitives

xyflow may remain only if it is off the visible hot path and not the thing rendering, transforming, or hit-testing the default scene.

### 2. Hybrid underlay work is not the target architecture

The previous branch proved that "transparent DOM shells plus a canvas underlay" can still be slower, visually broken, and conceptually muddled.

Do not continue from these shapes:

- transparent DOM shells counting as real scene ownership
- DOM-first viewport transform with canvas repaint following behind it
- DOM harvesting micro-lanes as the main path
- section-family expansion before scene viability is proven

### 3. DOM becomes an overlay layer, not the resting surface

DOM is allowed only for:

- active inline editors
- menus, popovers, combobox lists, and other transient surfaces
- rich text/code editing
- chat and other explicitly named exceptions
- accessibility surfaces that are not practical in Pixi

The resting graph surface must not depend on a large live DOM forest.

### 4. Text quality is a first-class architectural problem

Pan/zoom will fail again if text is blurry, snaps between scales, or rerasterizes visibly at the wrong time.

Before broad rollout, pick and validate one text strategy that can survive zoom:

- SDF/MSDF/bitmap-atlas text with bounded scale error, or
- a different Pixi-native text strategy that is demonstrably crisp and stable

Do not assume plain raster `Text` scaled arbitrarily will be good enough.

## Non-goals

This restart is not trying to:

- perfectly reproduce every CSS detail before the scene is viable
- keep the old hybrid canvas-underlay code path alive as a fallback target
- solve every section family at once
- move chat into Pixi right now

## Scope

Primary proving surface:

- `settings`
- `All Settings`

First-class exceptions:

- chat stays DOM-backed for now
- other complex rich-edit surfaces may stay DOM-backed until explicitly reworked

## Source of truth

Keep the `go-rewrite` app architecture as the product source of truth:

- section data model
- layout and geometry inputs
- runtime/store behavior
- routes and product workflows

This restart replaces the graph renderer, not the whole application architecture.

## Architecture shape

The intended runtime shape is:

1. One Pixi stage for the graph surface.
2. One scene graph owning section shells, rows, and resting content.
3. One small DOM overlay layer synchronized to scene coordinates for active editors and exceptions.
4. One input/picking model that resolves scene hits directly from Pixi-owned geometry rather than hidden DOM anchors.

Key invariant:

During dense pan/zoom, cost should scale mainly with scene primitives and one camera transform, not with mounted inactive widget DOM.

## Phase plan

### Phase 0: Clean restart and baseline

Goal:

- start from `origin/go-rewrite`
- capture a clean before state
- treat the old `go-rewrite-pixijs` branch as research only

Deliverables:

- durable baseline report for `settings` -> `All Settings`
- one visual oracle capture against `/home/ubuntu/dev/setta`
- new Ralph docs for this worktree

Exit criteria:

- baseline metrics and screenshots exist
- the current DOM path is the comparison oracle

### Phase 1: Pixi scene bootstrap

Goal:

- put a Pixi stage in charge of the visible graph area
- remove xyflow from default viewport ownership on the canary path

Requirements:

- same section positions and sizes as the DOM layout source
- visible section shells for all sections in `All Settings`
- no blank scene

Exit criteria:

- a full-scene Pixi canary renders recognizable sections from real layout data
- panning and zooming move the Pixi scene directly

### Phase 2: Premium camera and zoom quality

Goal:

- make the scene feel good before broad fidelity work

Requirements:

- zoom anchored under cursor
- smooth wheel zoom with no obvious lag
- no blur smear severe enough to feel broken
- no snap-after-zoom shell rebuilds visible to users
- no shell/body detachment or reflow jitter

Exit criteria:

- Gate 0 viability is green on the Pixi scene
- the scene is subjectively usable for normal pan/zoom

### Phase 3: Section shell and chrome fidelity

Goal:

- make the scene read as Setta sections, not as generic placeholders

Requirements:

- section shell shapes
- headers
- row structure
- visible value placement
- selection/highlight states

Exit criteria:

- a representative `All Settings` view looks structurally like the DOM reference
- the section layout is clearly recognizable

### Phase 4: Interaction and editing overlays

Goal:

- restore first-click editing without turning the whole scene back into DOM

Requirements:

- scene hit-testing chooses the target row/control directly
- one DOM overlay layer mounts the active editor in place
- no second click
- no layout shift
- outer row shell stays visually stable

Representative controls:

- one text input
- one text-area or code path
- one dropdown/combobox path

Exit criteria:

- first click edits on representative controls
- no visible shell swap or editor pop-in debt

### Phase 5: Dense rollout and perf closure

Goal:

- move the dominant visible inactive content onto the Pixi scene
- keep DOM bounded to overlays and exceptions

Requirements:

- whole-scene dense metrics improve materially
- chat remains DOM-backed without poisoning the main hot path
- the default `All Settings` experience feels premium

Exit criteria:

- acceptance gates are green
- remaining DOM exceptions are intentional and documented

## Measurement discipline

Every major phase needs both performance and visual evidence.

Required evidence types:

- dense `All Settings` perf report
- before/after screenshots
- Chrome DevTools trace when a hotspot closes or pivots
- explicit note on whether zoom quality improved, regressed, or stayed flat

Do not count progress if the scene is faster but still visually unusable.

## Acceptance gates

### Gate 0: Viable

- graph surface is visible
- sections are recognizable
- pan/zoom are not obviously worse than DOM
- zoom artifacts are not severe enough to make the app feel broken

### Gate 1: Workable

- section layout feels coherent
- text/chrome are readable during normal use
- editing handoff works on representative controls

### Gate 2: Premium

- pan/zoom feel high frame rate
- no obvious zoom jank, blur, or snap
- section chrome feels intentional and polished

### Gate 3: Ship bar

- dense `All Settings` is materially better than the durable DOM baseline
- the default graph surface is Pixi-owned
- DOM is bounded to overlays and explicit exceptions
- the result feels like Setta, not like a demo renderer

## First slices to allow

Only these are valid early slices:

- baseline capture on clean `go-rewrite`
- scene bootstrap with real section geometry
- camera/zoom quality work
- one text rendering strategy validation
- one representative in-place editing overlay path

Do not spend early iterations on:

- family-by-family shell expansion before Gate 0 is green
- chat activator plumbing
- transparent DOM shell experiments
- DOM micro-optimizations that do not move the renderer ownership boundary
