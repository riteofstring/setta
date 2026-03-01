# WebGPU/WebGL Scene-Graph Renderer Plan

## Goal
- Deliver a fundamental frontend rendering architecture that keeps pan/zoom smooth on very large projects without interaction hitching.
- Primary target: `Settings -> All Settings`.
- Scope is frontend-only.

## Why This Path
- Current bottleneck is browser display/compositing cost from moving very large interactive DOM trees.
- WebGPU/WebGL moves motion-time rendering to a graphics pipeline where pan/zoom is a camera transform, not DOM layout/paint churn.
- This is the highest-ceiling path for user-created large projects, not just one benchmark project.

## Clarification: WebGPU/WebGL vs WASM
- WebGPU/WebGL: rendering APIs (how pixels are drawn).
- WASM: compute/runtime acceleration (how CPU-side logic runs).
- WASM is optional in this plan for scene build/culling/indexing acceleration.
- WASM alone is not sufficient to solve DOM/compositing bottlenecks.

## Platform Strategy
- Backend priority:
  - `WebGPU` when supported and stable.
  - `WebGL2` fallback when WebGPU is unavailable.
  - existing DOM renderer fallback when neither path is available or when unsupported content requires it.
- Explicit runtime backend selection:
  - `auto` (default)
  - `webgpu`
  - `webgl`
  - `dom`

## Scope
- In scope:
  - Pan/zoom, section shells, edges, selection visuals, minimap, hover highlights.
  - DOM editing islands for active/nearby sections.
  - Incremental rollout behind localStorage flags.
- Out of scope for first release:
  - Full replacement of all DOM editors/widgets.
  - Backend changes.
  - Broad UX changes requiring extra clicks to edit.

## Hard Requirements
- No hitching on interaction start/stop from renderer switching.
- No extra click required to edit after pan/zoom settles.
- Deterministic geometry and render decisions from source-of-truth state (no keyword/heuristic fallbacks).
- Preserve behavior parity for selection, keyboard navigation, and editing entry points.

## High-Level Architecture

### 1) Renderer Abstraction Layer
- Introduce `RendererBackend` interface:
  - `init(canvas, capabilities)`
  - `render(snapshot, camera, frameState)`
  - `updateResources(diff)`
  - `dispose()`
- Implementations:
  - `WebGpuBackend`
  - `WebGlBackend`
  - `DomBackendAdapter` (existing DOM path)

### 2) Scene Snapshot Model
- Build immutable render snapshots from current store state:
  - section geometry (x/y/w/h, z, style tokens),
  - edge geometry,
  - text/layout metadata needed for shell rendering,
  - interaction metadata (selected/hovered/active).
- Build deterministic diffs between snapshots to update GPU resources incrementally.

### 3) Camera-Driven Motion
- Pan/zoom becomes camera matrix updates in renderer.
- During active pan/zoom:
  - no section mount/unmount churn,
  - no broad class flips on heavy DOM subtree,
  - minimal per-frame CPU work (matrix + frustum pass + draw calls).

### 4) DOM Interaction Islands
- Keep DOM only where interactivity is required:
  - active section,
  - focused section,
  - small nearby ring (configurable radius/overscan).
- Prewarm nearby DOM islands to avoid click-to-edit delays.
- Map pointer and keyboard intents from scene objects to DOM island promotion.

### 5) Text and Icon Rendering
- Render section shell text with atlas-based strategy:
  - initial: cached bitmap/SDF glyph atlas.
  - stable IDs for labels to avoid atlas churn.
- Render simple iconography in GPU path or hide non-essential icons in shell mode.
- Preserve full icon fidelity in DOM islands.

### 6) Optional Worker/WASM Acceleration
- Move scene extraction/diff/culling to Worker when needed.
- Consider WASM for:
  - geometry packing,
  - broadphase spatial indexing,
  - text shaping prep.
- Keep robust non-WASM path as baseline.

## No-Hitch Interaction Rules
- Never rebuild large GPU resources in the first interaction frame.
- Keep renderer always mounted once enabled; do not toggle renderer modes at gesture start.
- No DOM mass mount/unmount during active wheel/pinch stream.
- Idle-time hydration/dehydration only, with per-frame work budgets.
- Enforce hysteresis for island residency to prevent edge thrash while panning.

## Incremental Rollout Phases

### Phase 0: Baseline and Capability Probe
- Add capability detector:
  - WebGPU availability and required features.
  - WebGL2 availability.
  - software/fallback markers.
