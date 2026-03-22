# Settings Pan/Zoom Rendering Rewrite Plan

Date: 2026-03-25
Worktree: `setta.frontend-performance-11`
Current branch: `frontend-performance-11-hybrid-rendering`
Current HEAD at start: `e66075715`
Archived prior plan: `docs/plans/worktrees/setta.frontend-performance-11/settings-pan-zoom-hybrid-rendering-plan.md`
Related log: `docs/plans/worktrees/setta.frontend-performance-11/settings-pan-zoom-rendering-rewrite-log.md`

## Goal

Achieve genuinely high-performance pan and zoom on dense Setta canvases such as `settings` and `tier1Synthetic`, while keeping visual output faithful enough that users do not see the UI change shape during motion.

This plan is not satisfied by:

- removing only the old simplified fallback
- reducing hitching subjectively in short checks
- improving only `RunTask` while `Paint` stays bad

This plan is satisfied only when the authoritative benchmark shows a major drop in motion-time `Paint` cost on the dense scenes that matter.

## Reset Decision

Archive the old hybrid-rendering plan as a useful correctness checkpoint, but stop treating it as the performance path.

The benchmark evidence says:

- faithful SnapDOM image previews fixed correctness
- queueing capture work reduced some burstiness
- but every follow-up locality or warm-pool tuning pass still failed the `Paint` gate

Conclusion:

- incremental tuning of the current `live DOM + SnapDOM capture + image overlay + locality heuristics` path is unlikely to get us to the required performance envelope
- the next effort must be a rendering-system rewrite, not another threshold pass

## Executive Architecture Decision

Default assumption:

1. Keep `xyflow` as the viewport, coordinate system, drag/select shell, edge/handle integration, and authoritative node-position source.
2. Replace or bypass a large chunk of the current dense-section rendering path during overview and motion states.
3. Treat the dense section body as a separately rendered surface, not as fully live DOM that the browser has to paint while the whole canvas is moving.

Escalation rule:

- If a rendering spike shows that `xyflow` itself still forces too much DOM participation, layer coupling, or transform cost even after dense body rendering is bypassed, then the next step is not more tuning.
- The next step is to fork or replace the relevant `xyflow` rendering slice for dense scenes.

This does not mean "rewrite the whole frontend".

It means:

- keep the rest of the app
- keep current product behavior
- rewrite the dense scene rendering model

## What This Means For `xyflow`

Current recommendation:

- do not abandon `xyflow` as the first move
- do not assume `xyflow` stays untouched either

Working position:

- keep `xyflow` for camera state, transforms, drag/select, edge routing, section positions, and hit-test coordination
- replace or bypass the expensive node-body DOM rendering path for dense sections during overview and motion states

Put differently:

- not an immediate `xyflow` replacement project
- very likely an `xyflow` rendering-system replacement or bypass project

If the spike proves that `xyflow` cannot support a clean dual-renderer architecture without dragging too much DOM cost along with it, then abandoning its node-rendering path becomes part of this plan. That is escalation, not day-one scope.

## Why The Old Path Is Archived

The current retained correctness checkpoint still loses badly on the benchmark:

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

Build a dual-renderer model for dense scenes.

### Layer 1: Always-Live Interaction Shell

Keep a very light DOM shell live in or around `xyflow`:

- section frame
- header / title / selection state
- drag and resize affordances
- handles / ports / edge anchors
- active-section focus chrome

This shell must stay interactive and aligned with the camera at all times.

### Layer 2: Dense Body Surface Renderer

Dense section bodies should not be represented as fully live browser-painted DOM during overview pan/zoom.

Instead, render them through a dedicated motion-friendly surface:

- likely a parallel canvas/WebGL renderer
- possibly a bitmap-atlas / tile renderer if that proves simpler and fast enough

That renderer owns the visual body content for:

- inactive dense sections
- low-zoom states
- active pan/zoom states

### Layer 3: Local Detail DOM

Mount real body DOM only where it is actually needed:

- active section
- explicitly interactive neighborhood around the active section or pointer focus
- editing/detail zoom states where true DOM interaction is required

Strict rule:

- the live DOM budget must be bounded and intentional
- "all sections mounted but hidden differently" is not acceptable as the primary strategy anymore

## Candidate Rewrite Paths

### Path A: Parallel Overview Renderer While Keeping `xyflow` As Coordinator

This is the recommended first spike.

Model:

- `xyflow` still manages nodes, camera, edges, selection, drag, and layout positions
- dense bodies emit renderer packets instead of large DOM
- a parallel renderer draws those packets in canvas/WebGL space
- only the local detail neighborhood mounts real DOM

Why this is the default:

- highest chance of removing motion-time paint cost without rewriting the whole app
- preserves most existing interaction/state infrastructure
- clearer rollback story than full `xyflow` abandonment

### Path B: Fork / Replace `xyflow` Node Rendering For Dense Scenes

This is the default escalation if Path A still leaves too much DOM or transform coupling.

