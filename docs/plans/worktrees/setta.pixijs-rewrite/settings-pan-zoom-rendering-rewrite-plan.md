# Settings Pan/Zoom Rendering Rewrite Plan

Date: 2026-03-25
Updated: 2026-03-31
Imported to this worktree: 2026-03-26
Worktree: `setta.pixijs-rewrite`
Current branch: `pixijs-rewrite`
Current HEAD at worktree start: `26e7406b7`
Imported source worktree: `setta.frontend-performance-11`
Imported source commit: `42696484b`
Related log: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-log.md`
Related summary: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-architecture-summary.md`

## Goal

Achieve genuinely high-performance pan and zoom on dense Setta canvases such as `settings` and `tier1Synthetic`, while preserving `1:1` visual parity with `main` in the primary macOS `100%`-zoom canary states and exact interaction behavior where users actively edit or manipulate content, including faithful hover, active, focus, and selected-state feedback for anything that remains scene/canvas-owned.

This plan is not satisfied by:

- removing only the old simplified fallback
- reducing hitching subjectively in short checks
- improving only `RunTask` while `Paint` stays bad
- getting a prettier approximation that drifts from current product visuals
- landing performance wins while the renderer still shows first-zoom text metric shifts, blurry or blocky zoom behavior, or visible snap-after-zoom artifacts

This plan is satisfied only when:

- the authoritative benchmark shows a major drop in motion-time `Paint` cost on the dense scenes that matter
- the UI no longer changes shape during motion
- side-by-side comparison against `main` does not reveal obvious layout, chrome, spacing, or affordance drift in normal use
- the targeted canary states are pixel-perfect versus `main` at `100%` zoom in the primary macOS reference environment
- the targeted canary interaction states are also faithful versus `main`: hover, active/pressed, focus, and selected visuals for any scene/canvas-owned rows, ports, handles, or controls must match the current product behavior
- text and chrome remain visually stable through zoom interactions; no first-zoom width jump, no temporary too-wide text frame, and no blurry or blocky text presentation during normal zooming
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
3. The cleanup/refactor step must end in a working, verified state on the current non-Pixi path before any Pixi/scene rewrite begins for that slice.
4. Write or update tests for the intended behavior before implementing the Pixi/scene work.
5. Implement the new behavior only after the refactored baseline is working again.
6. Run the relevant tests and verification.
7. Append the log with status, files touched, benchmark/test state, and next action.

Skill rule:

- before modifying a messy or high-coupling file, use the relevant skill guidance, especially `improve-codebase-architecture`, to reduce shallow-module sprawl and make the file more AI-navigable
- do not jump straight into Pixi implementation inside a file that is still structurally unclear

TDD rule:

- every work item should explicitly follow:
  - baseline / context read
  - cleanup/refactor of the target file or cluster
  - restore the refactored code to a working, verified non-Pixi state
  - tests for the intended new behavior
  - Pixi/scene implementation
  - test run and verification
  - append-only log update

Verification surface normalization rule:

- unless a slice is explicitly about workspace chrome, pane behavior, or project chat behavior, normalize the verification surface before comparing against `main`
- apply that normalization symmetrically to both the current worktree surface and the read-only `main` reference surface before any side-by-side comparison
- default parity/test setup should minimize or close non-target panes and close the docked/floating/maximized chat surfaces so the checked state on both sides is the graph surface itself, not incidental surrounding chrome
- keep a pane or chat surface open only when the current test or parity slice is specifically verifying that pane/chat behavior or truly requires that surface to exercise the target interaction
- if a verification run intentionally keeps extra pane or chat chrome visible, log that choice and the reason so later iterations do not mistake uncontrolled workspace state for renderer drift
- parity-harness and oracle-alignment work is support work only; once the graph surface is normalized and the intended `main` reference/backend binding is proven, the next slice should target a renderer or interaction defect rather than continue refining support checks
- do not spend more than two consecutive iterations on harness/oracle-only work without landing production renderer/interaction code; if the next candidate slice is still support-only, stop and replan instead of continuing the pattern

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

### Current Canary Versus Intended Scope

The current `pixi-node-body` slice is a proving canary, not the final scope boundary.

Treat that explicitly:

- `pixi-node-body` is only the first retained-scene slice that proves scene rendering, overlays, and interaction handoff on a real Settings path
- the intended end state is broader scene ownership of the hot visible graph surface whenever practical, including dense node bodies, edges, and graph-surface visuals
- panes, popups, heavyweight editors, and other non-graph app chrome remain DOM-first
- if the current Pixi text or chrome path cannot reach the visual bar against `main`, the implementation must change; the plan should not be weakened to fit the current canary

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

Scene text and chrome must also stay stable through zoom, DPR, and font-load transitions.

A renderer that looks wrong on the first zoom and only becomes correct after a later redraw does not satisfy this plan, even if the resting screenshot eventually looks right.

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

- exact subpixel text identity across every platform, DPR, and zoom level is not the right success criterion
- however, for the primary macOS Chrome `100%` zoom canary states, the final acceptance target is `1:1` appearance versus `main`, not "near parity"

Staged gate sequencing:

- Gate 1, workable baseline:
  - no gross visual drift
  - no wrong workspace/project surface or stale chrome state
  - no obvious zoom artifacts
  - interactions correct for the checked slice
- Gate 2, normal-use parity:
  - spacing, text, chrome, and interaction-state behavior should become visually indistinguishable in ordinary use without deliberate pixel hunting
- Gate 3, final canary parity:
  - macOS Chrome `100%` canary should reach `1:1` versus `main`
- The rewrite should always target the earliest failing gate first; do not burn iterations on Gate 3 cleanup while Gate 1 or Gate 2 still has obvious failures.

Visual drift guardrails:

- `main` remains the visual oracle for the rewrite unless a different reference is explicitly named
- the primary screenshot/parity environment for this rewrite is macOS Chrome at `100%` zoom; in that environment, the final target is pixel-perfect reproduction of `main` for the named canary states
- on other platforms, the goal is not "match macOS pixels"; the goal is that Pixi/canvas layout, spacing, wrapping, truncation, and control geometry match the DOM implementation on that same local platform
- acceptable differences are limited to low-level rendering details that are not meaningfully visible in ordinary use, such as microscopic antialiasing or rasterization differences, and only when geometry/layout/chrome still match
- unacceptable differences include changed row heights, changed spacing/padding/gaps, changed truncation or wrapping behavior, changed icon/text alignment, changed handle or port placement, changed border/radius/shadow treatment, missing chrome, or any visible layout simplification that a human would notice in a side-by-side comparison
- unacceptable differences also include resting-state parity that only looks right until interaction begins: if a scene/canvas-owned affordance loses or changes its hover, active/pressed, focus, or selected feedback relative to `main`, the parity gate is not met
- DOM elements and Pixi-rendered elements must agree on local platform font metrics strongly enough that row heights, baselines, wrapping, truncation, padding, and perceived control sizing stay matched within the same environment
- first-zoom text instability is not acceptable: no temporary too-wide text frame, no later snap-to-correct-width redraw, and no visible font-metric jump once zoom begins
- zoom-time blur/blockiness is not acceptable in normal use: if the Pixi path looks visibly blurrier or more pixelated than `main` during ordinary zoom interaction, that path has not met the visual gate
- performance improvements do not buy permission to keep these artifacts; visual stability against `main` remains a hard gate
- if a parity exception is intentional, it must be called out explicitly in the log and justified as required for performance or interaction correctness; do not silently drift from `main`
- "close enough" means a user familiar with the current product should not notice a styling or layout change during normal use without deliberately hunting for microscopic rendering differences

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
- no obvious visual regression versus `main` in side-by-side comparison of the targeted canary path
- pixel-perfect reproduction versus `main` at `100%` zoom in the primary macOS reference environment for the targeted canary path, except for explicitly allowed microscopic rasterization differences
- no first-zoom text width jump, no transient too-wide text frame, and no later snap-to-correct-metrics redraw on the targeted canary path
- no visibly blurry or blocky text during ordinary zoom interaction on the targeted canary path
- no second-click requirement to interact with a section
- no obvious handoff glitch when a node transitions from scene rendering to active DOM
- active editing state remains faithful and immediately interactive
- active-node overlays preserve current complex behaviors cleanly
- code-like fields and code blocks enter edit on the first click and accept typing immediately
- graph-surface controls do not visibly change renderer ownership in a janky way during normal interaction
- any row, port, handle, or control that remains scene/canvas-owned preserves the same hover, active/pressed, focus, and selected-state feedback as `main`; parity is not limited to resting screenshots
- layout metrics that users actually perceive must stay stable: row height, indentation depth, label/value alignment, section chrome spacing, and edge/handle placement should match the current product unless a logged exception says otherwise
- on non-macOS platforms, local DOM and local Pixi/canvas rendering must still match each other in fonts, spacing, row sizing, wrapping, truncation, and alignment even if the platform font rasterization differs from macOS

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

### Branch-Local Start Slice

- proving-ground scene:
  - Settings project `All Settings`
- why this scene starts first:
  - the local report `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md` already shows the main cliffs in the dict/param stack
  - the report isolates row-count and real-widget cost, which is the right pre-Pixi baseline for the rewrite
- parity canary node path:
  - dict-style param trees with text-heavy rows and code-like inputs
