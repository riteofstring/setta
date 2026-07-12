# Topic Conversations Multi-Pane Streaming — 2026-07-14

## Scope

Profile four production Easy Button panes while 640 provider text deltas stream into each topic. The deterministic workflow uses the real Electron/main/preload/renderer/HTTP/store paths and records live, throttled, and snapshot pane behavior.

Command for both measurements:

```sh
node desktop/tests/electron/topic-conversation-performance.test.mjs --skip-build --trace --keep-artifacts --artifact-dir <artifact-dir>
```

## Results

| Metric | Before | After |
| --- | ---: | ---: |
| Forwarded conversation events | 2,668 | 2,668 |
| Renderer trajectory events retained per topic | 644 | 200 |
| Renderer `hasEarlier` after overflow | false | true |
| Mutation observer callbacks | 2,068 | 422 |
| Total mutation records | 30,121 | 15,224 |
| Attribute mutation records | 25,290 | 12,540 |
| p95 frame delta | 9.2 ms | 9.0 ms |
| p99 frame delta | 10.3 ms | 10.3 ms |
| Maximum frame delta | 49.9 ms | 49.9 ms |
| Long tasks | 0 | 0 |
| Measured throughput | 837.8 events/s | 853.7 events/s |

Artifacts:

- Before: `.recordings/topic-conversation-phase9-item2-baseline-v5/summary.json`
- After: `.recordings/topic-conversation-phase9-item2-after-v1/summary.json`

## Change and guardrails

- Snapshot window limits are generated into TypeScript from the Go owner. Live turn, trajectory, artifact, and narration updates retain the same latest-window bounds as cold snapshots; selection-sensitive side-window overflow requests a backend resync.
- IPC conversation events are applied in ordered batches of at most 128 per animation frame, with an event-triggered 50 ms fallback for throttled or hidden renderers. Runtime reset cancels and discards queued work.
- `topic-conversation-performance.test.mjs` now verifies bounded backend and renderer windows, four independently completed topics, canonical pane DOM budgets, frame budgets, absence of long tasks, and mutation callback coalescing.

Result: pass.

## Review verification

The review follow-up preserved the frame-batched projection path while making existing speech playback and pane-release consumers account for events already queued for the next frame. The production workflow was rerun after that correction.

| Metric | Review run |
| --- | ---: |
| Sampled conversation cursor delta | 2,683 |
| Mutation observer callbacks | 439 |
| Total mutation records | 15,729 |
| p95 frame delta | 8.9 ms |
| p99 frame delta | 9.8 ms |
| Maximum frame delta | 49.8 ms |
| Long tasks | 0 |
| Measured throughput | 840.3 events/s |

Artifact: `.recordings/topic-conversation-phase9-item2-review-20260714/summary.json`.

Result: pass.
