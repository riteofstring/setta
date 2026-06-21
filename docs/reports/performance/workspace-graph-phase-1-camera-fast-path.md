# Workspace Graph Phase 1 — Camera Fast-Path Invariant

- **Date:** June 21, 2026
- **Plan:** `docs/plans/workspace_graph_retained_scene_camera_fast_path_plan.md` (Phase 1)
- **Branch:** `setta-3-workflow-kernel-conceptual-nodes-2`
- **Baseline:** `docs/reports/performance/workspace-graph-phase-0-baseline.md`
- **Kind:** append-only performance/evidence report (per `AGENTS.md` UI Rules)

Phase 1 makes pan/zoom a transform-only renderer path. The core felt regression
recorded in the Phase 0 baseline — **node labels disappear while the camera is
moving** — is removed. Labels now ride the camera as a bounded, measured
transform tier; base edges already rode the viewport transform and are now
guarded against regression. The wheel input diagnostics now follow the hot-path
contract: no wheel-handler camera snapshots, no per-event timer clear/set churn,
and no per-event User Timing marks. The renderer self-audits every moving frame
and the performance gate enforces the contract as hard checks.

This report separates what is **deterministically established** (code-level
invariants verifiable in CI without a device), what was captured by the
automated **reference runner** on this Mac, and what remains human/device-side
sign-off (physical trackpad feel and true compositor presentation timing).

## Summary verdict

| Area | Phase 0 baseline | After Phase 1 |
| --- | --- | --- |
| Node labels during camera motion | **Hidden** (`labelLayer.visible = false`) | **Visible**; repositioned via the transform tier each moving frame |
| Label work during camera motion | Full layer hide + deferred resync | Bounded reposition of *visible* labels only (`label-transform-tier` bucket) |
| Base edges during camera motion | Not hidden (only not redrawn) | Not hidden; guarded by the fast-path invariant + audit |
| Camera fast-path invariant | None in renderer code | `cameraFastPathViolationCount` self-audit + per-frame `cameraWorkAuditSamples` |
| Label-visibility gate check | `expected-fail` (would block once satisfied) | **Promoted to hard** (`no-labels-hidden-during-camera-motion`) |
| Fast-path violations gate check | None | **New hard check** (`no-camera-fast-path-violations`) |
| React commits / graph replacement / semantic reads / layout writes from camera | None (hard gates) | None (hard gates, unchanged) |
| Wheel diagnostic input hot path | Two `cameraState()` reads, nested samples, per-event timer churn, per-event User Timing marks | Scalar sequence-addressed ring-buffer samples, zero wheel-handler camera reads, deadline-based burst settlement |
| Start-of-gesture latency (ms p95) | Attribution categories named; numbers pending Mac | Reference-hard run passed for first camera transform (simple 0.4ms, normal 0.5ms, dense 0.8ms); first-Pixi render remains proxy/report-only |
| Transform-tier CPU budget (ms) | n/a | Measured (`label-transform-tier` bucket); normal worst 0.1ms, dense worst 0.2ms |

## What changed in the renderer

- **`pixi-renderer-camera-sync.js`** — the moving-camera frame no longer hides
  labels. It runs a `runCameraTransformTier()` step that (a) keeps the label and
  base-edge layers visible and (b) repositions only the retained visible labels.
  A camera fast-path invariant (`ensureCameraCarriedLayersVisible`) records a
  violation and self-heals if anything ever hides labels/edges or rebuilds graph
  content during motion. A bounded per-frame `cameraWorkAuditSamples` ring buffer
  (cap 64) records the work categories of each moving/settle frame.
- **`pixi-renderer-labels.js`** — new `syncVisibleLabelTransforms()` performs the
  transform tier: a direct numeric reposition of currently-visible labels,
  measured in its own `label-transform-tier` bucket, with **no** visibility-window
  query, declutter, font, or content recomputation (those stay on the settle path).
- Camera motion still performs **zero** scene-graph rebuilds, React commits,
  graph replacements, semantic working-set reads, or layout writes — verified by
  the existing hard gates and re-confirmed by the new per-frame audit.
