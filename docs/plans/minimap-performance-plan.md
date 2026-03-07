# Minimap Performance Improvement Plan

This plan complements `docs/plans/pan-zoom-performance-plan.md` and narrows the next optimization pass to the live minimap path.

## Goal
Reduce the pan/zoom overhead from the live minimap so `showMinimap=true` is close to `showMinimap=false` on dense canvases, while preserving current minimap UX:
- visible minimap in project pages
- click-to-center behavior
- correct viewport mask
- correct node geometry after layout changes

## Scope
- In scope:
  - `frontend/src/components/Pages/Project/ResponsiveMiniMap.tsx`
  - `frontend/src/forks/xyflow/minimap/MiniMap.tsx`
  - `frontend/src/forks/xyflow/minimap/MiniMapNodes.tsx`
  - `frontend/src/forks/xyflow/minimap/MiniMapNode.tsx`
  - supporting selectors/caches for minimap node geometry and viewport state
  - tests and profiling artifacts for the minimap path
- Out of scope:
  - grid/background performance work
  - broad canvas/section DOM refactors outside the minimap path
  - generic pan/zoom work that is unrelated to the minimap

## Baseline (2026-03-06)
- Scenario:
  - `/settings` -> `All Settings`
  - `42` visible settings nodes
  - viewport `1600x1000`
  - no CPU throttling, no network throttling
  - one warm-up run, then three measured CDP runs per configuration
- Interaction:
  - `fit view`
  - repeated wheel-pan
  - `Ctrl`+wheel zoom in
  - more pan
  - `Ctrl`+wheel zoom out
  - more pan

| Config | Median scenario ms | Avg frame gap ms | P95 frame gap ms | Frames >33 ms | Est. dropped frames | Trace `RunTask` total ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| With minimap + grid | 2125.8 | 20.76 | 34.2 | 14 | 14 | 5874.60 |
| No minimap + grid | 1975.0 | 19.36 | 33.3 | 5 | 4 | 5387.26 |
| No minimap + no grid | 1960.9 | 19.16 | 33.4 | 5 | 5 | 5312.99 |

## What The Baseline Suggests
- Disabling the minimap is the meaningful win.
- Relative to `no minimap + grid`, the live minimap adds about:
  - `7.1%` scenario time
  - `8.3%` traced main-thread `RunTask` time
  - `64.3%` more `>33ms` frames
- Removing the grid after the minimap is already off helps paint/layout, but only moves total interaction time by about `0.7%`.
- The traces still show large `Layerize` cost overall, so the minimap is not the only problem, but it is a real and measurable tax on top of the existing pan/zoom ceiling.

## Current Implementation Observations
- `ResponsiveMiniMap.tsx` always mounts the live `MiniMap` when `showMinimap` is enabled.
- `MiniMap.tsx` subscribes to both:
  - live viewport state (`viewBB`)
  - live node geometry (`useNodeInternals(getNodes, shallow)`)
- `MiniMapNodesReactive` rebuilds the minimap node list from the full node internals store.
- `MiniMapNodes` renders one React `<rect>` per node and also depends on `projectConfig.activeIds` for selected styling.
- `MiniMap` updates an SVG `viewBox` and a mask path while the viewport is moving.
- `ResponsiveMiniMap.tsx` uses root-level click-to-center, but there is no current app call site using minimap node click behavior.
- `ProjectConfigPreview.tsx` already uses `MinimapSvg` with caller-supplied node data, which is a useful shape for a snapshot-based minimap node layer.

## Working Hypothesis
The current minimap pays too much per-frame work during navigation because it keeps the node layer fully live while the viewport is moving:
- node geometry and selected-state subscriptions are broader than needed for pure pan/zoom
- each node is a separate SVG element
- the live node layer and the live viewport mask are coupled into one rendering path

The first pass should therefore reduce minimap work during pan/zoom before introducing larger renderer changes.

## Recommended Direction
Start with a lower-risk split:
1. keep the viewport mask live
2. make the minimap node layer mostly static between geometry changes
3. only move to a batched SVG or canvas node renderer if the split is not enough

