# Settings All Settings Lazy Overlay Mounting

Date: 2026-03-03
Area: frontend
Branch/Commit: setta.frontend-performance-3 @ 012fbc05b (with local changes during experiment)
Experimented code paths (reverted):
- `frontend/src/components/Utils/FloatingBox.tsx`

Implementation status: **Not kept** (experiment reverted; report retained for decision history).

## Goal

Reduce non-pan interaction cost from hover-driven overlay state churn in `All Settings`, focusing on tooltip/floating-box handler overhead while tooltip mode is disabled.

## Change Summary (Experiment)

- Buffered hover content while floating-box mode is disabled instead of immediately writing tooltip state on every hover enter/leave.
- Added equality checks to skip redundant floating-box `setState` calls.
- On enable, restored pending hover content once and bounded index state.

## Measurement Setup

- Entry point: `/settings` -> `All Settings`
- Browser profiling: CDP (`chrome-devtools-mcp`) on `http://127.0.0.1:3003/settings`
- Synthetic hover target: `[data-testid="overview-tab-overview"]`
- Scripted metrics:
  - Frame toggle metric: 180 hover enter/leave toggles with one `requestAnimationFrame` wait per sample.
  - Tight loop metric: 5,000 hover enter/leave toggles in a synchronous loop.
- Trace artifacts:
  - `perf/artifacts/frontend/2026-03-02_phase05c_lazy-overlay-mounting_head-control.trace.json`
  - `perf/artifacts/frontend/2026-03-02_phase05c_lazy-overlay-mounting_patch-control.trace.json`
  - Earlier exploratory pair also captured:
    - `perf/artifacts/frontend/2026-03-02_phase05c_lazy-overlay-mounting_before.trace.json`
    - `perf/artifacts/frontend/2026-03-02_phase05c_lazy-overlay-mounting_after.trace.json`

## Controlled A/B Results

- `HEAD` (no patch):
  - `frameAvgMs = 8.27`
  - `frameP95Ms = 9.30`
  - `tightTotalMs = 47.60` (`tightPerToggleMs = 0.0095`)
- Patch applied:
  - `frameAvgMs = 8.27`
  - `frameP95Ms = 9.30`
  - `tightTotalMs = 45.80` (`tightPerToggleMs = 0.0092`)

Computed delta:
- Frame metric: effectively unchanged.
- Tight loop: `-1.80ms` over 5,000 toggles (`~3.8%` faster in this synthetic loop).

## Conclusion

- This lazy-overlay pass was **not kept**.
- Reason: measured improvement was too small and too synthetic to justify additional state-path complexity.
- Decision:
  - Revert experiment code.
  - Keep measurement artifacts and this report for decision history.
  - Continue Phase 0.5 with other non-pan candidates that can yield larger user-visible gains.

## Verification

- CDP profile traces and scripted interaction metrics captured (paths above).
- No additional automated test run was required because production code changes were reverted.
