# Settings Graph Substrate Normal-Zoom Baseline

Date: 2026-04-05
Area: frontend
Branch/Commit: `pixijs-graph` @ `64ab35490`
Related plan: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-plan.md`

## Goal

Establish the first normal-zoom pan/zoom baseline for the active graph-substrate rewrite canary so later slices can prove the `All Settings` canary is not obviously slower than the legacy `main` path on the canonical `rotaryParamCodeObjDefault` lane.

## Code Paths

- `frontend/tests/e2e/settings/graphSubstrateParityProbe.ts`
- `frontend/tests/e2e/settings/settings-view-modes-main-reference.spec.ts`

## Scenario

- Entry point:
  - worktree canary: `http://127.0.0.1:3076/settings`
  - read-only legacy reference: `http://127.0.0.1:3087/settings`
- Project/view: `settings`, `All Settings`
- Named target section: `rotaryParamCodeObjDefault`
- Browser + OS: Playwright Chromium headless, macOS
- Notes:
  - compare panes normalized to `SETTINGS_GRAPH_COMPARE_PANE_STATE`
  - both surfaces clear viewport state and run the shared targeted `fitGraphViewportToSection(...)` path before measurement
  - the probe uses the same deterministic synthetic wheel sequence on both sides:
    - plain-wheel pan `(+160, +120)` x `6`
    - plain-wheel pan `(-160, -120)` x `6`
    - modified-wheel zoom in `(0, -180)` x `4`
    - modified-wheel zoom out `(0, +180)` x `4`
  - each wheel step waits two animation frames before the next step so the probe samples the live render cost rather than only measuring state writes

## Before (baseline)

- Measurement method:
  - shared Playwright probe `settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary`
  - page-side `requestAnimationFrame` frame deltas + `PerformanceObserver` long-task capture
  - DOM counts collected from the live graph root and target section at the end of the sequence
  - paired Chrome DevTools MCP trace on the worktree canary using the same normalized `All Settings` target lane
- Key metrics:
  - legacy `main`
    - average frame duration: `16.65ms`
    - max frame duration: `33.5ms`
    - frame samples: `44`
    - long tasks: `0`
    - root DOM nodes: `8907`
    - target section DOM nodes: `132`
  - worktree canary
    - average frame duration: `17.00ms`
    - max frame duration: `50.1ms`
    - frame samples: `44`
    - long tasks: `1` (`60ms` total / max)
    - root DOM nodes: `9515`
    - target section DOM nodes: `132`
- Observations:
  - the canary currently stays close to legacy on this normal-zoom lane even with a slightly larger graph-root DOM footprint (`+608` nodes)
  - the average frame delta between canary and legacy is only about `0.35ms`, which is small enough that the canary is not obviously worse on this path
  - the canary did show one isolated `60ms` long task that did not appear in the legacy run; that is the first concrete hotspot to inspect with DevTools tracing rather than opening another parity-only lane
  - the paired DevTools trace saved for the worktree canary reported `INP 90ms`, with the cost split mostly into `presentation delay 65ms`, `processing 23ms`, and `input delay 2ms`
  - Chrome did not report a clear scripting or network hotspot (`Estimated savings: none`), which points the next investigation toward presentation/layout/paint timing on the live surface rather than backend or fetch noise

## After

No product optimization is included in this slice. This report is the baseline that future geometry/perf slices should append against using the same named lane, pane normalization, and wheel sequence.

## Conclusion

- What improved:
  - the rewrite now has a deterministic automated perf probe on the same normalized `All Settings` lane already used for broad parity regression coverage
  - the first baseline says the canary is roughly at legacy frame cost on this lane instead of being obviously worse
- What regressed:
  - the canary still produced one `60ms` long task during the measured sequence, so the next performance slice should use DevTools tracing to identify whether the spike is layout, paint, or JS work
- Follow-ups:
  - inspect the `presentation delay` portion of the matching DevTools trace on the worktree canary before adding another probe-only slice
  - keep this probe as regression coverage and append a new `After` section once the next renderer/perf hotspot lands

## Raw Artifacts (local-only)

- DevTools trace: `perf/artifacts/frontend/settings-graph-substrate/2026-04-05-rotary-normal-zoom-worktree-trace.json`

## Automated Perf Tests

- Playwright spec(s):
  - `frontend/tests/e2e/settings/settings-view-modes-main-reference.spec.ts`
- Budgets/assertions added:
  - both legacy and canary runs must collect at least `20` frame samples on the normalized lane
  - both runs must stay under the coarse guardrails of `40ms` average frame duration and `120ms` max frame duration