This sequence should recover most of the minimap-specific regression without forcing a large rewrite up front.

## Implementation Plan
### 1. Baseline and guardrails
- Add an append-only entry under `perf/` for the 2026-03-06 baseline and future before/after reruns.
- Capture the exact measurement recipe in the perf report so later runs use the same scenario.
- Add a renderer-agnostic test hook for the minimap surface before changing internals, because existing tests currently count `.react-flow__minimap-node`.

### 2. Split static node rendering from live viewport updates
- Refactor `MiniMap.tsx` so the viewport mask/box subscribes to transform updates independently from the node layer.
- Derive a minimap node snapshot from node geometry changes only:
  - node position
  - node width/height
  - node fill/stroke inputs that materially change the minimap
- Memoize node bounds separately from `viewBB` so pure pan/zoom does not force full node-bound recomputation.
- Avoid recomputing selected styling for every minimap node while the user is actively panning/zooming.

### 3. Reduce node-layer DOM cost
- Prototype a cheaper renderer for minimap nodes behind the same public minimap API:
  - first option: batched SVG path(s) instead of one `<rect>` per node
  - second option: canvas node layer plus SVG mask overlay
- Keep `MinimapSvg` reusable so `ProjectConfigPreview.tsx` does not need a separate rendering path.
- Remove node-level click handlers from the main app minimap path if they are still unused after verification.

### 4. Add an interaction-time low-cost mode
- While `paneDragging`, `isPanScrolling`, or pinch zoom is active:
  - freeze or defer minimap node redraws
  - keep only the viewport mask moving
  - suppress selected-state restyles
  - throttle minimap refresh to one `requestAnimationFrame` path if needed
- Restore exact minimap fidelity when navigation ends.

### 5. Re-profile and decide whether a larger change is still required
- Re-run the same All Settings scenario with:
  - minimap + grid
  - no minimap + grid
  - no minimap + no grid
- If the minimap path is still materially behind `no minimap + grid`, move to the stronger renderer change:
  - canvas node layer
  - or explicit downsampling/capped fidelity for very large node counts

## Testing Plan
### Vitest
- Add focused minimap tests for the new split helpers:
  - node snapshot does not change for pure transform updates
  - viewport mask updates when transform changes
  - node snapshot refreshes when node geometry changes
  - interaction-time low-cost mode restores full state on interaction end
- Keep `MiniMap.test.ts` and related minimap coverage updated if the rendering primitive changes.

### Playwright
- Update `frontend/tests/e2e/settings/settings-view-modes.spec.ts` so it does not rely on one SVG rect per minimap node.
- Keep `frontend/tests/e2e/overview/layout/view-mode-tabs-bottom-bar.spec.ts` coverage for minimap visibility and placement.
- Add a click-to-center E2E assertion if none exists yet.

### CDP / performance verification
- Re-run the same CDP scenario used for the baseline.
- Record before/after numbers under `perf/`.
- Use the same hardware/worktree session when possible to keep comparisons meaningful.

## Acceptance Criteria
- In the same All Settings scenario, `minimap + grid` should be within `3-5%` of the `no minimap + grid` baseline for median scenario duration.
- `minimap + grid` should no longer show a large spike in `>33ms` frames relative to `no minimap + grid`.
- Click-to-center still works.
- Viewport mask remains correct while panning and zooming.
- Layout changes, node resize, and section move operations still update the minimap correctly.
- Existing minimap surfaces remain visually correct in CDP.

## Risks
- A canvas or batched SVG renderer can break tests that currently assume one DOM node per minimap node.
- Over-aggressive freezing can leave the minimap stale after layout mutations.
- Selected-node styling may need to become eventually consistent during active navigation rather than strictly live every frame.

## Open Questions
- Do we need per-node click behavior in the shipped minimap, or is root click-to-center sufficient?
- Is exact selected-node highlighting during active pan/zoom actually required?
- If a canvas renderer is needed, do we want to preserve the generic `MiniMap` API for future consumers, or optimize only the project-page minimap path first?
