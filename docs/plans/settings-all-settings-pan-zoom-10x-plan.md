# Settings All-Settings Pan/Zoom 10x Frontend Plan

## Goal
- Deliver a fundamental frontend rendering redesign that improves pan/zoom performance by at least 10x on large projects.
- Primary target scenario: Settings project, `All Settings` view.
- Scope is frontend-only.

## Investigation Summary (2026-03-02)
- Runtime scenario: `http://127.0.0.1:3003/settings` on `All Settings`.
- Observed scale on this one view:
  - 42 top-level sections.
  - ~9,715 total DOM nodes.
  - ~8,486 descendants under section cards.
  - ~6,980 descendants visible at fit-view.
  - Largest single section (`sectionSizingPolicy`) has ~1,852 descendants.
- Repeatable interaction benchmark (synthetic wheel pan/zoom at fit-view):
  - Baseline: pan ~48.6 FPS, zoom ~41.0 FPS.
  - Grid off: no meaningful improvement.
  - Flatten section chrome/handles: no meaningful improvement.
  - Hide section interior content during interaction: pan ~129.1 FPS, zoom ~127.1 FPS.
- Trace captured: `perf/artifacts/settings-all-settings-pan-zoom-trace-2026-03-02.json.gz`.
  - `Layerize` occurs every interaction frame (~160 events, p50 ~18.5ms), indicating compositor/layer pressure from transforming very large interactive DOM.

## No-Hitch Constraint (Follow-Up Measurement)
- We explicitly measured interaction-start latency for mode switching:
  - Baseline first-frame delay after first wheel event: ~7ms.
  - Toggle heavy shell mode at interaction start (`visibility` changes over section subtree): ~71ms first-frame delay.
  - Toggle a lightweight class on all section roots at interaction start: ~56ms first-frame delay.
  - Toggle only a single pre-mounted overlay element opacity: ~6ms (near baseline).
- Conclusion:
  - Any gesture-start switch that invalidates styles/layout across large subtree/classes can cause visible hitching.
  - The plan must enforce: no broad class/selector mode flips at gesture start.

## Simpler Global Toggle Investigation
- We also profiled simpler global CSS toggles on the same page.
- Icon footprint:
  - `svg` + CSS icon nodes are ~549 of ~9,719 nodes (~5.6%).
- Relative impact (directional, noisy but repeatable trend):
  - Global icon disable (`svg`/CSS icons hidden): small improvement only.
  - Global transition/animation disable: better improvement for non-pan interactions (section selection churn and filter typing).
  - Global shadow/filter removal: minor improvement.
- Conclusion:
  - Disabling icons alone is not a primary lever.
  - A temporary global `reduced-motion/perf` mode (disable transitions/animations + optional icon suppression) is a valid short-term mitigation, but not a 10x path.

## Root Cause
- Pan/zoom currently transforms the full interactive section DOM each frame (`Viewport.tsx`), including heavy text/input trees.
- Top-level node rendering is not viewport-windowed (`NodeRenderer.tsx` maps all node ids).
- Heavy param trees render full recursive DOM (`GroupContainer.tsx`, `GetParamSwitch.tsx`, `ParamSwitch.tsx`, `ParamContainer.tsx`) with no row virtualization.
- Most low-zoom content is unreadable but still painted and composited.
- Dominant bottleneck is display/compositing cost of rich section content, not React rerender churn and not grid/shadow micro-effects.

## 10x Strategy
- Replace "always render full interactive DOM" with a multi-resolution canvas rendering pipeline:
  - Interaction mode: render lightweight section visuals while panning/zooming.
  - Zoom LOD mode: render detail proportional to zoom level.
  - Viewport windowing: only fully render nearby sections.
  - Param virtualization: only render visible rows in heavy parameter sections.

## Workstreams

### 1) Interaction Render Mode (Immediate Win)
- Add `isViewportInteracting` state in the React Flow store.
- Toggle it from `ZoomPane` start/end handlers with a short idle debounce.
- While interacting, each section switches to a lightweight representation:
  - Keep bounds, title, selection outline.
  - Drop deep param/input/body subtree from render output.
  - Disable handles, hover chrome, and non-critical overlays.
- Restore full interactive subtree after interaction settles.
- Why first: measured `~41-49 FPS -> ~127-129 FPS` by hiding interior content confirms this path is the largest lever.
- Hitch guardrail:
  - Do not perform broad class flips affecting large subtrees at gesture start.
  - Any interaction-mode switch must use a compositor-cheap primitive (single-element opacity/transform, or precomputed state with deferred hydration after idle).

