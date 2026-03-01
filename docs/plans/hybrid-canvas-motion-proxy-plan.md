# Hybrid Canvas Motion Proxy Plan

## Goal
- Evaluate and, if validated, implement a hybrid canvas motion-proxy pipeline that dramatically improves pan/zoom smoothness on large projects while preserving normal DOM editing behavior when interaction settles.

## Scope
- Frontend only.
- Primary benchmark scenario: Settings project, `All Settings` view.
- Motion optimization only (pan/zoom). Not a full canvas rewrite of editable UI.
- Includes an explicit complementary track for non-pan interaction slowness.

## Why This Is Being Investigated
- Current motion performance is constrained by transforming a very large interactive DOM.
- Runtime proof-of-concept measurements showed:
  - Baseline around `40 pan FPS / 35-36 zoom FPS`.
  - Canvas overlay only (DOM still visible) gave almost no improvement.
  - Canvas proxy with DOM hidden during motion gave around `119 pan FPS / 94-104 zoom FPS`.
- This indicates motion-time rendering cost is the main bottleneck, and proxy rendering can unlock large gains.

## Key Risks Found
- Start hitch risk:
  - Baseline first-frame delay after initial wheel event: around `8-9ms`.
  - Proxy activation + DOM hide: around `14-16ms` (higher, still manageable if bounded).
- Stop hitch risk:
  - Immediate DOM restore from hidden state caused around `20-40ms` spikes.
  - Deferred restore reduced immediate stop hitch but still needs careful sequencing.
- Memory risk:
  - Single giant proxy canvas can be expensive (`~56MB` at DPR1, `~224MB` at DPR2 in this scenario).

## Decision
- This approach is worth a structured spike.
- It should proceed only as a motion-only proxy path with strict hitch and memory guardrails.
- If guardrails fail, stop and pivot back to DOM-only motion lock + deferred hydration/windowing.
- Before full proxy rollout, run a low-risk non-pan optimization tranche and re-measure to confirm residual motion gap.

## Broader Technology Options (Before Full Implementation)
- We should keep the option space explicit and evidence-driven before committing to a full path.
- Practical assessment:
  - Hybrid canvas motion proxy: high pan/zoom upside, medium-high complexity.
  - DOM culling/virtualization/subscription work: medium motion upside, high non-pan upside, medium complexity.
  - Worker/WASM compute acceleration: high non-pan upside, limited direct pan/zoom upside.
  - Full scene-graph renderer (WebGL/WebGPU): highest upside, highest rewrite risk and complexity.
  - CSS-only broad disables: low-to-medium temporary mitigation only.
- Interpretation:
  - WASM is a compute accelerator for filtering/indexing/derivations.
  - WASM is not, by itself, a fix for DOM paint/compositing bottlenecks during pan/zoom.

## Exploration Sequence
- Run short gated spikes in this order:
  1. Non-pan compute path (`Worker` + optional `WASM`) for per-keystroke/filter hotspots.
  2. Hybrid proxy path with no-hitch lifecycle guarantees.
  3. OffscreenCanvas/worker-backed proxy generation if main-thread proxy prep is still costly.
- After each spike, compare against the same benchmark gates and continue only if gains are material.

## Non-Goals
- No replacement of regular editable DOM UI.
- No backend changes.
- No heuristic-only fallback logic for critical behavior. Use deterministic geometry/state sources.
- No active-section hydration mode that introduces extra click-to-interact steps.

## Architecture Direction

### 1) Motion Proxy Layer
- Add a dedicated proxy canvas layer inside the React Flow viewport.
- During motion, show proxy layer and hide expensive DOM node layers.
- During idle, hide proxy and use normal DOM interaction.

### 2) Proxy Content Model
- Initial version: lightweight section shells (title + structural blocks), not full visual fidelity.
- Reason:
  - Shell proxies already produced large gains in the runtime spike.
  - Avoid complexity and memory cost of high-fidelity full snapshots initially.

### 3) Deterministic Geometry Source
- Build proxies from node internals (position and measured dimensions) from source-of-truth store state.
- Avoid brittle DOM querying as primary runtime source.

### 4) Lifecycle State Machine
- `idle`: DOM active, proxy hidden.
- `armed`: proxy prewarmed and ready.
- `active_motion`: proxy visible, expensive DOM layer hidden.
- `settling`: input quiet; restore DOM in staged sequence.
- `idle` again after restore completes.

