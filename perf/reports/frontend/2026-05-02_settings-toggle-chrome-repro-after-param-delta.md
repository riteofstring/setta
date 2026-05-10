# Chrome Repro Toggle Jank Report

- Artifact: `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260502-221535`
- Recording events: `4392`
- Created: `2026-05-03T05:15:37.468617+00:00`
- Finalized: `2026-05-03T05:16:27.569222+00:00`
- Target CSS substring: `leftSidePaneShiftsMap`
- Correlation window: `900ms`, capped at the next target click

## Summary

| Metric | Value |
| --- | ---: |
| Target interactions | 17 |
| Interactions with frame gaps | 9 |
| Total frame gaps | 10 |
| Max frame gap | 50ms |
| Interactions with long tasks | 1 |
| Total long tasks | 1 |
| Max long task | 50ms |
| Max project-state websocket handler | 0ms |
| Max project-state websocket payload | 0 B |
| Max project-param websocket handler | 20.2ms |
| Max project-param websocket payload | 1.9 KiB |
| Max `/api/setParamEnteredValue` duration | 170.1ms |
| Max GPU bytes uploaded per interaction | 26.14 MiB |

## Top Interactions

| Time | Click ms | Max gap ms | Max long task ms | Project handler ms | Project payload | Param handler ms | Param payload | Set param ms | GPU upload |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 05:16:13.329 | 32 | 41.7 | 0 | 0 | 0 B | 16.9 | 1.5 KiB | 170.1 | 7.74 MiB |
| 05:16:07.037 | 32 | 0 | 0 | 0 | 0 B | 4.9 | 1.3 KiB | 168.5 | 7.80 MiB |
| 05:16:05.138 | 32 | 0 | 0 | 0 | 0 B | 4.8 | 1.2 KiB | 168.5 | 4.48 MiB |
| 05:16:18.062 | 32 | 41.7 | 0 | 0 | 0 B | 16.8 | 1.6 KiB | 168 | 4.29 MiB |
| 05:16:18.745 | 32 | 41.7 | 0 | 0 | 0 B | 18.1 | 1.7 KiB | 167.8 | 4.48 MiB |
| 05:16:05.637 | 32 | 0 | 0 | 0 | 0 B | 5 | 1.2 KiB | 167.8 | 4.48 MiB |
| 05:16:22.804 | 24 | 41.6 | 0 | 0 | 0 B | 16.5 | 1.9 KiB | 167.6 | 5.64 MiB |
| 05:16:16.704 | 40 | 41.7 | 0 | 0 | 0 B | 16.8 | 1.6 KiB | 167.6 | 1.93 MiB |
| 05:16:19.329 | 32 | 50 | 0 | 0 | 0 B | 20.2 | 1.7 KiB | 167.3 | 24.34 MiB |
| 05:16:22.345 | 24 | 0 | 0 | 0 | 0 B | 16.6 | 1.9 KiB | 166.9 | 17.07 MiB |
| 05:16:21.854 | 24 | 41.6 | 0 | 0 | 0 B | 20.1 | 1.8 KiB | 166.5 | 17.44 MiB |
| 05:16:06.537 | 32 | 0 | 0 | 0 | 0 B | 5.1 | 1.3 KiB | 166.3 | 4.48 MiB |

## Top GPU Surfaces

| Surface | Uploaded bytes across target windows |
| --- | ---: |
| `settings-section__gui` | 147.94 MiB |
| `settings-section__shortcuts` | 6.67 MiB |
| `settings-section__rotaryParamCodeObjDefault` | 0.56 MiB |
| `settings-section__sliderParamCodeObjDefault` | 0.56 MiB |
| `settings-section__textParamCodeObjDefault` | 0.46 MiB |

## Notes

- Frame gaps come from `performance-frame-gap` events in the Chrome recording.
- Websocket numbers come from `perf-websocket-message` app-state events.
- Backend request durations come from `logs/backend.log`; duration units are converted from nanoseconds to milliseconds.
- GPU upload bytes come from `gpu-flow-frame.uploadDiagnostics` and include only diagnostics captured in the recording payload.