- cleanup-first target file cluster before any Pixi code:
  - `frontend/src/components/Section/Layouts/DictArea.tsx`
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Params/GetParamSwitch.tsx`
  - `frontend/src/components/Params/ParamContainer.tsx`
  - `frontend/src/components/Params/ParamItems/ParamInput.tsx`
  - `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
  - `frontend/src/components/Utils/Combobox/IdNameCombobox.tsx`
  - `frontend/src/forks/dnd-kit/ParamDndContext.tsx`
  - `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
  - `frontend/src/forks/xyflow/core/container/FlowRenderer.tsx`
  - `frontend/src/forks/xyflow/core/container/NodeRenderer.tsx`
  - `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`
- interaction requirements this slice must preserve:
  - first-click CodeMirror activation without visible chrome changes
  - one popup-style combobox interaction anchored to the scene
  - one param-row drag/reorder path inside the graph surface
  - retained-scene edges and hit testing in the same proving ground
- branch-local benchmark carry-forward note:
  - this worktree already contains the `2026-03-07` settings benchmark report
  - the later tier1 section-benchmark reports listed in `Evidence Base` still live only in the imported source worktree `setta.frontend-performance-11`
  - the older settings benchmark report references a benchmark entrypoint/spec that are not present in this worktree, so a branch-local benchmark harness must be re-established before the first Pixi slice lands

Exit gate:

- restart base agreed
- vertical slice scope agreed
- benchmark gate agreed
- first cleanup-first file cluster named
- branch-local benchmark carry-forward gaps named

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
- do not begin Pixi migration for a slice until the refactored non-Pixi version of that slice is working and verified

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

### Current Ralph Frontier And Stop Condition

The cleanup-first and packet/boundary extraction work was useful up through the point where the live dict-area and section boundaries reached real composition points.

The recent route/bootstrap seam-lift loop is not the right next lever.

Treat the following as explicit plan guidance:

- The current seam-lift lane is complete once the renderer/boundary contract reaches the nearest caller that actually chooses an implementation.
- Do not continue lifting `SectionBoundary`, `renderDictArea`, or equivalent contracts through pure forwarding layers such as route assembly, browser-router wrappers, `App.tsx`, bootstrap modules, or `index.tsx` unless that layer truly selects between implementations or removes a real dependency.
- Repeated "move it one level higher" work through pass-through callers is churn, not progress.
- If the next candidate slice is another pure forwarding hop, stop that lane and move to the real blocker or the next real implementation step.
- Low-zoom Pixi `overview` / LOD presentation is disabled by default and is not the current product baseline.
- Do not spend iterations reintroducing, polishing, or re-tuning low-zoom overview/skeleton states unless there is fresh explicit product direction or new measured perf evidence that the always-`detail` baseline cannot meet the bar.
- If overview must be checked again, keep it as an explicit experiment (`?liveDictAreaPixiOverview=enabled`), not as the default canary path or the next assumed Ralph lane.

### Current Highest-Priority Blocker

The current blocker is failure to consistently clear the early visual gates on the live Pixi canary, not more perf-only probing and not more scope shuffling.

Current evidence says:

- the live `pixi-node-body` canary is visibly far from `main` in ordinary use
- text can look too wide on first zoom and then settle after a later redraw
- text can look blurry or blocky during zoom interaction
- those artifacts are user-visible failures, not acceptable canary debt
- perf findings on a visually unstable canary are still useful research, but they do not mean the renderer path is ready or even visually acceptable
- repeated `Too many active WebGL contexts` / `dom-context-lost` failures now show that per-card Pixi `Application` ownership is itself part of the blocker, not just the local lifecycle details

This means the immediate job is not "keep probing perf forever" and not "treat node-body-only scope as the final architecture."

The immediate job is to clear Gate 1 reliably, then push toward Gate 2, so further perf work is happening on the right visual baseline. Gate 3 remains the final acceptance bar, but it is not the only definition of useful progress during the rewrite.

### Renderer Ownership Reset

The recent blocker means the next replan is about ownership, not visuals-only polish:

- do not keep each visible live Pixi card on its own Pixi `Application` lifecycle
- do not introduce a second independent Pixi pan/zoom controller
- keep `xyflow` as the single source of truth for viewport, fit-view, and graph transform
- move Pixi to a shared page-level runtime that reads the same viewport state and renders the visible graph/card surfaces from that shared runtime
- keep heavyweight editors, DOM overlays, and app chrome on DOM, but have them read the same transform/orchestration state instead of reconciling two viewport systems

### Real Next Actions

1. Replace per-card Pixi `Application` ownership with one shared page-level Pixi runtime for the visible `settings` graph/card surfaces on the live canary.
2. Keep `xyflow` as the single viewport source of truth: Pixi and DOM must read the same transform/fit-view state instead of running separate pan/zoom systems and reconciling them later.
3. Change the shell boundary so cards publish packets, bounds, and interaction state into the shared runtime instead of creating/destroying their own Pixi apps.
4. Land the shared runtime skeleton before more parity tuning:
   - register/update/unregister visible cards
   - one render scheduler
   - one context-loss policy
   - one pooled resource lifecycle
5. Use normalized `All Settings` with `promptSectionDefault` as the first migration canary; acceptance for that slice is that the section stays on the Pixi path without `dom-context-lost`.
6. After the shared runtime keeps the canary stable, resume Gate 1 and Gate 2 work: text/layout parity, zoom-time stability, interaction-state parity, and then perf on the stabilized baseline.
7. Continue side-by-side CDP verification after each visual-stability change, but keep support work subordinate to the renderer path itself: once the surface is normalized and reachable, move the next slice back into production renderer work.
8. Gate 3 remains the final acceptance bar: after Gate 1 and Gate 2 are solid, chase macOS Chrome `100%` canary `1:1` parity against `main`, including the relevant hover/active interaction states.
9. If the shared-runtime direction still cannot clear the staged gates, revisit the retained-scene ownership boundary again rather than layering more per-card heuristics onto the current model.
