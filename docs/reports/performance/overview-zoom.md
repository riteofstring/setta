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

| Transition     | Avg FPS | p95 frame | p99 frame | Max frame | Slow >32ms | Runtime states after transition |
| -------------- | ------: | --------: | --------: | --------: | ---------: | ------------------------------- |
| Enter overview |   60.06 |   17.70ms |   18.20ms |   18.40ms |          0 | live: 18                        |
| Exit overview  |   60.02 |   18.20ms |   18.40ms |   18.70ms |          0 | live: 18                        |

## Discarded Attempt

Artifact: `.recordings/overview-zoom-performance/after-runtime-policy-20260607`

Forcing all settled overview panes into snapshots introduced an enter-overview hitch in the probe: one frame reached 366.70ms. That path was discarded because snapshot capture at transition start can be worse than the original issue.

## Final Result

Artifact: `.recordings/overview-zoom-performance/after-cache-20260607`

Changes measured:

- Reuse cached normal/overview endpoint layouts while only `overviewProgress` changes during a zoom transition.
- Stop syncing every rendered pane's content during movement.
- Degrade expensive unfocused moving panes, while leaving settled overview live to avoid the snapshot-capture hitch.

| Transition     | Avg FPS | p95 frame | p99 frame | Max frame | Slow >32ms | Runtime states during transition |
| -------------- | ------: | --------: | --------: | --------: | ---------: | -------------------------------- |
| Enter overview |   59.93 |   17.80ms |   18.60ms |   18.70ms |          0 | live: 18, snapshot: 2            |
| Exit overview  |   60.00 |   18.30ms |   18.60ms |   18.60ms |          0 | live: 17, snapshot: 2            |

Visual artifacts reviewed:

- `.recordings/overview-zoom-performance/after-cache-20260607/overview.png`
- `.recordings/overview-zoom-performance/after-cache-20260607/normal-after.png`

The probe remains intentionally focused. It exercises the production Electron app path but uses a small default workspace; larger real workspaces should benefit more from endpoint layout caching because zoom no longer recomputes both endpoint layouts on every animation frame.

## Browser Native View Handoff

Date: 2026-06-08

Artifact: `.recordings/overview-browser-live-snapshot/20260608T022850Z`

Measured a two-browser real workspace overview toggle through production Electron/main/preload/renderer paths. The harness now records native browser stats before entering overview, during the transition, in settled overview, and after returning to normal mode.

Native browser view state:

| Phase                  | Live native browser views | Hidden native browser views | Registered browser views |
| ---------------------- | ------------------------: | --------------------------: | -----------------------: |
| Normal before overview |                         2 |                           0 |                        2 |
| Settled overview       |                         0 |                           2 |                        2 |
| Normal after overview  |                         2 |                           0 |                        2 |

Transition timing:

| Transition     | Avg FPS | p95 frame | p99 frame | Max frame | Slow >32ms | Long tasks | Runtime states during transition |
| -------------- | ------: | --------: | --------: | --------: | ---------: | ---------: | -------------------------------- |
| Enter overview |   60.00 |   16.80ms |   17.10ms |   17.30ms |          0 |          0 | live: 11, snapshot: 7            |
| Exit overview  |   60.00 |   16.80ms |   16.80ms |   17.60ms |          0 |          0 | live: 18                         |

Visual artifacts reviewed:

- `.recordings/overview-browser-live-snapshot/20260608T022850Z/normal-before.png`
- `.recordings/overview-browser-live-snapshot/20260608T022850Z/overview.png`
- `.recordings/overview-browser-live-snapshot/20260608T022850Z/normal-after.png`

Renderer console output was empty. Electron output retained the existing default terminal fixture attach error, but browser load/capture cancellation noise was absent in the final run.

## Browser Handoff Follow-up

Date: 2026-06-08

Artifact: `.recordings/overview-zoom-performance/20260608T140450Z`

This follow-up reran the two-browser production Electron overview workflow after the chat width work and the terminal xterm fit-readiness guard. Browser native view handoff remained correct and the renderer console was empty.

Native browser view state:

| Phase                  | Live native browser views | Hidden native browser views | Registered browser views |
| ---------------------- | ------------------------: | --------------------------: | -----------------------: |
| Normal before overview |                         2 |                           0 |                        2 |
| Settled overview       |                         0 |                           2 |                        2 |
| Normal after overview  |                         2 |                           0 |                        2 |

Transition timing:

| Transition     | Avg FPS | p95 frame | p99 frame | Max frame | Slow >32ms | Long tasks | Runtime states during transition |
| -------------- | ------: | --------: | --------: | --------: | ---------: | ---------: | -------------------------------- |
| Enter overview |   57.11 |   16.80ms |   17.60ms |   83.40ms |          1 |          0 | live: 11, snapshot: 7            |
| Exit overview  |   60.00 |   17.40ms |   17.70ms |   17.70ms |          0 |          0 | live: 18                         |

Visual artifacts reviewed:

- `.recordings/overview-zoom-performance/20260608T140450Z/normal-before.png`
- `.recordings/overview-zoom-performance/20260608T140450Z/overview.png`
- `.recordings/overview-zoom-performance/20260608T140450Z/normal-after.png`

The enter transition retained one isolated slow frame without a long task; p95/p99 stayed below 18ms. Electron output still contains the existing initial terminal attach miss for the default fixture pane, but the prior xterm renderer-console dimensions error is gone.
