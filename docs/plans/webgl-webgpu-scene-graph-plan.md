# WebGPU/WebGL Scene-Graph Renderer Plan

## Goal
- Preserve current UX and visual fidelity while improving rendering performance.
- Optimize for all projects, including user-created projects with very large section/param counts.
- Treat `Settings -> All Settings` as a stress benchmark, not as a product-specific rollout target.
- Reach a state where `auto` can be default-on for supported environments across projects.

## Why This Path
- Current bottlenecks are DOM layout/paint/compositing costs during pan/zoom and large-state updates.
- WebGPU/WebGL can move motion-time rendering to a camera transform pipeline with lower per-frame DOM pressure.
- This gives the highest ceiling for large graphs while keeping deterministic rendering behavior.

## Clarification: WebGPU/WebGL vs WASM
- WebGPU/WebGL: rendering APIs for drawing.
- WASM: optional compute acceleration for CPU-side scene extraction/indexing.
- WASM alone does not solve DOM/compositing bottlenecks.

## Benchmark Strategy
- Canonical stress benchmark: `Settings -> All Settings` (high section/param density).
- Additional required benchmarks:
  - synthetic large projects (section/param count sweeps),
  - plugin-heavy and mixed-section projects,
  - representative user-like project structures.
- Benchmarks are for measurement only; rollout policy must not hardcode project names/classes as a product behavior.

## Platform Strategy
- Backend priority in `auto`:
  - `webgpu` when capability checks pass,
  - `webgl` fallback,
  - `dom` fallback when GPU paths are unavailable or parity gates are not met.
- Explicit backend override remains available for debugging:
  - `auto`, `webgpu`, `webgl`, `dom`.

## Scope
- In scope:
  - pan/zoom and viewport motion path,
  - section/edge rendering performance,
  - interaction parity (selection, hover, focus, edit entry),
  - deterministic fallback/compatibility gating,
  - automated perf + parity verification.
- Out of scope:
  - backend API changes,
  - behavior changes that alter user workflows,
  - "ship fast" shortcuts that reduce visual or interaction fidelity.

## Product Constraints
- No visible content loss in normal editing workflows (no empty-rectangle regressions).
- No extra click required to edit.
- No keyboard/navigation/focus regressions.
- No project-specific assumptions in the shipped default behavior.

## Hard Requirements
- UX parity is mandatory while optimizing performance.
- Renderer switching must not introduce start/stop hitch spikes.
- Geometry/render decisions must remain deterministic from source-of-truth state.
- Any non-parity section type must remain DOM-rendered until parity is proven.
- Default-on is allowed only after benchmark-suite performance targets and parity gates both pass.

## High-Level Architecture

### 1) Renderer Abstraction Layer
- `RendererBackend` interface:
  - `init(canvas, capabilities)`
  - `render(snapshot, camera, frameState)`
  - `updateResources(diff)`
  - `dispose()`
- Implementations:
  - `WebGpuBackend`
  - `WebGlBackend`
  - `DomBackendAdapter`

### 2) Scene Snapshot + Compatibility Matrix
- Build immutable snapshots from store state:
  - section geometry/style metadata,
  - edge geometry,
  - text/icon metadata required for parity,
  - interaction metadata (selected/hovered/active/focused).
- Build deterministic diffs for incremental resource updates.
- Maintain explicit section-type compatibility states:
  - `parity_ready`: scene-renderable with UX parity,
  - `dom_required`: must stay DOM-rendered.

### 3) Camera-Driven Motion Path
- Pan/zoom updates camera matrices, not large DOM transforms.
- Keep per-frame work bounded and predictable.
- Avoid broad mount/unmount/class-flip churn during active gestures.

### 4) DOM/Scene Partitioning
- Use scene rendering only for `parity_ready` content.
- Keep `dom_required` content in DOM at all times.
- If hybrid promotion is used, transitions must preserve:
  - editor state,
  - focus/selection continuity,
  - first-click edit behavior.

### 5) Text/Icon Fidelity
- Use atlas-based text rendering where needed.
- Keep icon/state semantics parity with DOM.
- Never hide semantically important signals just to reduce render cost.

### 6) Worker/WASM (Optional)
- Move extraction/diff/culling to Worker when main-thread cost is non-trivial.
- Consider WASM for geometry packing/spatial indexing where it measurably helps.
- Keep robust non-WASM path as baseline.