- Extend perf harness with renderer/backend labels.
- Record baseline metrics and traces in `perf/reports/frontend/`.

### Phase 1: Rendering Substrate Skeleton
- Add renderer abstraction and backend negotiation.
- Render static section shells + edges from snapshot (read-only visuals).
- Keep DOM renderer as source of interaction truth.
- Validate visual parity at fit-view and during camera moves.

### Phase 2: Camera and Interaction Parity
- Route pan/zoom camera updates through scene renderer.
- Keep selection/hover visual parity in scene layer.
- Maintain existing controls (fit view, zoom in/out/reset).
- Gate: sustained pan/zoom uplift with start/stop hitch within budget.

### Phase 3: DOM Island Editing
- Introduce island manager:
  - active/focused section always DOM-mounted,
  - nearby ring prewarmed,
  - off-ring sections scene-only.
- Ensure direct click on visible section enters edit without extra click.
- Gate: no post-pan edit delay regression.

### Phase 4: Snapshot Diff + Worker Pipeline
- Move snapshot build/diff to Worker if main thread cost is non-trivial.
- Add bounded resource caches and eviction policy.
- Add deterministic instrumentation for update costs and buffer pressure.

### Phase 5: Section Coverage Expansion
- Prioritize heavy/high-impact section types first:
  - callable-style param-heavy sections,
  - common settings sections,
  - common edge/handle visuals.
- Keep unsupported section types as DOM islands until covered.
- Add explicit compatibility matrix by section type.

### Phase 6: Controlled Default-On
- Keep kill-switch flags.
- Enable `auto` backend on selected heavy surfaces first.
- Expand by view/project class after guardrails pass.

## Flags and Rollout Controls
- `setta.sceneGraphRenderer.enabled` = `0|1`
- `setta.sceneGraphRenderer.backend` = `auto|webgpu|webgl|dom`
- `setta.sceneGraphRenderer.domIslandRadius` = integer ring radius
- `setta.sceneGraphRenderer.debugOverlay` = `0|1`
- `setta.sceneGraphRenderer.rolloutProjectConfigIds` = strict JSON string array of `projectConfigId` canary targets
- `setta.sceneGraphRenderer.rolloutProjectConfigNames` = strict JSON string array of `projectConfigName` canary targets
- explicit `setta.sceneGraphRenderer.enabled` storage override remains top-priority kill switch over rollout defaults

## Acceptance Targets
- On `Settings -> All Settings` benchmark:
  - Pan p50 FPS: `>= 110`
  - Zoom p50 FPS: `>= 100`
  - Start hitch p95: `<= 12ms`
  - Stop/settle hitch p95: `<= 14ms`
  - Post-pan click-to-edit readiness: no measurable extra click or delay beyond current baseline
- Resource targets:
  - Stable GPU memory/buffer budgets under target DPR settings.
  - No unbounded atlas/cache growth.

## Testing and Verification
- Vitest:
  - capability negotiation,
  - snapshot diff correctness,
  - island promotion/demotion state machine,
  - backend fallback logic.
- Playwright:
  - pan/zoom guardrails by backend,
  - click-to-edit and keyboard workflow parity,
  - heavy project scenarios (settings + plugin large DOM).
- CDP:
  - before/after traces for same scripted scenarios,
  - frame-time distribution and long-task checks,
  - memory snapshots for renderer buffers/caches.

## Risks and Mitigations
- Risk: text clarity/fidelity mismatch in scene layer.
  - Mitigation: shell text quality thresholds and rapid DOM island fallback for focused editing.
- Risk: unsupported browser/GPU feature combinations.
  - Mitigation: strict backend negotiation + DOM fallback.
- Risk: interaction parity regressions.
  - Mitigation: staged rollout, per-feature guardrails, section-type compatibility matrix.
- Risk: plugin/iframe/special sections not renderer-friendly.
  - Mitigation: keep as DOM islands until explicit support lands.

## Go/No-Go Gates
- Go to Phase 3 only if Phase 2 shows material uplift and hitch budgets pass.
- Stop and reassess if:
  - pan/zoom uplift is <`2x` on primary benchmark after Phase 2,
  - hitch budgets fail consistently,
  - edit workflow parity cannot be preserved without UX regression.

## Immediate Next Step
- Implement Phase 0:
  - capability probe module,
  - renderer backend flag plumbing,
  - baseline perf harness extension with backend labels,
  - append first report in `perf/reports/frontend/`.