- **`pixi-renderer-wheel-handler.js`** — the non-passive wheel handler no longer
  imports or calls `cameraState(viewport)` for diagnostics. Wheel input records
  only scalar event/canvas/delta fields, and wheel-burst settlement now uses a
  gesture deadline with one active timer instead of clearing and recreating a
  timer for every wheel event.
- **`pixi-renderer-wheel-responsiveness.js`** — input samples are stored in a
  fixed-size sequence-addressed ring buffer. The hot path updates a sample by
  sequence slot and records scalar timing fields only; per-event
  `performance.mark()` calls were removed.

### Why the transform tier (and not yet a world-space label layer)

`labelLayer` is a child of `app.stage` (screen space), so the camera transform
does not carry labels automatically; they are positioned via `viewport.toScreen`
and held at constant on-screen size. Phase 1 keeps that architecture and pins
labels each moving frame as the sanctioned transform tier. **Phase 2** moves
labels into a camera-carried coordinate space so even the per-frame reposition
disappears; doing that now would overreach the Phase 1/2 boundary.

## Deterministically established now (no device required)

Enforced by tests that run in ordinary CI:

1. **Labels stay visible during camera motion.** `cameraMovingLabelHiddenFrameCount`
   never advances; `cameraMovingLabelTransformFrameCount` advances once per moving
   sync frame and equals `cameraMovingSyncFrameCount`.
   - Unit: `pixi-renderer-camera-sync.test.js`,
     `pixi-renderer-labels.test.js`.
   - Production path: `workflow-graph-pan-zoom-snapshot-assertions.mjs`
     (`assertCameraSyncCounters`).
2. **No full label sync per moving frame.** `cameraMovingLabelSyncedFrameCount`
   stays 0 (`no-full-graph-label-sync-per-pan-wheel-event`, hard).
3. **The label-visibility contract is a hard gate.** The Phase 0 `expected-fail`
   check `no-labels-hidden-during-camera-motion` is promoted to a hard check; the
   gate now fails if any moving frame hides labels.
   - `workflow-graph-phase0-performance-guardrails.mjs` + `.test.mjs`.
4. **Fast-path violations are a hard gate.** New `no-camera-fast-path-violations`
   check requires `cameraFastPathViolationCount === 0`.
5. **Camera motion causes no React commits, graph replacements, semantic
   working-set reads, or layout/presentation writes** — unchanged hard gates
   (`no-camera-caused-graph-react-commits`, `no-camera-caused-full-graph-replacement`,
   `no-semantic-working-set-reads-during-camera-interaction`,
   `no-camera-caused-workspace-presentation-writes`).
6. **Wheel diagnostics obey the hot-path contract.** The wheel handler does not
   read camera state for diagnostics, does not clear/restart a timer per wheel
   event, and the tracker stores scalar samples in a bounded sequence-addressed
   ring.
   - Unit: `pixi-renderer-wheel-handler.test.js`,
     `pixi-renderer-wheel-responsiveness.test.js`.

### Focused verification run

- `pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/`
  — 43 files, 195 tests pass.
- `node --test desktop/tests/electron/workflow-graph-phase0-performance-guardrails.test.mjs
  desktop/tests/electron/workflow-graph-pan-zoom-performance-report.test.mjs
  desktop/tests/electron/workflow-graph-recording-incident-report.test.mjs` — pass.
- `pnpm -C desktop exec tsc --noEmit` — clean.

### Hot-path addendum verification

- `pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/pixi-renderer-wheel-handler.test.js src/renderer/src/features/workspace-graph/pixi-renderer-wheel-responsiveness.test.js`
  — 2 files, 3 tests pass.
- `pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/pixi-renderer-camera-sync.test.js src/renderer/src/features/workspace-graph/pixi-renderer-labels.test.js src/renderer/src/features/workspace-graph/pixi-renderer-wheel-handler.test.js src/renderer/src/features/workspace-graph/pixi-renderer-wheel-responsiveness.test.js`
  — 4 files, 12 tests pass.
- `node --test desktop/tests/electron/workflow-graph-phase0-performance-guardrails.test.mjs desktop/tests/electron/workflow-graph-pan-zoom-performance-report.test.mjs desktop/tests/electron/workflow-graph-recording-incident-report.test.mjs`
  — 10 tests pass across the guardrail, performance-report, and incident-report
  parsers.
