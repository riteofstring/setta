# Settings Pan/Zoom Rendering Rewrite Plan

Date: 2026-03-25
Updated: 2026-03-26
Worktree: `setta.frontend-performance-11`
Current branch: `frontend-performance-11-hybrid-rendering`
Current HEAD at start: `e66075715`
Archived prior plan: `docs/plans/worktrees/setta.frontend-performance-11/settings-pan-zoom-hybrid-rendering-plan.md`
Related log: `docs/plans/worktrees/setta.frontend-performance-11/settings-pan-zoom-rendering-rewrite-log.md`
Related summary: `docs/plans/worktrees/setta.frontend-performance-11/settings-pan-zoom-rendering-rewrite-architecture-summary.md`

## Goal

Achieve genuinely high-performance pan and zoom on dense Setta canvases such as `settings` and `tier1Synthetic`, while preserving near-1:1 visual parity and exact interaction behavior where users actively edit or manipulate content.

This plan is not satisfied by:

- removing only the old simplified fallback
- reducing hitching subjectively in short checks
- improving only `RunTask` while `Paint` stays bad
- getting a prettier approximation that drifts from current product visuals

This plan is satisfied only when:

- the authoritative benchmark shows a major drop in motion-time `Paint` cost on the dense scenes that matter
- the UI no longer changes shape during motion
- active interaction remains faithful and immediate

## Reset Decision

Archive the old hybrid-rendering plan as useful research and a correctness checkpoint, but stop treating it as the performance path.

The benchmark evidence says:

- faithful SnapDOM/image previews fixed correctness
- queueing capture work reduced some burstiness
- but every locality or warm-pool follow-up still failed the `Paint` gate

Conclusion:

- incremental tuning of `live DOM + SnapDOM capture + image overlay + locality heuristics` is unlikely to get us to the required performance envelope
- the next effort must be a rendering-system rewrite, not another threshold pass

## Executive Architecture Decision

Default assumption:

1. Treat dense-scene rendering as a retained-scene/GPU-first problem, not a DOM-preview problem.
2. Use a bespoke scene model rendered by PixiJS first.
3. Keep DOM for panes, app chrome, and active node overlays only.
4. Rewrite graph-level motion, rendering, and hit testing first.
5. Preserve node-internal DOM behavior where possible by reusing existing DOM subtrees only when nodes are active.

This does not mean "rewrite the whole frontend".

It means:

- keep the app
- keep the product behavior
- change the dense-scene rendering substrate

## Branching Decision

Implementation should not continue from the current hybrid-rendering branch tip once the architecture is locked.

Recommended execution base:

- start the rewrite from `main`
- use `main` as the visual oracle if it is closer to the desired appearance
- cherry-pick or port only the useful benchmark harness, benchmark scenes, and research findings from this worktree

Reason:

- the current worktree history is too tied to the now-rejected DOM/image-preview path
- that history is valuable as research, but not as the implementation base

## Why The Old Path Is Archived

The retained correctness checkpoint still loses badly on the benchmark:

- `settings` queued-image checkpoint:
  - benchmark `Paint`: `434.401ms`
- `tier1Synthetic` queued-image checkpoint:
  - benchmark `Paint`: `762.591ms`

And the follow-up probes all made it worse again:

- locality-capped probe:
  - rejected
- widened local warm-pool probe:
  - rejected
- pane-locality probe:
  - rejected

That means the open problem is no longer "find the right locality threshold".

The open problem is:

- how to stop dense section bodies from participating in browser paint work during motion in the first place

## Primary Architecture Hypothesis

Build a retained-scene renderer for dense scenes with active DOM overlays.

### Layer 1: Retained Scene Renderer

The resting dense graph should be rendered by a retained renderer:

- PixiJS first
- GPU-backed fast path
- scene graph aligned to camera transforms
- node bodies and edges drawn there

This layer owns:

- inactive dense node visuals
- overview and motion states
- scene-level hit regions
- graph-level selection and movement visuals

### Layer 2: Active Node Overlay Layer

Complex interactive DOM should not remain mounted for the whole graph.

Instead:

- when a node becomes active, selected for editing, or otherwise interaction-heavy, mount the real existing DOM subtree as an overlay
- keep that overlay mounted while the node is in active use
- drop back to scene rendering when inactive

This layer owns:

- CodeMirror
- comboboxes
- resize handles where needed
- node-internal `dnd-kit` interactions
- any DOM-heavy widget behavior that is too expensive or too risky to port initially

### Layer 3: Panes And App Chrome

Keep the existing DOM app shell:

- panes
- toolbars
- menus
- modals
- popovers
- non-graph UI

Strict rule:

- the live DOM budget for the graph must be bounded and intentional
- "all nodes mounted but hidden differently" is not acceptable anymore

## What This Means For JSX And Component Structure

Not all of the current JSX should survive as the hot rendering path for dense scenes.

Clean target:

- keep behavior, state wiring, and product semantics
- stop treating nested JSX as the only source of truth for dense resting visuals
- extract scene packets and layout primitives from the same underlying section data

What should remain:

- pane JSX
- app-shell JSX
- active-node JSX overlays
- controller/state components that coordinate selection, editing, commands, and data flow

What should change:

- dense resting-state node bodies should no longer be represented by the current deep JSX trees during motion
- the DOM body view should become an active overlay implementation, not the universal rendering substrate

This is the clean boundary:

- semantic source of truth remains in Setta data/state
- active DOM components remain the faithful interaction implementation
- scene rendering becomes a separate visual backend for the same semantics

## Visual Parity Strategy

Visual parity must be deliberate and systematic, not hand-tuned per widget.

### 1. Shared Design Tokens

Define shared tokens for:

- colors
- spacing
- radii
- font families
- font sizes
- font weights
- strokes
- shadows
- icons

Both scene rendering and active DOM overlays read from the same token layer.

### 2. Canonical Layout And Measurement Layer

This is mandatory.

Create one canonical layer for:

- wrap rules
- truncation rules
- row heights
- inner padding
- gap rules
- icon/text alignment
- code-like text line layout

Without this, scene parity will drift even if colors and radii match.

### 3. Semantic Scene Primitives

Do not try to mirror the entire DOM wrapper tree in the scene renderer.

Instead, define semantic primitives such as:

- section chrome
- header row
- param row
- badge
- inline code field preview
- edge anchor visual

The scene should be built from these primitives, not from a one-to-one translation of JSX wrappers.

### 4. Active DOM As Exact Interaction Oracle

When exact live behavior matters, use the real existing DOM subtree.

That is how parity stays clean:

- scene for resting visuals
- real DOM for active interaction

Target standard:

- visually indistinguishable in normal use

Important caveat:

- exact subpixel text identity across all zoom levels is not the right success criterion
- practical near-1:1 parity in normal use is the right target

## Text And Layout Risk

The biggest rendering risk is text.

This plan must explicitly solve:

- text measurement
- wrapping
- truncation
- row height consistency
- baseline alignment
- code-like text parity

Specific rule:

- no renderer workstream is complete until its text/layout story is explicit

If text parity cannot be made coherent with the chosen scene backend, the vertical slice fails.

## Edge Strategy

The rewrite must specify edges from the beginning.

Dense graph systems often fail on:

- edge routing cost
- edge hit testing
- edge-anchor coherence
- alignment between moving node visuals and edge handles

Plan rule:

- edges are part of the retained-scene vertical slice
- edge strategy cannot be deferred until after node chrome is "working"

## `xyflow` Position

Current recommendation:

- do not keep optimizing `xyflow`'s current DOM renderer
- keep only the `xyflow` pieces that remain useful and cheap
- do not commit to full `xyflow` abandonment before the retained-scene slice proves what is necessary

Working position:

- `xyflow` may survive as a thin coordinator for viewport state, selection, transforms, and positioning
- if it drags too much DOM participation or coupling back into the hot path, fork or replace that slice quickly

This is not:

- definitely keep `xyflow`
- definitely throw all of `xyflow` away immediately

This is:

- prove what `xyflow` can still do cheaply
- remove the rest if it blocks the architecture

## `dnd-kit` Scope Boundary

Do not turn this rewrite into a full drag-and-drop framework rewrite.

Split drag behavior into two classes:

### Graph-Level Drag And Placement

Rewrite this natively in the scene system:

- node movement
- scene-level placement
- graph-level selection drag
- graph-level hit testing

### Node-Internal Drag And Reorder

Preserve this inside active DOM overlays initially:

- param lists
- nested param trees
- dict/list-like editing controls
- other complex node-internal `dnd-kit` flows

This keeps scope disciplined:

- rewrite the graph hot path
- preserve complex node-internal interaction behavior until profiling proves it must move

## Recommended Backend Stack

Recommended stack:

- bespoke scene model
- PixiJS backend first
- React/Tailwind for panes and overlays

Not recommended as the primary hot path:

- more SnapDOM/image-overlay tuning
- `@pixi/react` as the main scene reconciliation layer
- raw WebGL/WebGPU from scratch on day 1

Reason:

- Pixi provides the retained renderer pieces we need without turning this into a rendering-engine-from-scratch project
- the product-specific source of truth should still be Setta's own scene model

## Explicit Non-Goals

- no more SnapDOM locality / warm-pool / pane-threshold tuning as the main path
- no more handcrafted simplified placeholders
- no full-frontend rewrite
- no per-widget canvas conversion as the core strategy
- no assumption that every inactive dense section body can remain fully live DOM
- no assumption that nested JSX structure should be mirrored 1:1 in the scene renderer
- no `Terminal` architecture work in this plan unless it becomes unavoidable through shared renderer changes

## Success Criteria

### Product Criteria

- no visible fallback-style appearance swaps during pan or zoom
- no second-click requirement to interact with a section
- no obvious handoff glitch when a node transitions from scene rendering to active DOM
- active editing state remains faithful and immediately interactive
- active-node overlays preserve current complex behaviors cleanly

### Benchmark Criteria

Minimum slice gate:

- beat the retained queued-image checkpoint on both `settings` and `tier1Synthetic`
- reduce benchmark `Paint` materially on both scenes, not just one
- reduce slow overview pan `Paint` materially on both scenes