Model:

- keep the app and maybe even the store model
- but replace more of the `xyflow` node-rendering stack with a dense-scene-specific renderer

Use this if:

- `xyflow` wrappers still force too much live DOM
- camera synchronization is cheap but node rendering is not
- the dual-renderer integration seam inside current `xyflow` is too constrained

### Path C: Full Dense-Scene Renderer With `xyflow` Reduced To Legacy / Sparse Use

This is the aggressive option.

Model:

- dense scenes get a dedicated scene renderer and interaction system
- `xyflow` stays only for sparse scenes or legacy compatibility

This should not be the first move unless the spike quickly proves that Paths A and B are structurally blocked.

## Explicit Non-Goals

- no more SnapDOM locality / warm-pool / pane-threshold tuning as the main path
- no more handcrafted simplified placeholders
- no full-frontend rewrite
- no per-widget canvas conversion as the core strategy
- no assumption that every inactive dense section body can remain fully live DOM
- no `Terminal` architecture work in this plan unless it becomes unavoidable through shared renderer changes

## Success Criteria

### Product Criteria

- no visible fallback-style appearance swaps during pan or zoom
- no second-click requirement to interact with a section
- no obvious handoff glitch when a section transitions from overview-rendered to live DOM
- active editing/detail state remains faithful and immediately interactive

### Benchmark Criteria

The old plan optimized for plausibility. This plan optimizes for benchmark movement.

Minimum spike gate:

- beat the retained queued-image checkpoint on both `settings` and `tier1Synthetic`
- reduce benchmark `Paint` materially on both scenes, not just one
- reduce slow overview pan `Paint` materially on both scenes

Practical keep gate for architecture choice:

- the chosen rewrite path must show that it can move benchmark `Paint` substantially closer to untouched `main`, not just trade `Paint` for `RunTask`
- if a spike cannot show that direction clearly, discard it fast

## Workstreams

## 1. Architecture Spike And Decision Gate

Deliverables:

- a short RFC comparing:
  - Path A
  - Path B
  - Path C
- one chosen primary implementation path
- one explicit escalation rule

Tasks:

- identify the exact dense-scene seams:
  - shell DOM
  - body DOM
  - edge / handle anchors
  - active-section handoff
- decide whether canvas 2D is enough or whether WebGL is required
- define renderer packets for dense section bodies
- define how the local detail DOM neighborhood is chosen

Exit gate:

- one architecture chosen
- one benchmark hypothesis written
- one rollback/escalation condition written

## 2. Dense Body Render Packet Extraction

Goal:

- turn dense section bodies into renderer-friendly data instead of relying on mounted DOM as the source of truth for visuals during motion

Tasks:

- define a compact render packet schema for Tier 1 dense sections
- separate packet generation from DOM rendering
- ensure packets can be generated from the same source-of-truth data as the live DOM version

Important requirement:

- packet generation must be deterministic and typed
- no heuristic keyword-matching shortcuts

## 3. Parallel Renderer Spike

Goal:

- prove that a dedicated overview/motion renderer can cut motion-time `Paint`

Tasks:

- render dense section bodies in a separate surface aligned to the `xyflow` camera
- keep shell DOM live
- keep only the active/local detail DOM mounted
- measure:
  - benchmark `Paint`
  - slow overview pan `Paint`
  - handoff latency into interactive DOM

Exit gate:

- the spike must beat the retained queued-image checkpoint on both dense scenes
- if it does not, stop and escalate to Path B instead of tuning thresholds

## 4. Interaction Handoff

Goal:

- make renderer-to-DOM transitions invisible to the user

Tasks:

- define the local live-DOM neighborhood policy
- mount real DOM ahead of interaction, not after visible delay
- ensure pointer, selection, and keyboard ownership swap cleanly
- keep edge handles and shell alignment correct during transitions

## 5. Dense Scene Integration

Goal:

- make the rewrite production-capable for Tier 1 dense sections first

Tasks:

- wire Tier 1 sections to the new renderer path
- keep sparse sections on current DOM rendering unless profiling says otherwise
- measure `settings` and `tier1Synthetic` continuously during rollout

## 6. `xyflow` Escalation Gate

Trigger this only if the parallel-renderer spike still leaves too much `Paint` or handoff complexity.

Escalation tasks:

- fork or replace the dense-scene node-rendering path inside `frontend/src/forks/xyflow/core`
- reduce or remove `xyflow` node wrapper DOM for dense scenes
- preserve camera and coordinate contracts only if they are still an advantage

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

1. Lock the architecture choice process:
   - Path A spike first
   - Path B as explicit escalation
   - Path C only if A and B both fail quickly
2. Write the renderer spike RFC:
   - render packet shape
   - surface choice
   - detail neighborhood rules
3. Implement the first dense-scene parallel renderer spike against `settings` and `tier1Synthetic`.
4. Reject the spike immediately if it does not beat the retained queued-image checkpoint on benchmark `Paint` for both scenes.
