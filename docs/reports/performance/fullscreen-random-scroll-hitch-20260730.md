# Fullscreen random scroll hitch investigation — 2026-07-30

## Issue summary

Slow graph scrolling still paused intermittently after the known
integer-position DOM layout and runtime quality-transition defects were fixed.
The investigation found two independent causes: Electron allowed Chromium to
deprioritize the renderer's frame scheduling, and no-op wheel input still
invalidated every graph label.

## Environment

- Branch/worktree: `setta.fullscreen-conv-polish-1`
- Hardware: Apple M2 through ANGLE Metal
- Disposable visible Electron renderer
- 1280 × 820 CSS pixels, DPR 2
- Development 100-thread grid fixture
- Fixed full-fidelity graph quality profile

## Preconditions and reproduction

1. Start a temporary structured log receiver on `127.0.0.1:19977`.
2. Launch a disposable Electron window with temporary graph-hitch
   instrumentation enabled.
3. Select the 100-thread fixture and close the development panel.
4. Continuously wheel down and up through the graph for repeated 30-second
   windows.
5. Record every frame whose delta exceeds 24 ms or whose measured graph CPU
   work exceeds 6 ms, plus every renderer long task.

Expected: continuous camera and particle motion with no visible pause.

Baseline actual: the first 30-second run reproduced a 254.1 ms requestAnimationFrame
gap and 12 gaps over 32 ms.

## Hypotheses

### H1 — renderer scheduling starvation

Chromium delays starting the renderer's frame after its compositor requests
one. Supported: a 232.4 ms graph delta contained only 1.9 ms of graph CPU work,
while the Chrome trace recorded 237.1 ms from sending BeginMainFrame to starting
it and 13 consecutive compositor-dropped frames. No renderer long task occupied
that interval.

### H2 — WebGL submission stall

A graphics-driver or command-queue stall occurs inside the draw stage.
Rejected: draw submission was 0.2 ms in the 232.4 ms delayed frame.

### H3 — DOM label work

Projection, label placement, or style recalculation still causes intermittent
main-thread work. Supported if the labels stage spikes with a slow delta.
Partially supported as a second, smaller defect: after renderer scheduling was
fixed, no-op wheel input at the camera bound refreshed the full label layer
every frame. One label pass took 12.4 ms and was followed by a 51.1 ms graph
delta.

### H4 — garbage collection

Transient allocation causes renderer garbage collection. Supported if slow
frames correlate with heap contraction or V8 GC trace events. Rejected if heap
and trace evidence show no GC around the hitch. Rejected: the nearby minor
collection lasted 0.45 ms.

## Runs and evidence

### Baseline — default Electron scheduling, 100 threads

- Duration: 1,800 frames, about 30 seconds
- p50: 16.6 ms
- p95: 18.9 ms
- p99: 24.9 ms
- Maximum: 254.1 ms
- Gaps over 20 / 24 / 32 ms: 45 / 21 / 12
- Correlated graph frame: 232.4 ms delta, 1.9 ms total graph CPU
  - Projection: 0.1 ms
  - Packing: 0 ms
  - Upload: 0 ms
  - Draw: 0.2 ms
  - Labels: 1.6 ms
- Trace evidence: 237.1 ms from BeginMainFrame sent to started; 13 consecutive
  dropped compositor frames while the renderer main thread had no occupying
  long task.

### Intermediate — renderer throttling disabled

- Duration: 1,800 frames, about 30 seconds
- p50: 16.7 ms
- p95: 17.8 ms
- p99: 19.6 ms
- Maximum: 59.4 ms
- Gaps over 20 / 24 / 32 ms: 14 / 5 / 2
- Correlated secondary defect: a no-op wheel event forced a 12.4 ms label pass,
  followed by a 51.1 ms graph delta.

### Final — renderer throttling disabled and no-op wheel invalidation removed

Two independent 1,800-frame windows were recorded:

| Window |     p50 |     p95 |     p99 | Maximum | >20 ms | >24 ms | >32 ms |
| ------ | ------: | ------: | ------: | ------: | -----: | -----: | -----: |
| A      | 16.7 ms | 17.6 ms | 17.9 ms | 24.2 ms |      1 |      1 |      0 |
| B      | 16.7 ms | 17.5 ms | 17.8 ms | 18.4 ms |      0 |      0 |      0 |

The physical display used for the run refreshes at 60 Hz, so a 120 Hz
presentation rate cannot be observed on this setup. The final 60-second sample
had no long pause and no frame gap above two display intervals.

## Changes

- Set `backgroundThrottling: false` on Setta's main `BrowserWindow`, preventing
  Chromium from deferring this continuously animated renderer.
- Made graph look-back report whether the camera actually moved.
- Skip label invalidation and frame requests for wheel events clamped at the
  camera bound.
- Removed all temporary fetch logging and trace-analysis instrumentation after
  recording the evidence.
