# High-refresh chat performance test plan

## Goal

Validate whether desktop chat streaming can hold true 120 Hz frame pacing on a MacBook Pro with a high-refresh display, using the same 4K Electron workflow and trace capture used in local performance work.

The current local MacBook Air measurements show steady 60 Hz pacing at 3840x2160 after the workspace scheduler fix. They cannot prove 120 Hz because the measured RAF cadence is approximately 16.7 ms.

## Test machine requirements

- MacBook Pro with ProMotion, or a confirmed 120 Hz or higher external display.
- macOS Display settings must show `ProMotion`, `120Hz`, or a higher explicit refresh rate.
- The app should be tested on the high-refresh display. Avoid mirroring to a 60 Hz display while testing.
- Use AC power if possible so macOS is less likely to enter a constrained power state.

## Repository setup

From the repository root:

```bash
pnpm -C desktop install --frozen-lockfile
pnpm -C desktop build
```

The workflow uses the scripted chat harness, temporary app data, and the production Electron/main/preload/renderer/store path. It does not need an OpenAI API key or ChatGPT auth.

## Run the measurements

Run three non-trace samples first:

```bash
node desktop/tests/electron/chat-stream-performance.test.mjs --skip-build
node desktop/tests/electron/chat-stream-performance.test.mjs --skip-build
node desktop/tests/electron/chat-stream-performance.test.mjs --skip-build
```

Then run one trace sample:

```bash
node desktop/tests/electron/chat-stream-performance.test.mjs --skip-build --trace
```

Each run prints an artifact directory under `.recordings/chat-stream-performance/`. The `latest` symlink points at the most recent run.

## Data to send back

Send the artifact paths printed by each run, plus these files from the latest trace run:

```bash
cat .recordings/chat-stream-performance/latest/summary.json
cat .recordings/chat-stream-performance/latest/trace-summary.json
ls -la .recordings/chat-stream-performance/
```

If the full trace is needed for deeper profiling, send:

```bash
ls -lh .recordings/chat-stream-performance/latest/trace.json
```

Do not paste the full `trace.json` into chat. It is usually large.

## Success criteria

For true 120 Hz pacing, the non-trace runs should show:

- `p50FrameDeltaMs` near `8.3`.
- `p95FrameDeltaMs` around `8.3` to `10`.
- `p99FrameDeltaMs` preferably below `16.7`.
- `longTaskCount` equal to `0`.
- Few or no frames in `slowFramesOver16Ms`.

If `p50FrameDeltaMs` is near `16.7`, the run is still presenting at 60 Hz. Fix display/compositor settings before treating that as an app performance result.

## Failure interpretation

If `p50FrameDeltaMs` is near `8.3` but `p95FrameDeltaMs` or `p99FrameDeltaMs` spikes, inspect the `--trace` run:

- Long `FunctionCall` or `v8.callFunction` slices point to renderer JavaScript.
- Long `Layout`, `UpdateStyleAndLayout`, or text shaping slices point to DOM/layout work.
- Long paint, raster, or GPU slices point to rendering/compositor pressure.
- Long trace startup slices such as `CpuProfiler::StartProfiling` can be harness overhead; compare against the non-trace runs before changing app code.

If all non-trace runs are clean at 8.3 ms but the trace run has one large first frame, treat the non-trace samples as the primary pacing signal and use the trace only for attribution.

## Expected local comparison

The current local 4K MacBook Air result after the scheduler fix is steady at the local 60 Hz cadence:

- p95 approximately `17.5 ms`.
- p99 approximately `17.6 ms`.
- max approximately `17.7 ms` in the cleanest run.
- long tasks `0`.

The MacBook Pro test is considered a new environment. Do not compare it only by average FPS; use frame percentiles and the observed median frame delta to confirm whether the harness is actually running at 120 Hz.