- `./scripts/test_workspace_graph_phase8.sh --focused-only`
  — 13 renderer/parser files pass (71 Vitest tests + 3 Node parser tests).
- `pnpm -C desktop exec tsc --noEmit --pretty false` — clean.
- `pnpm -C desktop build` — production Electron build succeeds.
- `./scripts/test_workspace_graph_phase8.sh --electron-only --skip-build`
  — production Electron workspace-graph Phase 8 tier passes all 16 manifest
  workflows, including `workflow-graph-pan-zoom-phase3`,
  `workflow-graph-pan-zoom-baseline`, `workflow-graph-pan-zoom-small-trackpad`,
  `workflow-graph-pan-zoom-small-active`, `workflow-graph-pan-zoom-active`, and
  `workflow-graph-pan-zoom-runtime-burst`.
- `./scripts/format.sh` — clean.
- `./check_quality.sh --all` — clean, including Go checks, desktop lint,
  typecheck, Vitest, production build, dead-code checks, and required Electron
  workflows.

## Reference-runner evidence

`SETTA_WORKFLOW_GRAPH_PHASE0_REFERENCE_RUNNER=1 node desktop/tests/electron/run-workflows.mjs --tier workspace-graph-phase8 --skip-build --keep-artifacts`
passed on June 21, 2026 on this machine (`Apple M1 Pro`, macOS Darwin
`25.5.0`, Electron `41.7.0`, Chrome `146.0.7680.216`).

- Full-tier manifest passed all 16 workflows, including
  `workflow-graph-pan-zoom-phase3`,
  `workflow-graph-pan-zoom-baseline`,
  `workflow-graph-pan-zoom-small-trackpad`,
  `workflow-graph-pan-zoom-small-active`,
  `workflow-graph-pan-zoom-active`, and
  `workflow-graph-pan-zoom-runtime-burst`.
- Phase 3 artifact:
  `.recordings/workflow-graph-pan-zoom-phase3/20260621T184642Z`.
- The artifact status is `passed` across 18 recording-on/off scenarios.
- All hard scenario checks passed; hard failures count is 0.
- `no-labels-hidden-during-camera-motion` and
  `no-camera-fast-path-violations` passed in every scenario.
- `no-long-task-over-100ms` passed as a hard check for simple, normal, and dense
  runs. Stress/scaling long-task rows remain report-only scale sweeps.

The earlier failed reference attempt at
`.recordings/workflow-graph-pan-zoom-phase3/20260621T180154Z` was a
measurement-scope issue: the old hard long-task check counted raw trace/startup
long tasks globally. The harness now persists completed camera-input windows,
uses half-open input/long-task overlap intervals, and gates on
camera-overlapping long tasks while still retaining raw observed long-task
metrics for debugging.

### Reference timing rows

| Scenario | Recording | p95 handler → camera | p95 first Pixi proxy | `label-transform-tier` count / total / worst | Max camera-overlap long task | Raw max observed long task |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| simple | on | 0.4ms | 15.1ms | 21 / 0.4ms / 0.1ms | 0ms | 99ms |
| normal | on | 0.5ms | 16.4ms | 22 / 0.1ms / 0.1ms | 0ms | 148ms |
| dense | on | 0.8ms | 33.3ms | 22 / 0.2ms / 0.2ms | 80ms | 282ms |

Recording/debug overhead for the Phase 0 budget uses first-camera-transform p95
(`wheelLatency.p95EventToCameraUpdateMs`). The same artifact's on/off matrix is
within the 2ms budget:

| Scenario | Recording on | Recording off | Delta |
| --- | ---: | ---: | ---: |
| simple | 0.4ms | 0.4ms | 0.0ms |
| normal | 0.5ms | 0.6ms | -0.1ms |
| dense | 0.8ms | 0.6ms | +0.2ms |

The `input-to-presented-frame-budget-blocked` check remains report-only because
no compositor presentation trace source is wired. First-Pixi render is useful
proxy evidence only; it is not a true "pixels reached the screen" timestamp.

## Still requiring human/device sign-off

The automated reference runner can capture the timing evidence above. It cannot
provide physical MacBook trackpad sign-off that pan/zoom feels immediate with
labels and edges continuously visible. That remains a human/device-side check.