Practical keep gate:

- the chosen rewrite path must show that it can move benchmark `Paint` substantially closer to untouched `main`, not just trade `Paint` for `RunTask`
- if a vertical slice cannot show that direction clearly, discard it fast

## Workstreams

## 0. Reset Base And Lock The Slice

Deliverables:

- decision to execute from `main`
- list of benchmark harness and research assets to port forward
- explicit vertical-slice scope

Tasks:

- identify the exact files and harnesses to carry forward from this worktree
- document the slice scene and node type to use as the proving ground
- lock the initial success/failure gate before implementation expands

Exit gate:

- restart base agreed
- vertical slice scope agreed
- benchmark gate agreed

## 1. Architecture Lock And RFC

Deliverables:

- one short RFC for the retained-scene/GPU-first architecture
- one explicit `xyflow` escalation rule
- one explicit overlay ownership rule

Tasks:

- specify the scene layer, overlay layer, and pane layer
- specify how nodes move between inactive scene rendering and active DOM overlay ownership
- specify the exact scope boundary for `dnd-kit`
- specify the exact edge strategy for the slice

Exit gate:

- one architecture locked
- one escalation rule written
- one rollback condition written

## 2. Canonical Parity Layer

Goal:

- make visual parity systematic instead of ad hoc

Tasks:

- extract shared design tokens
- define the canonical text/layout measurement rules
- define semantic scene primitives for dense nodes
- identify the ugliest text-heavy node type and make it the parity canary

Important requirement:

- scene parity must not depend on duplicating arbitrary DOM wrapper structure
- parity must come from tokens, layout rules, and semantic primitives

## 3. Scene Packet And Edge Packet Extraction

Goal:

- generate deterministic renderer packets from Setta state instead of using mounted DOM as the visual source of truth

Tasks:

- define packet schemas for node visuals
- define packet schemas for edges and hit regions
- keep packet generation deterministic and typed
- ensure packets come from the same source-of-truth section data as active DOM overlays

Strict rule:

- no heuristic keyword-based shortcuts

## 4. Vertical Slice Implementation

Goal:

- prove the architecture with one real slice before broad migration

The slice must include:

- one nasty dense benchmark scene
- one text-heavy dense node type
- retained-scene pan and zoom
- retained-scene edges
- retained-scene hit testing and selection
- one active DOM node overlay using the current real widget subtree

Tasks:

- implement Pixi scene renderer for the slice
- align the scene to the camera transform
- render edges in the same slice
- support one active node overlay that preserves current CodeMirror/combobox/resize behavior
- benchmark the slice on `settings` and `tier1Synthetic`

Exit gate:

- if the slice does not materially beat the retained queued-image checkpoint on both dense scenes, stop and rethink before broader rollout

## 5. Overlay Ownership And Interaction Handoff

Goal:

- make scene-to-DOM transitions invisible and predictable

Tasks:

- define exactly when a node becomes an active DOM overlay
- keep active overlays mounted while actively used
- ensure pointer, keyboard, selection, and focus ownership swap cleanly
- ensure edge anchors stay coherent when a node is overlay-owned

Important requirement:

- handoff policy must be coarse and stable
- no zoom-threshold flapping like the old preview path

## 6. `xyflow` Viability Gate

Goal:

- decide how much of `xyflow` survives after the slice

Tasks:

- measure whether `xyflow` still forces too much DOM wrapper cost
- measure whether its viewport/selection shell still helps more than it hurts
- fork or replace the dense-scene rendering slice quickly if it blocks the retained-scene design

Decision outcomes:

- keep thin `xyflow` shell
- fork dense-scene renderer path
- or replace more of `xyflow` if needed

## 7. Tier 1 Rollout

Goal:

- make the rewrite production-capable for Tier 1 dense sections first

Tasks:

- wire Tier 1 dense sections to the new renderer path
- keep sparse scenes on DOM until profiling justifies migration
- benchmark continuously against `settings` and `tier1Synthetic`
- reject expansions that preserve correctness but fail the `Paint` gate

## Evidence Base

The rewrite plan is based on these results:

- `perf/reports/frontend/2026-03-25_section-benchmark-tier1-image-preview-queue-rerun.md`
- `perf/reports/frontend/2026-03-25_section-benchmark-tier1-preview-locality-rerun.md`
- `perf/reports/frontend/2026-03-25_section-benchmark-tier1-local-warm-pool-rerun.md`
- `perf/reports/frontend/2026-03-25_section-benchmark-tier1-pane-locality-rerun.md`

These collectively show:

- correctness got better
- benchmarked motion paint did not
- locality-only tuning is not the right lever

## Immediate Next Actions

1. Update the rewrite RFC language to retained-scene/GPU-first rather than "canvas-first".
2. Add explicit text/layout and edge strategy sections before implementation work expands.
3. Lock the vertical slice:
   - one benchmark scene
   - one text-heavy node type
   - edges included
   - one active DOM overlay
4. Restart the implementation from `main`.
5. Reject the slice quickly if it does not materially beat the retained queued-image checkpoint on benchmark `Paint` for both dense scenes.
