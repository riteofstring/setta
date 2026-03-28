# Settings Pan/Zoom Rendering Rewrite Plan

Date: 2026-03-25
Updated: 2026-03-26
Imported to this worktree: 2026-03-26
Worktree: `setta.pixijs-rewrite`
Current branch: `pixijs-rewrite`
Current HEAD at worktree start: `26e7406b7`
Imported source worktree: `setta.frontend-performance-11`
Imported source commit: `42696484b`
Related log: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-log.md`
Related summary: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-architecture-summary.md`

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
3. Keep DOM for panes, popups, heavyweight editor surfaces, and thin interaction adapters. Do not let DOM replace the visible node body as the default active-state path.
4. Rewrite graph-level motion, rendering, hit testing, and most graph-surface controls first.
5. Preserve semantics and business rules from existing DOM widgets, but do not assume the existing DOM widget libraries remain the graph-surface implementation.

This does not mean "rewrite the whole frontend".

It means:

- keep the app
- keep the product behavior
- change the dense-scene rendering substrate

## Implementation Discipline

This plan must be executed with a cleanup-first, TDD-first workflow so the rewrite remains understandable to both humans and AI across conversations.

Per-file rule:

1. Before changing a messy target file, use the relevant architecture/cleanup skill to simplify and deepen the module first.
2. Make the cleanup a separate step with a clear boundary.
3. Write or update tests for the new behavior before implementing the Pixi/scene work.
4. Implement the new behavior.
5. Run the relevant tests and verification.
6. Append the log with status, files touched, benchmark/test state, and next action.

Skill rule:

- before modifying a messy or high-coupling file, use the relevant skill guidance, especially `improve-codebase-architecture`, to reduce shallow-module sprawl and make the file more AI-navigable
- do not jump straight into Pixi implementation inside a file that is still structurally unclear

TDD rule:

- every work item should explicitly follow:
  - baseline / context read
  - cleanup/refactor of the target file or cluster
  - tests for the intended new behavior
  - implementation
  - test run and verification
  - append-only log update

Translation rule:

- every major item must leave behind enough plan/log/test context that a later chat can resume without reconstructing intent from scratch
- implementation steps should prefer named stages, explicit files, and explicit exit gates over vague prose

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

### Layer 2: DOM Overlay And Editor Layer

DOM should not replace the visible node body by default.

Instead:

- the visible graph surface stays scene-rendered whenever practical
- DOM is used for thin interaction adapters, popups, and heavyweight editors
- code-like fields must begin editing on the first click, not require an activation click
- only use a whole-node DOM overlay if a specific interaction proves impossible to preserve cleanly any other way

This layer owns:

- immediate editor mounts for CodeMirror-backed fields and code blocks
- combobox, color-picker, and similar popups
- invisible or near-invisible text/input adapters where needed
- rare deliberate editor surfaces
- only narrowly-scoped whole-node overlays if explicitly justified by parity and benchmark data

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
- popup/editor JSX
- controller/state components that coordinate selection, editing, commands, and data flow

What should change:

- dense resting-state node bodies should no longer be represented by the current deep JSX trees during motion
- the DOM body view should no longer be assumed to be the default visible active-state implementation either
- graph-surface controls should move toward scene primitives plus focused DOM adapters, not wrapper-for-wrapper JSX translation

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

### 4. DOM As Interaction Adapter, Not Default Visual Owner

When exact live behavior matters, use DOM selectively.

The parity rule is:

- scene remains the owner of the visible graph surface whenever practical
- DOM augments interaction without visibly replacing the node chrome by default
- popups and heavyweight editors may be DOM, but incidental one-control swaps inside the visible node surface should be avoided

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

## Graph Widget Strategy

Not every current graph-surface control should be treated the same.

### Scene-Native In The Graph

These should trend scene-native in the graph surface:

- sliders
- toggles
- checkboxes
- resize grips
- row handles
- dict/list row visuals
- kanban card visuals
- graph-surface drag affordances

### Scene-Native Closed State, DOM Popup

These can keep DOM popups while leaving the closed control scene-rendered:

- comboboxes
- color pickers
- date pickers
- context menus

### Heavy Editor Surfaces

These should use real editors, but must support first-click editing:

- CodeMirror-backed code blocks
- CodeMirror-backed inline code fields
- other heavyweight text/code editors

Rule:

- the first click in a code field should mount and focus the editor immediately in the same interaction, not require a second click
- the visible field chrome should remain stable when that happens

### Pane-Only DOM

These stay DOM-first:

- panes
- non-graph app UI
- windowed tools outside the main graph surface

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

Do not assume `dnd-kit` remains the long-term implementation for this inside the graph surface.

Preserve semantics and business rules, but plan to replace graph-surface interaction plumbing for:

- param lists
- nested param trees
- dict/list-like editing controls
- kanban boards and drag/drop lists inside graph nodes
- other complex node-internal `dnd-kit` flows that live inside the graph surface

This keeps scope disciplined:

- rewrite the graph hot path
- preserve behavior semantics first
- replace DOM-bound drag plumbing where necessary to keep the visible graph surface scene-owned

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
- code-like fields and code blocks enter edit on the first click and accept typing immediately
- graph-surface controls do not visibly change renderer ownership in a janky way during normal interaction

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
- specify the rule that the visible graph surface stays scene-owned by default
- specify how immediate first-click editor activation works for code-like fields
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
- define the stable visible field chrome for code-like inputs so editor activation does not change appearance

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
- one CodeMirror-backed field that enters edit on the first click without visual jank
- one popup-style control such as a combobox or color picker
- one drag/reorder interaction inside the graph surface

Tasks:

- implement Pixi scene renderer for the slice
- align the scene to the camera transform
- render edges in the same slice
- support immediate editor activation for a CodeMirror-backed field
- support one popup-style DOM overlay anchored to the scene
- support one scene-native drag/reorder path inside the graph surface
- benchmark the slice on `settings` and `tier1Synthetic`

Exit gate:

- if the slice does not materially beat the retained queued-image checkpoint on both dense scenes, stop and rethink before broader rollout

## 5. Overlay Ownership And Interaction Handoff

Goal:

- make scene-to-DOM transitions invisible and predictable

Tasks:

- define exactly which interactions use:
  - pure scene ownership
  - thin DOM adapters
  - popup overlays
  - rare deliberate whole-node overlays
- keep heavy editors mounted while actively used
- ensure pointer, keyboard, selection, and focus ownership swap cleanly
- ensure edge anchors stay coherent when a node is overlay-owned

Important requirement:

- handoff policy must be coarse and stable
- no zoom-threshold flapping like the old preview path
- no activation-click model for editors

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
- apply the cleanup-first, test-first workflow for each file cluster before scene migration work lands

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
2. Lock the stricter visible-surface rule: visible graph pixels stay scene-owned by default, and code editing cannot require an extra activation click.
3. Add explicit text/layout and edge strategy sections before implementation work expands.
4. Add the cleanup-first, skill-assisted TDD workflow to the branch handoff checklist.
5. Lock the vertical slice: one benchmark scene, one text-heavy node type, edges included, first-click CodeMirror editing, one popup control, and one graph-surface drag/reorder path.
6. Restart the implementation from `main`.
7. Transfer the revised plan and append-only log into the new branch once it exists.
8. Reject the slice quickly if it does not materially beat the retained queued-image checkpoint on benchmark `Paint` for both dense scenes.
