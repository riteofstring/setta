# Graph Substrate Pan/Zoom Pivot Plan

Date: 2026-04-14
Pivot worktree: `setta.pixijs-graph-panzoom-pivot`
Pivot branch: `pixijs-graph-panzoom-pivot`
Base substrate commit: `e1ba08245`
Mainline runtime merge basis: `origin/main` through `ca37da902`
Related rewrite plan: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-plan.md`
Related handoff: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-handoff.md`

## Why this pivot exists

The current rewrite branch proved that the custom substrate seam is viable and
that some broad DOM-owner reductions can help. It also proved that the default
failure mode is now local React adjacency churn while the dominant user problem
remains large-scene pan/zoom on `settings`, especially `All Settings`.

The pivot changes the primary question from:

- "Which nearby mounted React owner can be trimmed next?"

to:

- "How do we make pan/zoom cost scale with visible scene primitives instead of
  mounted DOM subtree size?"

This plan is therefore pan/zoom-first. Section-level editing parity remains
important, but it is not the architectural driver.

## Worktree and branch decision

Do not restart from plain `main`.

Reasons:

- the existing rewrite branch already contains the useful foundation:
  - custom camera/runtime seam
  - canary route for `settings`
  - Pixi shell baseline
  - instrumentation and canonical probe workflow
  - many validated negative results that should not be rediscovered
- the current branch head `e1ba08245` is the right substrate base for the pivot
- `origin/main` was only ahead by Ralph/runtime infrastructure commits, not by
  the substrate work itself

Do not continue the pivot inside the original `pixijs-graph` worktree.

Reasons:

- that worktree is already serving as the active rewrite lane and durable
  reference history
- the pivot needs a cleaner decision boundary and a tighter success metric
- keeping the pivot in a fresh worktree makes it easier to compare the old
  micro-optimization lane against the new architecture lane without mixing them

Decision:

- preserve `pixijs-graph` as the rewrite/archive lane
- execute the pivot in the fresh worktree `setta.pixijs-graph-panzoom-pivot`
- base the pivot on `e1ba08245`
- fold in the newer Ralph/runtime commits from `origin/main`

## Core architecture thesis

For large scenes, pan/zoom must not require the browser to continuously
reconcile a large live DOM body forest.

The hot-path invariant should become:

- during pan/zoom, frame cost scales mainly with visible scene primitives and a
  very small active overlay set

It must stop scaling with:

- total mounted parameter rows
- total mounted section bodies
- broad store subscription fanout inside inactive DOM bodies
- DOM measurement feedback used as scene authority during motion

## Non-goals

This pivot is not:

- a return to `xyflow`
- a search for a different renderer stack
- a "make every section fully Pixi first" rewrite
- another run of row-local memo/cache tuning as the default path
- an accessibility-perfect scene replacement in the first slices

## Architectural target

### 1. Scene-owned pan/zoom authority

The camera transform, section world rects, visible set, and hit regions must be
authoritative outside the DOM body subtree.

Implications:

- pan/zoom updates the scene camera first
- section geometry is not recomputed from moving DOM shells on every frame
- DOM measurement may still exist, but only as asynchronous reconciliation for
  intrinsic content changes, not as hot-path motion authority

### 2. Dual representation for sections

Each section should support two representations:

- scene representation:
  - Pixi-owned shell
  - lightweight title/chrome/status text
  - static body preview when inactive
- DOM representation:
  - mounted only for active editing, rich interaction, selection-adjacent
    operations, or short warm buffers near the focus point

The scene representation should be sufficient for stable pan/zoom of dense
`settings` graphs.

### 3. Explicit overlay activation policy

The DOM body layer must stop being "always mounted if visible in the scene".

Introduce activation bands:

- `hot`
  - selected, focused, editing, or actively interacted with
  - full DOM body allowed
- `warm`
  - nearby and likely to become active soon
  - lightweight DOM allowed only if justified
- `cold`
  - inactive or far from the current focus window
  - scene-only preview; no heavy DOM body subtree

This policy is the key pan/zoom optimization, not a nice-to-have detail.

### 4. Active-overlay-only projection during motion

During pan/zoom:

- the scene camera moves every frame
- only the small active DOM overlay set is reprojected
- inactive sections ride the scene preview only

The number of DOM elements that need per-frame transform updates should remain
low even on `All Settings`.

## Relationship to `html-in-canvas`

The WICG `html-in-canvas` work is directionally relevant but not a dependency.

Current status observed on 2026-04-14:

- the WICG repo describes it as a living explainer
- the README says the APIs are implemented behind a Chromium flag
  `chrome://flags/#canvas-draw-element`
- the Blink thread for `placeElement()` from 2024-06-26 had:
  - no milestones specified
  - no formal spec linked as the implementation contract
  - TAG review pending
  - no Gecko signal
  - no WebKit signal

Sources:

- `https://github.com/WICG/html-in-canvas`
- `https://groups.google.com/a/chromium.org/g/blink-dev/c/ingR7ZCigUA/m/CnVJtY3_AAAJ`

