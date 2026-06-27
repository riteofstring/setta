# Chat stream performance harness - 2026-06-18

## Scope

Added an Electron CDP performance workflow for desktop chat streaming:

- scripted provider prompt: `chat performance stream`
- 240 assistant text deltas at 8 ms cadence
- run activity output delta every third assistant chunk
- production Electron/main/preload/renderer/store path
- artifacts under `.recordings/chat-stream-performance/`

The workflow records RAF frame deltas, long tasks, mutation count, scroll state, screenshots, and raw frame samples. It is registered as `chat-stream-performance` in the Electron `performance` tier.

## Harness correction

The first harness draft used `document.body.innerText` while sampling, which can force layout and contaminate frame timings. The harness now uses `textContent`, checks completion from transcript mutations/polling instead of every RAF, and writes `summary.json` plus `frame-samples.json`.

## Renderer changes measured

- Coalesced high-frequency `chat.assistant_text_delta` and `chat.run_item_output.delta` store updates while preserving sequence checks and immediate resync/control events.
- Kept transcript row callbacks, components, and row actions stable.
- Coalesced pinned scroll-to-latest through RAF and disabled Virtuoso `followOutput` to avoid duplicate auto-scroll work.
- Added a plain-text fast path for assistant markdown rendering.
- Stopped mounting collapsed run activity details/output blocks until the user opens the row.
- Split large syntax-simple assistant messages into virtualized transcript chunks so a long streaming response is no longer one giant virtual row.
- Reused unchanged transcript row objects between deltas, matching the stable-row pattern used by T3 Code's timeline.
- Coalesced audit-only semantic graph events in the main process before IPC; in the 4K stream benchmark this reduced forwarded semantic graph events from 1162 to 13-14 per run.

## Superseded 1440x900 measurement

Environment: local headless Electron/CDP run, 1440x900 viewport, likely 60 Hz RAF cadence. This did not represent the reported desktop/large-monitor workload and should only be treated as historical context.

Recent fixed-harness post-change samples:

| Artifact                                               | p95 frame | p99 frame | max frame | long tasks | duration |
| ------------------------------------------------------ | --------: | --------: | --------: | ---------: | -------: |
| `.recordings/chat-stream-performance/20260618T214017Z` |   83.4 ms |  117.7 ms |  134.3 ms |          5 |   6.78 s |
| `.recordings/chat-stream-performance/20260618T214040Z` |   66.7 ms |  133.3 ms |  150.8 ms |          2 |   7.51 s |
| `.recordings/chat-stream-performance/20260618T214102Z` |   66.7 ms |  100.3 ms |  116.7 ms |          1 |   6.37 s |

Median p95 across those three runs: 66.7 ms.

Follow-up samples after the stale cross-workspace resync fix and rebuilt production bundle:

| Artifact                                               | p50 frame | p95 frame | p99 frame | max frame | long tasks | duration | avg FPS |
| ------------------------------------------------------ | --------: | --------: | --------: | --------: | ---------: | -------: | ------: |
| `.recordings/chat-stream-performance/20260618T221757Z` |   16.7 ms |   17.5 ms |   17.6 ms |   34.2 ms |          0 |   2.41 s |    59.1 |
| `.recordings/chat-stream-performance/20260618T221819Z` |   16.7 ms |   17.6 ms |   33.3 ms |   33.4 ms |          0 |   2.41 s |    58.3 |
| `.recordings/chat-stream-performance/20260618T221838Z` |   16.7 ms |   17.5 ms |   33.3 ms |   49.4 ms |          0 |   2.52 s |    58.0 |

Median p95 across those three follow-up runs: 17.5 ms. These runs were too small to validate the desktop viewport complaint.

## 4K desktop-layout measurement

The harness now creates a 3840x2160 Electron window and applies a matching 3840x2160 renderer viewport. In this layout the chat pane remains 520 px wide inside the multi-pane workspace, so text wrapping pressure is much closer to the reported desktop experience.

First true 4K baseline after the viewport correction:

| Artifact                                               | p50 frame | p95 frame | p99 frame | max frame | long tasks | duration | avg FPS | transcript turn rows |
| ------------------------------------------------------ | --------: | --------: | --------: | --------: | ---------: | -------: | ------: | -------------------: |
| `.recordings/chat-stream-performance/20260618T223310Z` |   16.7 ms |   34.2 ms |   50.0 ms |   82.4 ms |          2 |   2.52 s |    46.8 |                    1 |

After chunked assistant rows, 32 ms stream batching, stable transcript row identities, and semantic graph audit-event IPC coalescing:

