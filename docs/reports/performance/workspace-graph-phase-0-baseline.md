# Workspace Graph Phase 0 Baseline & Evidence Reset

- **Date:** June 21, 2026
- **Plan:** `docs/plans/workspace_graph_retained_scene_camera_fast_path_plan.md` (Phase 0)
- **Branch:** `setta-3-workflow-kernel-conceptual-nodes-2`
- **Kind:** append-only performance/evidence baseline (per `AGENTS.md` UI Rules)

This is the Phase 0 baseline. Its job is to **stop calling known-bad pan/zoom
UX a pass**, attribute start-of-gesture latency to named categories, and record
the current contract violations as expected-red tests before the Phase 1–2
renderer refactor. It separates what is **deterministically established now**
(code-level invariants, verifiable in CI without a device) from what is
**machine-dependent** and must be captured on the reference MacBook.

## Summary verdict

The normal graph does **not** have a camera-only fast path yet. Camera motion
still hides node labels, and until this change the pan/zoom harness *required*
that hiding. The cross-owner drag bug is fixed in Phase 0. The remaining felt
goals (snappy pan/zoom, no flashing) are Phase 1–2 and are now encoded as
contracts that fail when violated.

| Area | Baseline (current HEAD) | Status after Phase 0 |
| --- | --- | --- |
| Node labels during camera motion | **Hidden** (`labelLayer.visible = false`) | Contract added (expected-red), hack-mandate removed |
| Base edges during camera motion | Not hidden (only not redrawn) | No regression; documented |
| React commits caused by camera motion | None during `moving` | Guarded (unit + hard gate), passing |
| Full graph replacement caused by camera | None | Hard gate, passing |
| Semantic working-set reads during camera | None | Hard gate, passing |
| Cross-owner drag (workflow drag moves semantic) | **Broken** | **Fixed** + deterministic regression |
| Start-of-gesture latency (ms) | Not attributed | Attribution categories named; numbers pending reference Mac |
| Recording/debug overhead (2ms p95 budget) | Not measured | Method + budget documented; measurement pending reference Mac |

## Deterministically established now (no device required)

These are code-level facts, captured from current HEAD and enforced by tests
that run in ordinary CI.

### 1. Camera motion hides node labels (the core regression)

