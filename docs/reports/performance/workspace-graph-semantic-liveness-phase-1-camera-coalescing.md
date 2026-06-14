# Workspace Graph Semantic Liveness Phase 1 Camera Coalescing

Date: 2026-06-16

## Scope

Phase 1 implementation and measurement for
`docs/plans/workspace_graph_performance_semantic_liveness_plan.md`.

The change moves camera-dependent renderer work out of pointer/wheel handlers.
Handlers now mutate the Pixi viewport and record the camera state cheaply; the
Pixi ticker runs the scheduled camera-dependent sync frame. While the camera is
moving, the renderer hides the screen-space label layer instead of repositioning
every label. A short settled frame restores labels and full glow fidelity.

Build used before recording:

```text
pnpm --dir desktop run build
```

Focused checks:

```text
pnpm -C desktop test -- src/renderer/src/features/workspace-graph/pixi-renderer-labels.test.js src/renderer/src/features/workspace-graph/pixi-renderer-animation.test.js src/renderer/src/features/workspace-graph/pixi-renderer-debug-surface.test.js
```

Recording commands:

```text
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario baseline --skip-build --keep-artifacts --artifact-dir .recordings/workspace-graph-phase1-after-20260616-r4/workflow-graph-pan-zoom-baseline
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario active --skip-build --keep-artifacts --artifact-dir .recordings/workspace-graph-phase1-after-20260616-r4/workflow-graph-pan-zoom-active
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario large --skip-build --keep-artifacts --artifact-dir .recordings/workspace-graph-phase1-after-20260616-r4/workflow-graph-pan-zoom-large
```

The before state is the Phase 0 baseline at
`.recordings/workspace-graph-phase0-baseline-20260616-r2`.

## Artifacts

| Workflow | Artifact directory |
| --- | --- |
| `workflow-graph-pan-zoom-baseline` | `.recordings/workspace-graph-phase1-after-20260616-r4/workflow-graph-pan-zoom-baseline` |
| `workflow-graph-pan-zoom-active` | `.recordings/workspace-graph-phase1-after-20260616-r4/workflow-graph-pan-zoom-active` |
| `workflow-graph-pan-zoom-large` 500 nodes | `.recordings/workspace-graph-phase1-after-20260616-r4/workflow-graph-pan-zoom-large/500-nodes` |
| `workflow-graph-pan-zoom-large` 1,000 nodes | `.recordings/workspace-graph-phase1-after-20260616-r4/workflow-graph-pan-zoom-large/1000-nodes` |
| `workflow-graph-pan-zoom-large` 2,500 nodes | `.recordings/workspace-graph-phase1-after-20260616-r4/workflow-graph-pan-zoom-large/2500-nodes` |
| `workflow-graph-pan-zoom-large` 5,000 nodes | `.recordings/workspace-graph-phase1-after-20260616-r4/workflow-graph-pan-zoom-large/5000-nodes` |

## Camera Timing

Cells are average ms / worst ms from final debug snapshots.

| Scenario | Nodes | Before commit camera | After moving-frame commit | After settle restore | Cheap record camera |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 7 | 0.22 / 0.40 | 0.08 / 0.50 | 0.21 / 0.40 | 0.02 / 0.10 |
| active | 10 | 0.28 / 1.60 | 0.08 / 0.30 | 0.18 / 0.30 | 0.01 / 0.10 |
| large | 500 | 2.05 / 3.50 | 0.40 / 3.60 | 2.25 / 3.10 | 0.01 / 0.10 |
| large | 1,000 | 5.99 / 8.70 | 0.68 / 9.20 | 5.70 / 8.40 | 0.03 / 0.10 |
| large | 2,500 | 24.08 / 36.60 | 2.17 / 37.10 | 28.61 / 45.50 | 0.01 / 0.10 |
| large | 5,000 | 73.88 / 149.50 | 12.53 / 120.50 | 68.83 / 120.20 | 0.01 / 0.10 |

The measured moving-frame camera work is now much smaller at scale. At 5,000
nodes, the average `commit-camera-change` bucket dropped from 73.88 ms to
12.53 ms because moving frames no longer reposition all labels or redraw settled
glow fidelity. The remaining 68.83 ms settle restore is still whole-graph label
work, which keeps Phase 2 visible-label work justified.

## Interaction Deltas

Deltas are summed from sampled debug snapshots during the scripted interaction.

| Scenario | Nodes | Camera updates | Camera sync frames | Moving label-hidden frames | Settle restores | Label sync delta before | Label sync delta after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 7 | 21 | 21 | 21 | 21 | 231 | 231 |
| active | 10 | 21 | 21 | 21 | 21 | 336 | 336 |
| large | 500 | 22 | 22 | 22 | 22 | 11,000 | 11,000 |
| large | 1,000 | 22 | 22 | 22 | 22 | 22,000 | 22,000 |
| large | 2,500 | 22 | 22 | 22 | 22 | 55,000 | 55,000 |
| large | 5,000 | 22 | 22 | 22 | 22 | 110,000 | 110,000 |

The label sync delta stayed the same in this recording because the diagnostic
harness reads a full debug snapshot after every input sample. That snapshot work
gives the camera settle window enough time to restore labels between sampled
events. The new counters still prove the Phase 1 path: every camera update went
through a moving sync frame, labels were hidden during those frames, and no
camera-dependent sync remained pending at the final snapshot.

## Frame And Observer Readout

| Scenario | Nodes | P95 frame before | P95 frame after | Worst frame before | Worst frame after | Long-task total before | Long-task total after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 7 | 28.8 ms | 47.2 ms | 30.0 ms | 58.3 ms | 130 ms | 192 ms |
| active | 10 | 31.3 ms | 52.0 ms | 34.0 ms | 56.0 ms | 88 ms | 1,520 ms |
| large | 500 | 69.5 ms | 66.8 ms | 77.0 ms | 77.3 ms | 4,910 ms | 4,468 ms |
| large | 1,000 | 105.7 ms | 105.9 ms | 142.4 ms | 140.6 ms | 28,038 ms | 27,362 ms |
| large | 2,500 | 299.1 ms | 296.7 ms | 313.2 ms | 331.7 ms | 55,004 ms | 52,634 ms |
| large | 5,000 | 517.9 ms | 512.7 ms | 555.7 ms | 548.8 ms | 116,927 ms | 111,958 ms |

Frame and long-task totals are mixed because the recording harness still does
expensive all-node debug snapshot sampling and the settled label restore remains
O(nodes). The clearest Phase 1 win is on the camera movement path itself. The
result does not remove Phase 2: label sync, label visibility, and settled restore
are still the dominant scale bottlenecks.

## Readout

- Pointer and wheel handlers no longer run the expensive label/glow/filter path.
- Camera state recording is cheap and separated from camera-dependent renderer
  sync.
- Camera-dependent sync is scheduled and drained from the ticker.
- Moving frames use reduced fidelity by hiding screen-space labels and skipping
  settled glow redraw, then a settle restore puts labels and glow back.
- The recording harness now asserts the new camera sync counters, moving label
  hidden frames, settle restore frames, and absence of pending camera sync.
