# Settings Pan/Zoom Rendering Rewrite Architecture Summary

Date imported to this worktree: 2026-03-26
Worktree: `setta.pixijs-rewrite`
Branch: `pixijs-rewrite`
Worktree start commit: `26e7406b7`
Imported source worktree: `setta.frontend-performance-11`
Imported source commit: `42696484b`

## Context

The prior hybrid-rendering effort should be treated as research, not as the basis for the new implementation.

What the old work achieved:

- Removed the unacceptable simplified placeholder versions of dense nodes.
- Switched to faithful image-based previews instead of fake simplified DOM shapes.
- Improved correctness and visual fidelity relative to the placeholder fallback.

What the old work did not achieve:

- It did not produce the benchmark-level performance improvement the plan required.
- `Paint` remained much worse than `main`.
- Multiple follow-up locality and warm-pool probes were benchmarked and rejected because they made `Paint` even worse.

Current conclusion:

- The DOM/image-preview/SnapDOM path is the wrong rendering substrate for this problem.
- Continuing to tune overlay capture, warming, locality, or cache heuristics is unlikely to produce the required result.

## Why The Old Path Was Abandoned

The rejected path combined:

- live DOM as the source of truth
- image or SnapDOM overlays during motion or overview states
- locality and warm-pool heuristics to decide what stayed hot

That path appears structurally flawed for this use case because:

- it still depends on large live DOM trees for dense scenes
- it adds capture/compositing work on top of the DOM cost
- it introduces renderer-ownership churn during pan/zoom
- it makes tuning complexity grow without removing the core browser paint cost

The result was correctness improvements without the required performance win.

## Proposed New Direction

The new direction is a canvas-first retained renderer for dense graph scenes.

Target model:

- the graph scene is primarily rendered by one retained renderer
- pan and zoom become camera operations on that renderer
- node bodies and edges are rendered there too
- DOM is no longer the normal rendering path for graph content

DOM still exists, but only for:

- app chrome and panes
- menus, modals, popovers, and tool surfaces
- active node overlays for direct interaction and editing
- heavyweight controls such as CodeMirror, comboboxes, resize handles, and similar widgets

This is closer to a Figma-style or Miro-style architecture than a traditional React DOM graph.

## Core Architectural Principle

Do not keep flipping the same node between multiple steady-state rendering modes during motion.

The old hybrid path effectively did that. The new architecture should not.

Instead:

- inactive graph content is scene-rendered
- active or editing content can be DOM-rendered as an overlay
- handoff is coarse and stable, not constantly changing on small zoom/pan deltas

The goal is to eliminate whole-scene DOM ownership as the default state.

## Visual Parity Strategy

The plan is not to build a rough canvas approximation and accept drift.

Visual parity should come from a shared design-token layer:

- colors
- spacing
- radii
- font families
- font sizes
- font weights
- strokes
- shadows
- icons

The scene renderer uses those tokens to draw resting graph visuals.
The DOM overlays reuse the existing React/Tailwind widgets for active interaction states.

This means:

- canvas reproduces the current look of node chrome, rows, badges, separators, icons, and edges
- DOM is reused where exact live interaction behavior matters

Target standard:

- visually indistinguishable in normal use

Important caveat:

- text parity is the hardest part
- exact font metrics, line wrap, and subpixel antialiasing need special attention
- exact mathematical pixel identity is probably not the right success criterion
- practical, near-1:1 visual parity in normal usage is the correct target

## Recommended Rendering Stack

Recommended stack:

- bespoke scene model
- PixiJS as the rendering backend
- React and Tailwind for overlays and app chrome

Not recommended as the primary hot path:

- continuing with DOM/SnapDOM/image overlays
- `@pixi/react` as the main scene reconciliation layer
- Konva as the primary scene renderer
- raw WebGL/WebGPU from scratch on day 1

Why PixiJS:

- it gives a retained renderer with transforms, batching, sprites, text, and caching
- it is much lower risk than building a rendering engine from scratch
- it still allows the scene model to remain fully bespoke and product-specific

Why a bespoke scene model still matters:

- Setta-specific rendering rules should belong to Setta, not to a generic library abstraction
- the source of truth should be application-specific scene objects, not a pile of Pixi nodes

## What Stays And What Changes

What likely stays:

- React for the app shell
- Tailwind for app chrome and overlay UI
- existing pane UI and non-graph DOM surfaces
- existing heavyweight DOM widgets where they are activated on demand

What changes:

- dense graph rendering stops being DOM-based
- graph pan/zoom becomes scene-native camera work
- inactive graph nodes stop existing as large mounted DOM trees
- graph-level drag and placement become scene-native interactions

## `xyflow` Position

Current position:

- stop tuning `xyflow`'s current DOM renderer
- keep only the `xyflow` pieces that remain useful and cheap
- do not commit to full `xyflow` abandonment before proving the retained scene approach

