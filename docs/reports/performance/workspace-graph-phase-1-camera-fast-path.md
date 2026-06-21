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
guarded against regression. The renderer self-audits every moving frame and the
performance gate enforces the contract as hard checks.

This report separates what is **deterministically established now** (code-level
invariants verifiable in CI without a device) from what remains
**machine-dependent** and must be captured on the reference MacBook (the
millisecond snappiness budgets, unchanged from Phase 0).

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
| Start-of-gesture latency (ms p95) | Attribution categories named; numbers pending Mac | Unchanged; pending reference Mac |
| Transform-tier CPU budget (ms) | n/a | Measured (`label-transform-tier` bucket); ms budget pending reference Mac |

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

### Focused verification run

- `pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/`
  — 43 files, 195 tests pass.
- `node --test desktop/tests/electron/workflow-graph-phase0-performance-guardrails.test.mjs
  desktop/tests/electron/workflow-graph-pan-zoom-performance-report.test.mjs
  desktop/tests/electron/workflow-graph-recording-incident-report.test.mjs` — pass.
- `pnpm -C desktop exec tsc --noEmit` — clean.

## Machine-dependent, still pending (reference MacBook)

These are unchanged from Phase 0 and are **not** measurable in CI/sandbox. They
must be captured on the reference Mac via
`run-workflows.mjs --tier workspace-graph-phase8` with
`SETTA_WORKFLOW_GRAPH_PHASE0_REFERENCE_RUNNER=1`:

- start-of-gesture p95s: idle-wheel/pinch → camera transform (<16ms) and →
  first Pixi render proxy (<32ms);
- the recording-on vs recording-off 2ms p95 overhead comparison;
- the `label-transform-tier` per-frame ms budget on a normal and a dense graph
  (the transform tier is bounded to visible labels and measured; the absolute ms
  ceiling is a device-side number, not a CI invariant);
- physical MacBook trackpad sign-off that pan/zoom feels immediate with labels
  and edges continuously visible (no flashing).

CI proves the deterministic fast-path invariants above. Millisecond snappiness
and trackpad feel are verified on the target Mac, not inferred from CI.