`desktop/src/renderer/src/features/workspace-graph/pixi-renderer-camera-sync.js`
`syncLabelsForCameraMotion("moving")` sets `labelLayer.visible = false` and
advances `cameraMovingLabelHiddenFrameCount` / `cameraMovingLabelDeferredFrameCount`
for every moving frame. This violates the Non-Negotiable UX Contract ("Node
labels must not disappear because the camera is moving").

Evidence-reset changes:

- **Hack-mandate removed.** `workflow-graph-pan-zoom-snapshot-assertions.mjs`
  previously *threw when labels were not hidden*
  (`cameraMovingLabelHiddenFrameCount <= 0`). That mandate is removed; the
  legitimate "no per-frame label re-sync during motion" invariant is kept.
- **Contract added (expected-red).**
  - Unit: `pixi-renderer-camera-sync.test.js` →
    `test.fails("camera fast-path contract: node labels stay visible …")`. It is
    recorded as an expected failure now and turns red (forcing promotion) the
    moment Phase 1 keeps labels visible.
  - Harness gate: `workflow-graph-phase0-performance-guardrails.mjs` →
    `no-labels-hidden-during-camera-motion` (severity `expected-fail`). It reads
    `renderDeltas.cameraMovingLabelHiddenFrameCount`; while non-zero it is a
    recorded expected failure, and when it reaches zero it reports
    `unexpected-pass` and **blocks the gate** until promoted to a hard check
    (see `phase0CheckBlocksGate`).

### 2. Base edges are not hidden by camera motion

Camera motion does not toggle edge-layer visibility; during `moving` the visible
scene sync is skipped (`pixi-renderer-camera-scene-sync.js` returns `null`), so
edges are not redrawn but also not hidden. No edge-visibility regression exists
today. No edge hack-mandate is present to remove.

### 3. Camera motion does not commit React / replace the graph / read the working set

These are already aligned with the target architecture and are guarded:

- `workflow-graph-surface-controller.ts` `handleRendererCameraStateChange`: during
  `cameraMotion === "moving"` it calls `noteCameraMovement()` and returns; it
  only calls `captureCameraState()` on `settled`. Unit-guarded by
  `workflow-graph-surface-controller.test.ts` ("keeps moving camera state local
  and captures it only after settle").
- Hard harness gates (all passing today):
  `no-camera-caused-graph-react-commits`, `no-camera-caused-full-graph-replacement`,
  `no-camera-caused-workspace-presentation-writes`,
  `no-semantic-working-set-reads-during-camera-interaction`.

### 4. Trajectory/activity sprites are transform-only during motion

`pixi-renderer-trajectory-sprites.js` `tick()` updates sprite position/scale
(inverse-zoom) only; content regrouping happens via `updateFrame()`, not during
camera motion. No regrouping regression during motion.

### 5. Cross-owner drag bug — fixed in Phase 0

Before: `pixi-renderer-node-drag.js` `draggedNodesForStart` dragged **every
movable selected node**, so dragging a workflow node also dragged a selected
semantic node (different movement owners).

After: a group drag only includes selected nodes whose `movementOwner.kind`
matches the grabbed node's. Deterministic regression:
`pixi-renderer-node-drag.test.js` (workflow drag leaves a selected semantic node
in place; same-owner group drag still moves together; non-movable nodes
excluded). The harness keeps the snapshot-level
`assertOnlyNodeMoved` evidence in `workflow-graph-pan-zoom-behavior-assertions.mjs`.

## Start-of-gesture latency attribution (named categories)

Latency must be attributed to a **named category**, not inferred. The pan/zoom
recording already separates these per-event categories
(`workflow-graph-performance-recording.mjs`, `wheelLatency`):

| Category | Metric field | Meaning |
| --- | --- | --- |
| Event delivery delay | `wheelLatency.eventDeliveryDelayMs` (`eventTimestampDeltaMs`) | OS/browser event timestamp → handler entry |
| Input-handler → camera transform | `wheelLatency.eventToCameraUpdateMs` / `p95EventToCameraUpdateMs` | handler entry → first camera transform committed |
| → first Pixi render (proxy) | `wheelLatency.eventTimestampToFirstPixiRenderAfterCameraMs` | event → first Pixi render after camera (NOT compositor presentation) |
| Settle restore | `wheelInputLastEventToSettleRestoreMs` | last input → settled-fidelity restore |

Per-lane / per-bucket main-thread work during the gesture is attributed by the
renderer timing buckets (`commit-camera-change`, `pixi-render`,
`label-position-sync`, `label-visibility-sync`, `filter-area-sync`,
`scheduler-lane-camera-input`, …) asserted present in
`workflow-graph-pan-zoom-snapshot-assertions.mjs`. Main-thread long tasks come
from the `PerformanceObserver` capture, not synchronous input-handler work.

**Compositor presentation timing is intentionally not asserted.** The check
`input-to-presented-frame-budget-blocked` remains report-only because no
compositor presentation trace source is wired; first-Pixi-render is proxy
evidence only.

### Millisecond numbers — pending reference Mac

This sandbox cannot build + launch the Electron CDP harness, and the plan
requires machine-dependent ms to be captured on the reference machine, not
inferred in CI. Capture the baseline numbers with:

```
pnpm -C desktop build
SETTA_WORKFLOW_GRAPH_PHASE0_REFERENCE_RUNNER=1 \
  node desktop/tests/electron/run-workflows.mjs --tier workspace-graph-phase8 --skip-build
```

This emits the per-category p95s above and (with
`SETTA_WORKFLOW_GRAPH_PHASE0_REFERENCE_RUNNER=1`) promotes the timing checks
(`idle-wheel-pinch-to-camera-transform-p95-ms`,
`idle-wheel-pinch-to-first-pixi-render-proxy-p95-ms`, `no-long-task-over-100ms`)
to hard.

## Recording/debug overhead budget (2ms p95) — method + status

Budget: **recording/debug-on first-camera-transform p95 may add at most 2ms over
recording/debug-off** for the same scripted workload on the same machine.

The pan/zoom matrix already runs each scenario in both app-recording modes
(`recordingModeLabel` → `on`/`off` in `workflow-graph-phase0-performance-report.mjs`),
and `wheelLatency.p95EventToCameraUpdateMs` is the "first-camera-transform p95"
metric for the comparison.

**Status: pending reference-Mac measurement (explicitly attributed, not
inferred).** An automated `recording-on minus recording-off ≤ 2ms` matrix
comparison is not yet wired, and the delta is machine-dependent (ms), so per the
plan it belongs on the reference runner. To measure now, run the command above
in both modes and diff `p95EventToCameraUpdateMs` for matching scenarios. If the
delta exceeds 2ms, Phase 0 is red on this budget and the overhead must be
attributed (hot-path diagnostics) before Phase 1.

## Evidence-reset gate classification

| Severity | Checks | Effect |
| --- | --- | --- |
| hard (deterministic) | one-active-renderer…, no-renderer-instance-replacement…, no-graph-app-creation…, no-camera-caused-workspace-presentation-writes, no-camera-caused-graph-react-commits, no-camera-caused-full-graph-replacement, no-semantic-working-set-reads…, no-full-graph-label-sync-per-pan-wheel-event, materialized-node-count-scales…, static-glow-not-redrawn…, node-drag-recorded | Block the gate on failure |
| expected-fail (contract, Phase 1) | **no-labels-hidden-during-camera-motion** | Recorded red now; blocks the gate when it starts passing (promote to hard) |
| report-only (machine-dependent) | input-to-presented-frame-budget-blocked, normal-scene-p95-pan-zoom-frame-ms, supplemental-display-object-count-budget, no-long-task-over-100ms (non-reference), idle-wheel-pinch-* (non-reference) | Surface; hard only on the reference runner |

Report-only ms checks are intentionally **not** forced hard in ordinary CI: the
plan's teeth are deterministic invariants, and CI must not pretend it has true
presentation timing. The deterministic UX regression (label hiding) is the one
converted from a *rewarded hack* into an enforceable contract.

## How Phase 0 verifies (no device)

- `pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/pixi-renderer-node-drag.test.js src/renderer/src/features/workspace-graph/pixi-renderer-camera-sync.test.js src/renderer/src/features/workspace-graph/workflow-graph-surface-controller.test.ts`
- `node --test desktop/tests/electron/workflow-graph-phase0-performance-guardrails.test.mjs`

Phase 0 leaves the camera fast path unbuilt by design; the contracts above turn
red the moment Phase 1 lands the fix, which is the intended hand-off.