Practical interpretation:

- if `xyflow` can remain a coordinator for viewport state, transforms, selection, and related shell behavior without dragging large DOM costs back in, keep those pieces
- if `xyflow` still forces too much DOM baggage after the renderer rewrite, fork or replace that slice too

This is not:

- definitely keep `xyflow`
- definitely throw all of `xyflow` away immediately

This is:

- replace the dense-scene rendering model first
- keep only the `xyflow` parts that still help and are not on the hot path

## Interaction Model

The intended interaction model is:

- resting graph scene: canvas/Pixi
- active node: DOM overlay
- panes and non-graph UI: existing DOM UI

There should not be whole-scene hitching on normal interactions if this is implemented correctly.

The goal is:

- no full-graph DOM repaint on pan/zoom
- no full-graph DOM repaint on click
- at most a local activation cost when a heavy editor or interactive node is opened

To make that work:

- use one stable overlay host above the scene
- reuse heavyweight overlays where possible
- keep active nodes mounted while actively used instead of flapping them in and out

## Initial Branch-Local Slice

First proving ground:

- Settings project `All Settings`

Why this scene starts first:

- the current worktree already contains a local benchmark report for it:
  - `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`
- that report shows the dominant regression in the dict/param stack, not in the top-level `xyflow` shell
- it is the clearest branch-local baseline for the cleanup-first, pre-Pixi gate

First text-heavy node path:

- dict-style param trees rendered through:
  - `DictArea`
  - `GroupContainer`
  - `GetParamSwitch`
  - `ParamContainer`
  - `ParamInput`

Why this path is the parity canary:

- it carries the dense row count that already hurts the benchmark
- it includes the code-like inputs that need first-click editing via `TextInputCodeMirror`
- it includes popup-style controls that can stay DOM-backed on activation via `IdNameCombobox`
- it includes graph-surface drag/reorder behavior through `ParamDndContext`

First coordinator shell kept on probation:

- `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
- `frontend/src/forks/xyflow/core/container/FlowRenderer.tsx`
- `frontend/src/forks/xyflow/core/container/NodeRenderer.tsx`
- `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`

Pre-implementation prerequisite:

- the branch has the report, but not the earlier benchmark entrypoint/spec referenced by that report
- before the first Pixi slice lands, re-establish a branch-local benchmark harness so the rewrite can be measured in this worktree rather than inferred from prior branch artifacts

## CodeMirror Strategy

The existing code already contains a useful pattern:

- a dummy-to-real handoff in `TextInputCodeMirror`
- a dummy highlighted read-only representation in `DummyCodeMirror`

Relevant references:

- [TextInputCodeMirror.tsx](/Users/jeff/Documents/_projects/setta.frontend-performance-11/frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx)
- [DummyCodeMirror.tsx](/Users/jeff/Documents/_projects/setta.frontend-performance-11/frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx)

Proposed direction:

- render resting code text in the scene using shared text and token rules
- for code-like fields that need syntax-like resting display, preserve the current parser/highlighting logic conceptually
- when editing begins, move a real pooled CodeMirror instance into place as a DOM overlay

The key point is:

- do not mount real CodeMirror instances across the whole graph
- use real CodeMirror only while the field or node is active

## Combobox Strategy

The existing combobox system already uses a DOM portal for the interactive list.

Relevant references:

- [IdNameCombobox.tsx](/Users/jeff/Documents/_projects/setta.frontend-performance-11/frontend/src/components/Utils/Combobox/IdNameCombobox.tsx)
- [ComboboxParts.tsx](/Users/jeff/Documents/_projects/setta.frontend-performance-11/frontend/src/components/Utils/Combobox/ComboboxParts.tsx)

Proposed direction:

- render the closed combobox field visually in the scene
- when activated, reuse the real existing combobox DOM and portal behavior
- keep Downshift-based logic and list behavior in DOM instead of reproducing it in canvas

This is a good example of the broader strategy:

- canvas for resting state
- real DOM for active interaction state

## Resizable Handles And Similar Controls

Relevant reference:

- [CustomResizable.tsx](/Users/jeff/Documents/_projects/setta.frontend-performance-11/frontend/src/components/Utils/Resizable/CustomResizable.tsx)

Proposed direction:

- scene-render the visible handle affordance when inactive
- use either tiny overlay handles or scene hit-regions for activation
- keep the heavier DOM resize behavior only where needed

These controls are localized enough that they do not need to drive the overall rendering architecture.

## `dnd-kit` Strategy

This is one of the most important scope controls.

Do not plan to reimplement all of `dnd-kit`.

Instead, split drag behavior into two classes:

### 1. Graph-level drag and placement

Examples:

- top-level section dragging
- scene-level placement
- graph-level movement and collision logic

Relevant references:

- [TopLevelContainer.tsx](/Users/jeff/Documents/_projects/setta.frontend-performance-11/frontend/src/components/Section/Container/TopLevelContainer.tsx)
- [SortableSectionContainer.tsx](/Users/jeff/Documents/_projects/setta.frontend-performance-11/frontend/src/components/Section/Container/SortableSectionContainer.tsx)

Recommendation:

- replace this layer with scene-native pointer logic

### 2. Intra-node widget drag and reorder

Examples:

- param reordering
- nested param trees
- dict/list-like editing controls
- other complex node-internal sortable behavior

Relevant references:

- [ParamSwitch.tsx](/Users/jeff/Documents/_projects/setta.frontend-performance-11/frontend/src/components/Params/ParamSwitch.tsx)
- [ParamDndContext.tsx](/Users/jeff/Documents/_projects/setta.frontend-performance-11/frontend/src/components/Params/ParamDndContext.tsx)

Recommendation:

- keep the current DOM plus `dnd-kit` behavior for active node overlays
- do not try to reproduce these interactions in the scene renderer up front

So the rewrite should not become a full drag-and-drop framework rewrite.
Only graph-level drag behavior should move into the scene system initially.

## Active Node Overlay Model

One clarification that emerged during the design discussion:

The right overlay model is not necessarily "only tiny field overlays."

For many complex nodes, the better model is:

- inactive node: scene-rendered
- active node: real existing DOM subtree mounted as an overlay

That means:

- existing `dnd-kit` behavior inside the node can remain intact
- existing CodeMirror components can remain intact
- existing combobox and portal logic can remain intact
- existing resize affordances can remain intact

This reduces rewrite risk substantially.

In other words, the canvas rewrite should primarily target:

- dense resting-state graph rendering
- graph-level motion and interaction performance

It should not require immediate full reimplementation of every advanced node-internal interaction.

## Expected Hitching Characteristics

If the architecture is implemented correctly:

- pan/zoom hitching from full-scene DOM should be eliminated or greatly reduced
- clicking into a node should not force the whole graph back into DOM
- there may still be a one-time local activation cost for a very heavy node or editor
- that activation cost should be bounded to the active node overlay, not the whole scene

This is a materially different performance profile from the current DOM-heavy graph.

## Branching Recommendation

The rewrite likely should not continue from the current hybrid-rendering branch tip.

Recommendation:

- branch from `main`
- use `main` as the visual oracle if it is currently closer to the desired appearance
- cherry-pick or port only the useful benchmark harness, benchmark scenes, and research findings from the current branch

Reason:

- the current worktree contains a large amount of history tied to the now-rejected DOM/image-preview approach
- that history is useful as research, but it is probably not the right implementation base for the rewrite

## Backend / Go Relevance

The nearly-finished Go backend rewrite is useful context, but it does not directly solve the core rendering problem.

Potential ways Go could help:

- render-packet preprocessing
- layout or indexing preprocessing
- compact binary payload generation
- tile/snapshot generation if needed

What it does not solve by itself:

- browser-side `Paint` cost from a DOM-heavy dense graph scene

So the primary breakthrough still has to come from the frontend rendering model.

## Main Open Questions

Questions that still need external review or spike validation:

- Is PixiJS the right retained renderer backend, or should raw WebGL/WebGPU be considered sooner?
- How much of `xyflow` can be retained without dragging DOM overhead back into the hot path?
- What is the best strategy for text metrics and code-like text parity?
- How should active-node overlay lifecycle, focus, selection, and accessibility be coordinated with the scene renderer?
- What is the exact boundary between graph-level scene-native drag and node-internal preserved DOM drag?

## Proposed Judgement Call

The main judgement call requested from an external reviewer is:

- Is the canvas-first retained-scene architecture with active-node DOM overlays the right next move for achieving extremely high performance while preserving near-1:1 visual parity?

Secondary judgement calls:

- Is PixiJS the right backend choice for the first implementation?
- Should the rewrite begin from `main` rather than from the current hybrid-rendering worktree?
- Is preserving node-internal `dnd-kit` behavior via active DOM overlays the right scope boundary?

## Short Version

The new proposal is:

- stop trying to optimize the DOM/image-preview/SnapDOM path
- move dense graph rendering to a canvas-first retained renderer
- keep DOM only for panes, app chrome, and active node interaction overlays
- keep existing heavyweight widget behavior by reusing the real DOM subtree only when the node is active
- replace graph-level drag and motion with scene-native interactions
- preserve node-internal `dnd-kit` and complex DOM behaviors inside active overlays
- likely restart the rewrite from `main`

This should be treated as a rendering-system rewrite for the dense graph surface, not as another tuning pass on the existing hybrid DOM path.