### 2) Zoom-Level LOD Rendering
- Introduce deterministic zoom tiers from source-of-truth viewport zoom:
  - `low` (for example `<0.35`): shell-only sections.
  - `mid` (for example `0.35-0.7`): header + compact summary rows only.
  - `full` (`>=0.7`): current full interactive UI.
- Active/hovered/focused section can be promoted to `full` even when zoomed out.
- Ensure keyboard focus or edit intent automatically promotes target section.
- Hitch guardrail:
  - Do not change LOD tiers while wheel/pinch stream is active.
  - Apply tier transitions only in post-interaction settle windows.

### 3) Top-Level Viewport Windowing
- Add geometry-driven node culling in `NodeRenderer`:
  - Full render only for nodes intersecting viewport plus overscan.
  - Offscreen nodes render as ultra-light placeholders preserving position/size.
- Use deterministic bounds from node position + measured dimensions + current transform.
- Keep minimap and fit-view correctness by retaining geometry metadata for all nodes.

### 4) Param Tree Virtualization
- Replace full recursive row rendering in parameter UIs with a flattened visible-row model.
- Virtualize pinned and unpinned parameter lists with variable row heights.
- Keep behavior parity for:
  - selection,
  - drag-and-drop reorder,
  - nested param expansion,
  - search/filter,
  - keyboard navigation.
- This removes the largest per-section DOM sources (for example `sectionSizingPolicy`).

### 5) Overlay and Layer Architecture Cleanup
- Move highly dynamic overlays (handles/menus/context affordances) to dedicated overlay layers instead of duplicating inside each heavy section subtree.
- In low/interaction modes, remove non-essential visual effects that increase layer churn.
- Keep visual fidelity in full mode; prioritize low compositing cost in motion modes.

### 6) Performance Guardrails and Rollout
- Add Playwright perf scenario for Settings `All Settings`:
  - scripted pan and zoom sequence,
  - rAF-based FPS sampling,
  - DOM-node-budget assertions by render mode.
- Add unit coverage for:
  - LOD tier selector,
  - viewport culling logic,
  - active-section promotion logic.
- Gate rollout with a frontend feature flag and ship incrementally:
  - interaction mode,
  - then zoom LOD,
  - then viewport culling,
  - then param virtualization.

## Execution Phases

### Phase 0: Baseline and Instrumentation
- Land benchmark harness for repeatable pan/zoom measurements.
- Record baseline metrics for current `All Settings` scenario.
- Add interaction-start hitch metric (first-frame delay after initial wheel/pinch event).

### Phase 0.5: Short-Term Mitigation (Optional)
- Introduce a global `performance mode` flag:
  - disable transitions/animations globally;
  - optionally hide non-essential icons.
- Keep this static (set at load or explicit user toggle), not switched per gesture.
- Use as immediate mitigation while structural refactor lands.

### Phase 1: Interaction Mode
- Implement motion-mode section shells.
- Validate no interaction regressions after gesture end.
- Target: immediate 2x-3x gain in this scenario.

### Phase 2: Zoom LOD + Viewport Windowing
- Add tiered rendering and geometry culling.
- Validate selection/edit behavior parity.
- Target: major DOM reduction in zoomed-out views.

### Phase 3: Param Virtualization
- Virtualize heavy param sections.
- Preserve DnD/filter/search semantics.
- Target: eliminate large static DOM costs even when zoomed in.

### Phase 4: Hardening and Rollout
- Expand Playwright perf coverage to other large projects.
- Tune thresholds and remove feature flag when stable.

## Success Criteria
- On Settings `All Settings` fit-view scenario:
  - Pan p50 FPS >= 100.
  - Zoom p50 FPS >= 90.
  - Gesture-start first-frame delay remains near baseline (no >20ms start hitch introduced by interaction-mode switching).
  - No long-frame clusters during sustained interaction on test hardware.
- During pan/zoom, rendered interactive DOM descendants in the viewport reduced by at least 90% versus baseline.
- No behavioral regressions in selection, dragging, parameter editing, context menus, and keyboard workflows.

## Explicit Non-Plan Items
- No backend schema/state changes.
- No micro-optimization detours (grid/shadow tweaks alone are not the path to 10x).
- No fallback heuristics for culling/LOD; decisions must use deterministic viewport and node geometry.
