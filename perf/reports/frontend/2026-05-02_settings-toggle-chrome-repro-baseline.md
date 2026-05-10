# Chrome Repro Toggle Jank Report

- Artifact: `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260502-211503`
- Recording events: `4429`
- Created: `2026-05-03T04:15:03.672356+00:00`
- Finalized: `2026-05-03T04:15:51.935766+00:00`
- Target CSS substring: `leftSidePaneShiftsMap`
- Correlation window: `900ms`, capped at the next target click

## Summary

| Metric | Value |
| --- | ---: |
| Target interactions | 24 |
| Interactions with frame gaps | 18 |
| Total frame gaps | 23 |
| Max frame gap | 108.4ms |
| Interactions with long tasks | 16 |
| Total long tasks | 20 |
| Max long task | 110ms |
| Max project-state websocket handler | 38.3ms |
| Max project-state websocket payload | 1.30 MiB |
| Max project-param websocket handler | 0ms |
| Max project-param websocket payload | 0 B |
| Max `/api/setParamEnteredValue` duration | 187.1ms |
| Max GPU bytes uploaded per interaction | 55.96 MiB |

## Top Interactions

| Time | Click ms | Max gap ms | Max long task ms | Project handler ms | Project payload | Param handler ms | Param payload | Set param ms | GPU upload |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 04:15:41.411 | 32 | 41.7 | 0 | 3.4 | 1.30 MiB | 0 | 0 B | 187.1 | 11.38 MiB |
| 04:15:39.079 | 40 | 91.6 | 104 | 38.3 | 1.30 MiB | 0 | 0 B | 159.2 | 11.89 MiB |
| 04:15:26.642 | 32 | 0 | 0 | 3.4 | 1.30 MiB | 0 | 0 B | 158.6 | 7.63 MiB |
| 04:15:38.620 | 32 | 41.7 | 0 | 3.4 | 1.30 MiB | 0 | 0 B | 157 | 11.89 MiB |
| 04:15:29.930 | 32 | 58.3 | 65 | 19.2 | 1.30 MiB | 0 | 0 B | 156.8 | 7.90 MiB |
| 04:15:40.037 | 40 | 49.9 | 57 | 3.4 | 1.30 MiB | 0 | 0 B | 155.5 | 11.89 MiB |
| 04:15:30.892 | 24 | 0 | 0 | 3.4 | 1.30 MiB | 0 | 0 B | 154.9 | 7.74 MiB |
| 04:15:31.342 | 24 | 0 | 0 | 3.3 | 1.30 MiB | 0 | 0 B | 154.8 | 11.14 MiB |
| 04:15:27.576 | 32 | 0 | 0 | 3.7 | 1.30 MiB | 0 | 0 B | 154.3 | 24.00 MiB |
| 04:15:27.117 | 24 | 0 | 0 | 3.6 | 1.30 MiB | 0 | 0 B | 153.9 | 7.80 MiB |
| 04:15:26.066 | 32 | 66.7 | 69 | 21.6 | 1.30 MiB | 0 | 0 B | 153.7 | 7.80 MiB |
| 04:15:30.433 | 24 | 0 | 0 | 3.6 | 1.30 MiB | 0 | 0 B | 152.3 | 7.58 MiB |

## Top GPU Surfaces

| Surface | Uploaded bytes across target windows |
| --- | ---: |
| `settings-section__gui` | 253.95 MiB |
| `settings-section__shortcuts` | 7.97 MiB |
| `settings-section__backend` | 7.97 MiB |
| `settings-section__sectionSizingPolicy` | 7.97 MiB |
| `settings-section__chatWindowing` | 7.20 MiB |

## Notes

- Frame gaps come from `performance-frame-gap` events in the Chrome recording.
- Websocket numbers come from `perf-websocket-message` app-state events.
- Backend request durations come from `logs/backend.log`; duration units are converted from nanoseconds to milliseconds.
- GPU upload bytes come from `gpu-flow-frame.uploadDiagnostics` and include only diagnostics captured in the recording payload.
