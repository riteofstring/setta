# Canvas Engine Optimization Plan

## Goal
Eliminate pan/zoom hitching caused by moving large live DOM subtrees, including cold-start hitching on weaker machines, by replacing the ReactFlow DOM-first canvas path with a retained canvas/GPU scene plus sparse DOM islands for interactive content.

## Decision
Treat this as an architecture project, not as another incremental compositor/CSS tweak on the existing ReactFlow node renderer.

The current shell-promotion work is still useful as a stopgap, but it does not provide a robust enough foundation for the hard requirement that pan/zoom must not randomly hitch.

## Scope
- In scope:
  - project canvas rendering and interaction path
  - pan/zoom, selection, drag, resize, edge connect/reconnect
  - DOM virtualization policy for section content
  - large-canvas perf guardrails, profiling, and parity verification
- Out of scope:
  - non-canvas routes and panes
  - backend schema changes unless required for robust geometry/runtime metadata

## Current State
- The existing ReactFlow path still moves live DOM for every visible section.
- Always-on shell promotion reduces one source of gesture-start hitching, but it does not stop browser paint/raster cost from surfacing unpredictably.
- `frontend-performance-5` already proved the right direction:
  - retained canvas/GPU renderer
  - incremental scene adapter
  - spatial indexes and hit testing
  - sparse DOM islands with retention policy
- That branch is not suitable as the long-lived working branch because it is heavily stale relative to current `main`.

## Target Architecture
1. Retained scene
- The moving workspace becomes a retained scene rendered through canvas/WebGL/WebGPU.
- Section shells, edges, selection overlays, handles, and interaction affordances render from project state rather than from live section DOM.

2. DOM islands
- Full section DOM remains available only where interactivity is needed.
- Mounted islands must be determined by explicit policy:
  - viewport interaction window
  - active/selected state
  - editing/focus/drag/resize/connect state
  - bounded short retention to avoid remount thrash

3. Engine-owned interaction
- Pan/zoom, hit testing, marquee selection, drag, resize, and edge gestures move out of the current ReactFlow DOM path and into the engine host.

4. General project coverage
- Final architecture must work for all section types and arbitrary nesting.
- No Settings-only or top-level-only final solution is acceptable.

## Milestones
1. Baseline and guardrails
- Keep the current Settings pan/zoom perf report as a stopgap baseline.
- Add or port large-canvas automated guardrails that validate structural performance properties rather than flaky timing thresholds.

2. Canvas-engine foundation
- Port self-contained `frontend-performance-5` engine modules onto current `main`.
- Start with modules that do not require wide UI integration:
  - scene types
  - spatial index
  - DOM-island mount policy
  - focused tests

3. Experimental host path behind a flag
- Introduce a `CanvasEngineHost` path behind a local-storage/runtime flag on current `main`.
- Keep the legacy ReactFlow path available during migration only.

4. Top-level scene parity
- Render top-level section shells and edges through the engine path.
- Mount visible/active top-level DOM islands.
- Preserve core interaction parity: pan/zoom, click selection, drag, resize, edge interaction.

5. Nested/general section parity
- Extend the scene model beyond top-level shells where needed.
- Preserve nested/group/list-root layout and containment semantics.
- Keep the final solution general across mixed project types.

6. Cutover
- Make the engine path the production canvas path only after parity, profiling, and guardrails are in place.
- Delete legacy ReactFlow canvas runtime from the active path once cutover is proven.

## Execution Strategy
- Build on top of current `main` / current worktree branch, not on top of `frontend-performance-5`.
- Port small, testable slices from `frontend-performance-5` in commit-sized increments.
- Keep commits frequent and narrow:
  - docs / planning
  - stopgap ReactFlow improvements
  - self-contained engine modules
  - host scaffolding
  - parity slices

## Verification Requirements
- For every meaningful slice:
  - Vitest coverage for new engine modules
  - Playwright coverage for user-visible canvas behavior when integration exists
  - CDP visual verification for UI-affecting changes
  - append-only perf notes under `perf/reports/frontend/`

## Acceptance Criteria
- No unacceptable pan/zoom hitching on the weak-machine scenarios that motivated this project.
- Large-canvas DOM footprint is substantially reduced on the engine path.
- Canvas interactions preserve current behavior.
- The final solution applies across arbitrary project structures, section mixes, and nested section layouts.

## Immediate Next Steps
1. Commit the existing always-on shell-promotion stopgap as a separate baseline-preserving change.
2. Port the self-contained `canvas-engine` foundation modules from `frontend-performance-5`.
3. Wire those modules into tests on current `main`.
4. Port `CanvasEngineHost` behind a flag once the foundational modules are in place.