### 5) No-Hitch Switch Rules
- Gesture start:
  - Only compositor-cheap operations (single layer opacity/transform changes).
  - No broad subtree class flips or mass style recalculation at start.
- Gesture stop:
  - Defer restore to a settle window (for example 100-150ms no input).
  - Restore in staged frames to avoid one-frame spikes.

### 6) Memory Control
- Do not use one giant unbounded backing canvas in production path.
- Use per-section or tiled proxies with viewport+overscan limits.
- Clamp motion proxy DPR (default 1.0) with strict pixel budget and LRU eviction.

## Complementary Non-Pan Track (Run First)
- These changes target non-pan interaction slowness and may also reduce motion load.

### A) Per-Keystroke Work Reduction (High Priority)
- Pre-index parameter/search text paths.
- Avoid rebuilding large filter/search structures on each keystroke.
- Use incremental filtering where deterministic.

### B) State Subscription Partitioning (High Priority)
- Narrow store subscriptions to section-local/state-slice granularity.
- Reduce fanout so local edits do not trigger broad section updates.

### C) Lazy Overlay Mounting (High Priority)
- Keep lightweight overlay roots stable.
- Mount heavy tooltip/menu/overlay content only on demand.
- Prewarm hotspots when possible to avoid first-open spikes.

### D) Observer/Listener Budget (Medium Priority)
- Deduplicate observers and reduce duplicated measurement work.
- Pause only non-critical observers during pan/zoom.
- Preserve core UX observers in idle/edit states.

### E) Scoped Param Virtualization (Selective Priority)
- Apply only to heavy, scroll-bounded param areas where row windowing is effective.
- Do not force virtualization in layouts where full list is expected to remain visible.

### Explicitly Deprioritized for UX
- Active-section-only hydration that requires additional clicks before interaction.

## Phased Plan

## Phase 0: Instrumentation + Baseline
- Add measurement hooks for:
  - first-frame motion start latency,
  - stop/restore latency,
  - sustained pan/zoom FPS,
  - non-pan interaction metrics (typing/filtering and selection churn),
  - proxy memory budget usage.
- Add baseline performance report entry under `perf/reports/frontend/` (append-only).

## Phase 0.5: Low-Risk Shared Optimizations
- Implement and land Complementary Non-Pan Track items A-C (and D where safe).
- Re-measure both motion and non-pan baselines after this tranche.
- Reconfirm if pan/zoom remains far below target; then proceed with proxy phases.

### Phase 0.5 Status Update (2026-03-03)
- Baseline harness is landed and recorded:
  - `perf/reports/frontend/2026-03-02_settings-all-settings-performance-baseline.md`
- Item A trialed: per-keystroke param-filter match cache (`GetParamSwitch` path).
- Result: **not kept**. Repeated runs showed only small/noisy typing change relative to baseline.
- Decision history retained in:
  - `perf/reports/frontend/2026-03-02_settings-all-settings-param-filter-match-cache.md`
- Item A trialed (second pass): shared param-filter visibility context (compute once per list, reuse across nested rows).
- Result: **not kept**. End-to-end Playwright/CDP measurements did not show a reliable improvement.
- Decision history retained in:
  - `perf/reports/frontend/2026-03-03_settings-all-settings-shared-param-filter-visibility-context.md`
- Item B trialed (first pass): params-path state subscription partitioning.
- Result: **not kept**. In this pass, Playwright typing median and CDP scripted interaction both regressed.
- Decision history retained in:
  - `perf/reports/frontend/2026-03-02_settings-all-settings-state-subscription-partitioning.md`
- Item C trialed: lazy overlay mounting in `FloatingBox` hover handlers.
- Result: **not kept**. Controlled CDP A/B runs showed effectively unchanged frame-toggle behavior and only a small synthetic hover-loop gain.
- Decision history retained in:
  - `perf/reports/frontend/2026-03-03_settings-all-settings-lazy-overlay-mounting.md`
- Item D trialed: observer/listener budget reductions (`useIsScrollable` observer narrowing/coalescing variants).
- Result: **not kept**. Structural observer-option cleanup did not produce reliable Playwright typing improvement versus baseline/same-day control.
- Decision history retained in:
  - `perf/reports/frontend/2026-03-03_settings-all-settings-observer-listener-budget.md`
- Next Phase 0.5 focus:
  - Optional: trial Item E scoped param virtualization only in heavy scroll-bounded param regions where full-list visibility is not required.
  - Primary: proceed to Phase 1 minimal production-grade hybrid motion-proxy spike, since completed Item A-D passes did not yield a keepable win.

