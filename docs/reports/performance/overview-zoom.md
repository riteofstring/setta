# Overview Zoom Performance

Date: 2026-06-07

## Scenario

Measured the real workspace overview toggle in production Electron with a fixed 1440x900 viewport and a temporary workspace opened through the production main/preload/renderer path.

Command:

```sh
node desktop/tests/electron/overview-zoom-performance.test.mjs --skip-build --artifact-dir <artifact-dir>
```

## Baseline

Artifact: `.recordings/overview-zoom-performance/baseline-20260607-rerun`

The harness did not reproduce visible frame drops in this small fixture, but it confirmed the expensive runtime posture that matched the reported jank: workspace mode kept all rendered pane hosts live through overview zoom.

| Transition | Avg FPS | p95 frame | p99 frame | Max frame | Slow >32ms | Runtime states after transition |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Enter overview | 60.06 | 17.70ms | 18.20ms | 18.40ms | 0 | live: 18 |
| Exit overview | 60.02 | 18.20ms | 18.40ms | 18.70ms | 0 | live: 18 |

## Discarded Attempt

Artifact: `.recordings/overview-zoom-performance/after-runtime-policy-20260607`

Forcing all settled overview panes into snapshots introduced an enter-overview hitch in the probe: one frame reached 366.70ms. That path was discarded because snapshot capture at transition start can be worse than the original issue.

## Final Result

Artifact: `.recordings/overview-zoom-performance/after-cache-20260607`

Changes measured:

- Reuse cached normal/overview endpoint layouts while only `overviewProgress` changes during a zoom transition.
- Stop syncing every rendered pane's content during movement.
- Degrade expensive unfocused moving panes, while leaving settled overview live to avoid the snapshot-capture hitch.

| Transition | Avg FPS | p95 frame | p99 frame | Max frame | Slow >32ms | Runtime states during transition |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Enter overview | 59.93 | 17.80ms | 18.60ms | 18.70ms | 0 | live: 18, snapshot: 2 |
| Exit overview | 60.00 | 18.30ms | 18.60ms | 18.60ms | 0 | live: 17, snapshot: 2 |

Visual artifacts reviewed:

- `.recordings/overview-zoom-performance/after-cache-20260607/overview.png`
- `.recordings/overview-zoom-performance/after-cache-20260607/normal-after.png`

The probe remains intentionally focused. It exercises the production Electron app path but uses a small default workspace; larger real workspaces should benefit more from endpoint layout caching because zoom no longer recomputes both endpoint layouts on every animation frame.