## No-Hitch Interaction Rules
- Do not rebuild large GPU resources in first interaction frame.
- Keep renderer mounted; avoid mode toggles at gesture start.
- No mass DOM mount/unmount during active wheel/pinch streams.
- Apply hydration/demotion only under idle-time budgets.
- Use hysteresis to prevent residency thrash.

## Incremental Phases

### Phase 0: Baseline + Capability Probe
- Add capability detector and runtime labels.
- Capture baseline perf/parity across full benchmark suite.

### Phase 1: Substrate + Negotiation
- Ship backend abstraction and deterministic backend negotiation.
- Keep DOM as truth path while instrumentation stabilizes.

### Phase 2: Camera Path Optimization
- Route pan/zoom through optimized scene path.
- Validate parity for controls and interaction timing.

### Phase 3: Section-Type Parity Expansion
- Expand `parity_ready` section types incrementally.
- Require tests before enablement per type.
- Keep unsupported types `dom_required`.

### Phase 4: Snapshot Diff + Worker Pipeline
- Add worker snapshot/diff pipeline when justified by profiling.
- Add bounded caches, eviction policies, and instrumentation.

### Phase 5: Cross-Project Hardening
- Validate performance/parity on all benchmark categories.
- Fix parity/perf outliers before default-on decision.

### Phase 6: Default-On Readiness
- Verify all acceptance gates.
- Confirm deterministic fallback behavior in unsupported environments.

### Phase 7: Global Default-On (`auto`)
- Enable `auto` by default for supported environments across projects.
- Keep explicit kill switch and debug overrides.

## Flags and Rollout Controls
- `setta.sceneGraphRenderer.enabled` = `0|1`
- `setta.sceneGraphRenderer.backend` = `auto|webgpu|webgl|dom`
- `setta.sceneGraphRenderer.domIslandRadius` = integer
- `setta.sceneGraphRenderer.debugOverlay` = `0|1`
- `setta.sceneGraphRenderer.enabled` is the top-priority kill switch.
- Project-id/project-name allowlists are temporary migration levers only; they are not the target shipping policy.

## Acceptance Targets
- Measured across benchmark suite (including `Settings -> All Settings` stress benchmark and non-settings large-project benchmarks):
  - Pan p50 FPS `>= 110`
  - Zoom p50 FPS `>= 100`
  - Start hitch p95 `<= 12ms`
  - Stop/settle hitch p95 `<= 14ms`
- UX parity gates:
  - no extra click-to-edit,
  - no content disappearance,
  - no keyboard/focus/selection regressions.
- Resource gates:
  - stable GPU memory/buffer budgets,
  - no unbounded atlas/cache growth.

## Testing and Verification
- Vitest:
  - backend negotiation,
  - snapshot/diff correctness,
  - compatibility matrix behavior,
  - fallback logic.
- Playwright:
  - pan/zoom guardrails,
  - click-to-edit and keyboard parity,
  - benchmark-suite flows across project types.
- CDP:
  - before/after traces for same scripted scenarios,
  - frame-time and long-task distributions,
  - memory/buffer profiling.

## Risks and Mitigations
- Risk: performance gains achieved by reducing UX fidelity.
  - Mitigation: parity gates are release-blocking.
- Risk: optimization overfits one benchmark project.
  - Mitigation: benchmark suite must include multiple project classes.
- Risk: unsupported browser/GPU combos.
  - Mitigation: strict capability checks with deterministic DOM fallback.
- Risk: section-type parity lag.
  - Mitigation: explicit compatibility matrix with DOM fallback until ready.

## Go/No-Go Gates
- Go default-on only if benchmark-suite performance targets and UX parity targets both pass.
- Stop/reassess if:
  - uplift is below target across large-project suite,
  - hitch budgets fail consistently,
  - parity cannot be preserved without UX regression.

## Immediate Next Step
- Phase 0 benchmark hardening and threshold gating:
  - keep `Settings -> All Settings` plus non-settings large-project scenarios as the required suite,
  - use interaction-time frame metrics (not request latency) as the perf source of truth,
  - remove zoom-control fallback dependence by making wheel-zoom measurement deterministic in automation,
  - promote the suite to explicit go/no-go threshold checks for default-on readiness.
