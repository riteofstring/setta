# Graph Substrate Rewrite Plan

Date: 2026-04-02
Updated: 2026-04-02
Worktree: `pixijs-graph`
Current branch: `pixijs-graph`
Execution base: `main`
Research source worktree: `setta.pixijs-rewrite`
Related handoff: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-handoff.md`
Related history: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log.md`
Related summary: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-completed.md`

## Goal

Replace the current `xyflow`-anchored graph substrate on the hot `settings` path with a custom graph/runtime surface that:

- preserves current product behavior
- makes pan/zoom/drag performant on dense scenes
- keeps DOM where DOM is actually needed
- prevents Pixi/DOM drift by removing DOM-measured scene placement as the source of truth

This plan is not satisfied by:

- making the current shared-page-runtime path slightly less wrong
- improving tiny-card appearance while normal zoom is still broken
- adding more harnesses around a renderer architecture that still redraws the wrong owner
- swapping widget libraries without changing graph-surface ownership

This plan is satisfied only when:

- one real `settings` canary path runs on the new graph substrate rather than `xyflow`
- pan, zoom, and section drag remain visually locked with no detached body drift
- DOM-backed editing and interaction remain faithful where still required
- the checked canary is not obviously slower than the DOM/`xyflow` baseline
- later Pixi ownership can be added without reintroducing DOM-sync drift

## Core architecture decision

The first rewrite is not "Pixi body rendering first."

The first rewrite is:

1. Replace the graph substrate first.
2. Keep section bodies DOM-backed at the start.
3. Make camera state and world coordinates authoritative outside `xyflow`.
4. Project both Pixi and DOM overlays from that same camera/world model.
5. Only move static visuals into Pixi after the substrate itself is proven.

## Ownership rules

To prevent the sync failures seen in `setta.pixijs-rewrite`, the new substrate must obey these rules:

- One source of truth for camera transform.
- One source of truth for node/section world coordinates.
- Pixi never measures moving DOM shells to decide where to draw.
- DOM overlays never become the authoritative source of section geometry.
- A surface has one visual owner at a time.
- DOM is reserved for heavyweight editors, text input, popups, accessibility surfaces, and other interaction-heavy overlays.
- Resting graph visuals should move toward scene ownership only after the graph substrate is stable.

## Phase order

### Phase 0: Substrate proof with DOM bodies

Build a custom graph canary for `settings` that keeps current DOM section bodies but does not depend on `xyflow` for:

- camera state
- pan/zoom
- node position
- node drag
- world-to-screen projection

Exit criteria:

- one normal-zoom section remains visible and attached while dragging
- the canvas can pan and zoom without detached DOM/body drift
- existing DOM body content remains usable on that slice

### Phase 1: Expand custom substrate coverage

Broaden the canary to more sections and more interactions while still using DOM section bodies where needed.

Exit criteria:

- `All Settings` can run on the custom substrate with stable drag/pan/zoom
- the custom substrate is not obviously worse than the old path for the checked slice

### Phase 2: Move static graph visuals into Pixi

After the substrate is stable, move scene-owned visuals into Pixi:

- card shells
- section chrome
- edge strips
- non-editing body visuals

Exit criteria:

- the visual owner changes without reintroducing drift
- DOM remains overlay-only for active editors and complex controls

### Phase 3: Tighten parity and performance

Once ownership is correct, chase the remaining visual and performance work:

- spacing/text/chrome parity
- motion cost
- overlay polish
- focused DOM/Pixi split decisions

## Initial canary scope

The proving route is:

- `settings`
- `All Settings`
- one normal-zoom section first

Explicitly defer until later:

- tiny-card and far-zoomed-out polish
- full-section Pixi body rendering
- `pixiui` adoption
- widget-library swaps
- final pixel-perfect parity

## Initial implementation slices

The first few Ralph slices should follow this order:

1. Create a narrow custom graph runtime seam for `settings` while leaving `xyflow` as the default path elsewhere.
2. Add tested camera/world/screen transform helpers and a stable custom viewport state model.
3. Render one `settings` section body through the new substrate using the existing DOM body implementation.
4. Implement section drag on that custom substrate without detached body drift.
5. Add pan/zoom on the same slice and prove DOM overlays remain locked to the same transform.
6. Only after that, expand section count and consider scene-owned Pixi visuals.

## Testing discipline

Every work item should follow:

1. baseline/context read
2. tests for the intended substrate behavior
3. implementation
4. narrow verification
5. CDP visual check when UI behavior changes
6. handoff refresh and history append

Priority tests for the first phase:

- world-to-screen transform unit coverage
- camera inverse transform coverage
- drag updates on the custom substrate
- a Playwright canary showing one section stays attached while dragging/panning/zooming

## Branching decision

This worktree already starts from `main`, and it should stay there.

Rules:

- do not port the old shared-page-runtime architecture into this branch
- treat `setta.pixijs-rewrite` as research only
- cherry-pick or manually port only useful tests, measurements, and architectural learnings

## Immediate next frontier

Implement the first custom graph-runtime canary for `settings` with DOM bodies:

- no `xyflow` ownership for camera/drag on the checked slice
- no Pixi body rendering yet
- one normal-zoom section must stay visible, attached, and draggable