Decision:

- do not build the pivot around native `html-in-canvas`
- do not market a local Pixi approach as a true `html-in-canvas` polyfill

What we can validly borrow from the proposal:

- the direction that rich DOM content should be drawable as a scene artifact
  while DOM remains the accessibility and interaction surface
- the separation between drawn representation and synchronized interactive DOM

What we still must solve ourselves:

- preview generation
- invalidation
- interaction handoff
- hit testing
- overlay synchronization
- accessibility tradeoffs

In practice, our "polyfill-like" move is:

- scene-owned static body previews for inactive content
- DOM overlays only for the active interaction set

## Benchmark change

The pivot benchmark is no longer only one narrow section on the canonical lane.

The new primary benchmark is:

- dense `settings` pan/zoom on `All Settings`

Secondary benchmark:

- canonical `rotaryParamCodeObjDefault` attribution lane for focused regression
  tracking

Required measurements for each meaningful slice:

- visible section count
- mounted DOM body count
- mounted active overlay count
- total DOM node count inside mounted overlays
- average frame duration during pan
- long-task total during pan
- scene redraw count
- full-scene redraw count
- selected-section activation/deactivation latency

Success means improved pan/zoom metrics on the dense benchmark, not merely
moving attribution among nearby React owners.

## Acceptance gates

The pivot should only be considered successful if it hits all of these:

1. `All Settings` remains usable on the custom substrate.
2. During pan/zoom, inactive sections remain visually attached with no detached
   body drift.
3. Dense-scene pan/zoom shows a real improvement in frame duration and long
   tasks.
4. Mounted DOM body count stays bounded and no longer scales linearly with the
   entire visible settings graph.
5. The active editing path still works for at least one representative section
   family after the first inactive-body scene-preview cut.

## Phase plan

### Phase A: Pan/zoom authority hardening

Goal:

- make camera/world/visible-set authority fully scene-owned for motion

Work:

- finish removing measured DOM authority from the pan/zoom path
- make visible-set derivation scene-first
- add counters for overlay count, body count, and redraw count
- classify current DOM measurement fallbacks as:
  - acceptable cold-path reconciliation
  - hot-path blockers that must be removed

Exit criteria:

- pan/zoom does not depend on moving DOM shells as the source of truth
- instrumentation exposes whether motion still scales with DOM body count

### Phase B: Inactive body scene preview

Goal:

- replace one broad inactive DOM body family with a scene-owned static preview

Candidate targets:

- param-group-heavy settings sections
- sections whose inactive body is mostly structured text/rows and does not need
  live editing during motion

Work:

- define a preview model for one representative body family
- render that preview in Pixi or a texture-backed scene layer
- mount the real DOM body only on activation

Exit criteria:

- dense-scene pan/zoom improves measurably
- inactive preview stays visually stable through pan/zoom
- activation swaps from preview to live DOM body without corruption

### Phase C: Overlay activation budget

Goal:

- ensure mounted DOM stays bounded during large-scene navigation

Work:

- implement `hot` / `warm` / `cold` activation
- cap default full-body mounting to the active/focused neighborhood
- keep non-active sections in preview mode

Exit criteria:

- `All Settings` no longer mounts full DOM bodies broadly during navigation
- mounted overlay count remains low and explicit

### Phase D: Active-section interaction fidelity

Goal:

- recover representative editing flows on the new preview/activation model

Work:

- pick one representative active editing flow
- preserve selection, focus, and text entry semantics
- ensure activation/deactivation rules do not break expected use

Exit criteria:

- active editing remains correct enough for the checked slice
- pan/zoom wins are not undone by activation churn

## First implementation slices

These should happen before any more row-adjacent React tuning:

1. Add dense-scene pan instrumentation and explicit overlay/body counters to
   the existing `settings` canary.
2. Introduce a section activation registry that can answer:
   - active DOM body?
   - preview-only?
   - warm-buffer DOM allowed?
3. Make one representative inactive settings body render as a scene-owned
   preview while keeping the selected section DOM-backed.
4. Run the dense `All Settings` pan benchmark and compare against the current
   `e1ba08245` baseline.

## Stop rules

Stop the pivot and re-evaluate if:

- the first preview slice does not reduce dense-scene pan cost at all
- the active-overlay count still scales broadly with scene size
- the scene-preview path requires rebuilding a DOM-equivalent interaction model
  before any pan/zoom win appears
- the work starts drifting back into row-local React tuning without reducing
  mounted DOM bodies

## Immediate next task

The next coding slice on this pivot branch should be:

- add dense-scene pan instrumentation plus explicit `mountedDomBodyCount`,
  `activeOverlayCount`, and `fullSceneRedrawCount` reporting to the `settings`
  canary benchmark path

Rationale:

- without these numbers, the pivot can still fall back into local owner churn
- with them, the first inactive-body preview cut can be judged against the real
  pan/zoom problem instead of narrow subtree attribution alone