## Phase 1: Minimal Production-Grade Spike
- Implement proxy manager and state machine with shell proxies.
- Prewarm proxies during idle.
- Activate proxy mode only when prewarm is ready.
- Keep feature flag scoped to target project/view for early verification.

### Phase 1 Status Update (2026-03-03)
- A scoped Phase 1 spike was implemented and benchmarked:
  - feature-flagged (`settings` + `All Settings`) prewarmed canvas shell proxy,
  - explicit `idle/armed/active/settling` state machine,
  - deterministic geometry from node internals.
- Result: **not kept** in this pass.
  - Playwright A/B runs did not show sustained pan/zoom improvement and start-hitch worsened.
  - A more aggressive `display:none` DOM-hide variant caused interaction-path instability and was also rejected.
- Decision history retained in:
  - `perf/reports/frontend/2026-03-03_settings-all-settings-phase1-hybrid-motion-proxy-spike.md`
- Next focus:
  - Rework Phase 1 switch strategy before next spike (reduce start-switch overhead and avoid behavior instability while still materially cutting compositor load).

### Phase 1 Status Update (2026-03-03, Pass 2)
- A second scoped Phase 1 implementation pass was benchmarked with deterministic A/B control:
  - same `settings` + `All Settings` scoped feature flag,
  - pre-mounted canvas shell layer,
  - explicit motion lifecycle transitions wired into `ZoomPane`.
- Result: **not kept** in this pass.
  - Proxy-enabled medians were not materially better than control in the same code pass:
    - pan `115.75` vs control `119.45`,
    - zoom `97.55` vs control `96.75`,
    - start-hitch p95 `3.8ms` vs control `3.65ms`,
    - typing `149.30` vs control `147.26`.
- Key observation:
  - Both A/B modes in this pass were substantially faster than the older baseline range, indicating the structural viewport-layer changes likely drove most of the gain rather than the proxy toggle itself.
- Decision history retained in:
  - `perf/reports/frontend/2026-03-03_settings-all-settings-phase1-hybrid-motion-proxy-spike-pass2.md`
- Next focus:
  - Keep hybrid proxy path paused until a redesign shows clear incremental A/B value.
  - Isolate the structural layer/compositing improvement as a simpler standalone candidate and benchmark it separately from hybrid canvas logic.

## Phase 2: Stop-Hitch Mitigation
- Implement staged restore sequencing in settle phase.
- Compare:
  - immediate restore,
  - deferred restore,
  - staged restore (multi-frame).
- Keep only variant that passes hitch thresholds.

## Phase 3: Memory + Coverage Hardening
- Replace any large monolithic proxy allocation with tiled or section-scoped buffers.
- Add bounded cache with eviction policy.
- Validate behavior on different DPRs and viewport sizes.

## Phase 4: Integrate with Existing Performance Work
- Combine with viewport windowing and param virtualization roadmap.
- Ensure proxy path coexists cleanly with future culling/LOD post-settle logic.

## Go/No-Go Gates
- Proceed with hybrid proxy implementation only if both are true after Phase 0.5:
  - Non-pan tranche landed and remeasured.
  - Pan/zoom still materially below target.
- When proxy is enabled, proceed only if all are true on `All Settings` benchmark:
  - Sustained pan FPS improves by at least `2x`.
  - Sustained zoom FPS improves by at least `1.8x`.
  - Start-latency p95 stays below `20ms`.
  - Stop/restore-latency p95 stays below `24ms`.
  - Proxy memory stays within defined budget at target DPR.
  - No visible behavior regressions after settling.
- If any gate fails after Phase 2 hardening, stop this path and prioritize DOM motion-lock refactor.

## Testing Plan
- Vitest:
  - proxy state-machine transitions (`idle/armed/active/settling`),
  - deterministic proxy geometry mapping from node internals,
  - restore sequencing behavior.
- Playwright:
  - automated pan/zoom scenario for Settings `All Settings`,
  - start/stop hitch checks from frame timing markers,
  - sustained FPS guardrail checks (with robust thresholds).
- CDP:
  - before/after traces for same scenario,
  - document long tasks and frame-time distribution changes.

## Rollout
- Ship behind feature flag:
  - default off,
  - enabled for targeted stress scenarios first.
- Expand scope only after gates are met and tests are stable.
