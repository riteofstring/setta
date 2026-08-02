# Easy Button Pane Phase 1 Performance

Date: 2026-07-08

## Baseline

Command run before the Phase 1 implementation:

```sh
node desktop/tests/electron/pane-drag-drop-benchmark-performance.test.mjs --skip-build --artifact-dir .recordings/easy-button-phase1-baseline-current
```

Result: failed before frame assertions. The benchmark evaluated
`paneDragDropPaneSnapshot` before installing the CDP driver extension:

```text
TypeError: Cannot read properties of undefined (reading 'paneDragDropPaneSnapshot')
```

Artifact: `.recordings/easy-button-phase1-baseline-current/summary.json`.

## Phase 1 Remeasure

Command:

```sh
node desktop/tests/electron/easy-button-pane-performance.test.mjs --skip-build
```

Artifact:
`.recordings/easy-button-pane-performance/20260708T235158651Z/summary.json`.

| State            | Frame count | Average FPS | p95 frame | p99 frame | Max frame | Sampled long tasks | Workspace long tasks |
| ---------------- | ----------: | ----------: | --------: | --------: | --------: | -----------------: | -------------------: |
| Idle             |         142 |      120.04 |   8.70 ms |   8.90 ms |   9.30 ms |                  0 |                    0 |
| Frozen CSS state |         142 |      119.99 |   8.90 ms |   9.10 ms |   9.20 ms |                  0 |                    0 |

Frozen verification: the host had `data-surface-frozen="true"` and the
button glow pseudo-element reported `animation-play-state: paused`.