| Artifact                                               | p50 frame | p95 frame | p99 frame | max frame | long tasks | duration | avg FPS | semantic events |
| ------------------------------------------------------ | --------: | --------: | --------: | --------: | ---------: | -------: | ------: | --------------: |
| `.recordings/chat-stream-performance/20260618T224544Z` |   16.7 ms |   33.3 ms |   49.9 ms |   67.1 ms |          2 |   2.47 s |    54.7 |              13 |
| `.recordings/chat-stream-performance/20260618T224617Z` |   16.7 ms |   33.6 ms |   49.0 ms |   83.3 ms |          2 |   2.56 s |    48.2 |              13 |
| `.recordings/chat-stream-performance/20260618T224633Z` |   16.7 ms |   33.8 ms |   34.3 ms |  117.1 ms |          1 |   2.87 s |    49.5 |              14 |
| `.recordings/chat-stream-performance/20260618T224830Z` |   16.7 ms |   33.8 ms |   49.9 ms |   83.4 ms |          1 |   3.40 s |    47.0 |              14 |

Median p95 across the four current 4K runs: 33.7 ms. Median p99: 49.5 ms. This is better than the first 4K baseline in row shape, scroll height, semantic graph event volume, and average FPS, but it is not close to steady 120 fps and still misses 60 fps under this stress stream.

Chromium trace capture was added to the Electron CDP harness with `--trace`. A 4K trace before the scheduler fix showed the remaining bad frame was not layout or paint dominated. The top renderer-frame slice was our workspace `AnimationClock.tick` / `FrameScheduler.tick` path:

| Artifact                                               | p95 frame | p99 frame | max frame | long tasks | trace finding                                                                  |
| ------------------------------------------------------ | --------: | --------: | --------: | ---------: | ------------------------------------------------------------------------------ |
| `.recordings/chat-stream-performance/20260618T225401Z` |   34.0 ms |   50.0 ms |   82.9 ms |          1 | 77.3 ms renderer `FunctionCall` in `AnimationClock.tick` / workspace scheduler |

That identified a background layout loop: normal workspaces were recomputing pane geometry and applying presentation every RAF even when chat was the only active surface. The scheduler is now demand-driven for real workspaces: it renders on layout-store notifications and viewport changes, continues only while movement, resize, or overview animation is active, and stops once settled. Benchmark mode remains continuous.

Latest 4K measurements after the demand-driven workspace scheduler:

| Artifact                                                  | p50 frame | p95 frame | p99 frame | max frame | long tasks | duration | avg FPS | rendered message rows |
| --------------------------------------------------------- | --------: | --------: | --------: | --------: | ---------: | -------: | ------: | --------------------: |
| `.recordings/chat-stream-performance/20260618T225917Z`    |   16.7 ms |   17.5 ms |   17.6 ms |   33.0 ms |          0 |   2.27 s |    59.5 |                     - |
| `.recordings/chat-stream-performance/20260618T225938Z`    |   16.7 ms |   17.5 ms |   17.6 ms |   33.3 ms |          0 |   2.35 s |    59.6 |                     - |
| `.recordings/chat-stream-performance/20260618T230020448Z` |   16.7 ms |   17.4 ms |   17.5 ms |   17.6 ms |          0 |   2.27 s |    60.0 |                     - |
| `.recordings/chat-stream-performance/20260618T230154829Z` |   16.7 ms |   17.5 ms |   17.6 ms |   17.7 ms |          0 |   2.28 s |    60.0 |                     6 |

Median p95 across those four post-scheduler 4K runs: 17.5 ms. Median p99: 17.6 ms. Long tasks: zero in every run.

Trace verification after the scheduler fix:

| Artifact                                                  | p95 frame | p99 frame | max frame | long tasks | trace finding                                                                                           |
| --------------------------------------------------------- | --------: | --------: | --------: | ---------: | ------------------------------------------------------------------------------------------------------- |
| `.recordings/chat-stream-performance/20260618T230039715Z` |   17.5 ms |   17.6 ms |  100.0 ms |          0 | old scheduler `tick` absent; the 100 ms first sample coincides with trace `CpuProfiler::StartProfiling` |

The trace run still reports one 100 ms frame sample, but the trace itself attributes that startup slice to profiler activation from the tracing harness. Non-trace runs do not reproduce it.

Rejected experiments:

- Virtuoso `followOutput="auto"` plus removing manual pinned scroll worsened p95 to 83.4 ms and p99 to 133.4 ms at 4K.
- `content-visibility` block segmentation worsened max frame time and added long tasks.
- Plain text segment sizes below 512 characters did not materially improve frame pacing.

## Readout

The harness is now reliable enough to catch regressions and compare changes at the large desktop size. The main desktop-chat bottleneck in the measured workload was the always-on workspace frame scheduler, not the chat transcript itself. Removing that idle RAF loop brought the 4K stress stream back to a steady 60 Hz cadence on this machine.

A real 120 Hz proof still needs either a high-refresh display/compositor run or a reliable 120 Hz frame source. On this machine/run, every non-trace measurement is locked to a roughly 16.7 ms observed cadence, so the harness cannot prove 8.33 ms pacing. It can only prove that we are no longer missing the local 60 Hz cadence under the 4K chat stream.

Next useful engineering step for the 120 fps target: run this same harness on a high-refresh compositor and use the new `--trace` mode if it misses 8.33 ms frames. If that shows transcript/layout work rather than compositor cadence as the limit, then the larger chat-list owner change is justified.
