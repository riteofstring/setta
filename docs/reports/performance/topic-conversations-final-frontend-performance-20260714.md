# Topic Conversations Final Frontend Performance — 2026-07-14

## Scope

This is the append-only before/after frontend performance record required by
Phase 9 item 8 of
`docs/plans/topic-conversations-global-master-narrator-20260711.md`. It compares
the pre-cutover singleton Easy Button baseline with the final
conversation-keyed renderer and records a like-for-like follow-up to the Phase
9 multi-pane streaming profile.

The measured source revision was
`300ce3940a991b7a430c226f9943880efcbb769a`. The environment was macOS 26.5.1
(25F80), arm64, Node 25.2.1, pnpm 10.23.0, and Electron 41.7.0.

## Method

The production desktop build and final untraced measurement used:

```sh
pnpm -C desktop build
node desktop/tests/electron/topic-conversation-performance.test.mjs \
  --skip-build \
  --keep-artifacts \
  --artifact-dir \
  .recordings/topic-conversation-phase9-item8-final-untraced-20260714
```

The same workload was repeated with `--trace` at
`.recordings/topic-conversation-phase9-item8-final-20260714`. Both runs used
temporary app data and the scripted Codex provider through the production
Electron/main/preload/renderer/HTTP/store paths.

The final workload opened four independent topic conversations, submitted one
turn to each, and streamed 640 provider text deltas per topic. The sample
covered live, live-throttled, and snapshot Easy Button runtime states while
recording animation frames, long tasks, DOM mutations, committed conversation
cursors, bounded projection windows, and pane DOM size.

The Phase 0 reference is
`docs/reports/performance/topic-conversations-phase0-baseline-20260711.md` at
revision `693db159de1cf4f3fb87e9c11a65a05b93d29af7`. It measured one working
singleton Easy Button rather than four interleaved conversations, so the frame
comparison is deliberately conservative rather than workload-equivalent.

## Cutover comparison

| Metric | Phase 0 working singleton | Final four-topic stream |
| --- | ---: | ---: |
| Average FPS | 120.07 | 119.67 |
| p50 frame delta | 8.30 ms | 8.30 ms |
| p95 frame delta | 9.10 ms | 8.90 ms |
| p99 frame delta | 9.30 ms | 9.20 ms |
| Maximum frame delta | 9.40 ms | 16.60 ms |
| Frames over 16.67 ms | 0 | 0 |
| Renderer long tasks | 0 | 0 |
| Independently streamed topics | 1 | 4 |
| Provider text deltas per topic | Not recorded | 640 |
| Committed cursor delta | Not recorded | 2,685 |
| Measured cursor throughput | Not recorded | 917.8 events/s |

The final sample lasted 2,925.5 ms and retained 200 trajectory events per
topic with `hasEarlier=true` after each 644-event trajectory overflowed the
window. Every final Easy Button surface remained below the 160-descendant
guardrail; the observed range was 92-94 descendants. One topic began as a
snapshot texture and another as live-throttled, then all four restored as live
completed projections with their bounded windows intact.

## Multi-pane hardening comparison

This table compares the original traced Phase 9 streaming profile from
`topic-conversations-multi-pane-streaming-20260714.md` with the final traced
rerun after all Phase 9 items through palette verification.

| Metric | Before stream hardening | Final traced rerun |
| --- | ---: | ---: |
| Committed cursor delta | 2,668 | 2,685 |
| Retained trajectory events per topic | 644 | 200 |
| Mutation observer callbacks | 2,068 | 436 |
| Total mutation records | 30,121 | 8,464 |
| Attribute mutation records | 25,290 | 6,715 |
| p95 frame delta | 9.20 ms | 9.00 ms |
| p99 frame delta | 10.30 ms | 10.20 ms |
| Maximum frame delta | 49.90 ms | 50.00 ms |
| Renderer long tasks | 0 | 0 |
| Measured cursor throughput | 837.8 events/s | 837.4 events/s |

The traced maximum is isolated from the headline frame result because trace
and CPU-profiler startup contributes scheduler stalls. The untraced final run
had a 16.60 ms maximum, no frame over 16.67 ms, and no long task. The traced
run remains useful for inspection and passed the same automated frame,
projection-window, DOM-budget, and mutation-coalescing assertions.

## Related lifecycle evidence

The timed profile targets the acceptance-critical multiple-pane and
large-trajectory path. The following deterministic production-path workflows
were rerun on the same build to cover performance-adjacent lifecycle behavior;
their results are functional guardrails, not additional timing samples:

| Concern | Result | Artifact |
| --- | --- | --- |
| Pane churn, hidden work, global capture, and playback preemption | Passed | `.recordings/topic-conversation-pane-projection/20260715T002948693Z` |
| Duplicate-pane semantic palette identity and reload stability | Passed | `.recordings/topic-conversation-palette-identity/20260715T003035128Z` |
| Simultaneous conversation completion playback arbitration | Passed | `.recordings/topic-conversation-speech-arbitration/20260715T003100322Z` |

The palette workflow kept two views of one conversation on the same `sky`
palette and a second conversation on `blue` before and after reload. The speech
workflow kept maximum concurrent playback at one, preserved the two final
summary enqueue/play/complete orders, and applied the declared
final-summary-over-milestone supersession policy. The pane workflow verified
conversation voice capture before and during active work, continued terminal
speech with no pane mounted, and preempted playback when recording began.

## Result

Pass. Under a harder four-topic interleaved workload, p95 and p99 frame time
remained within the observed 120 Hz guardrails, no renderer long task or frame
over 16.67 ms occurred, projection and DOM growth stayed bounded, and cursor
throughput exceeded the pre-hardening profile. The final result is functional
performance acceptance, not a mockup-parity or broad visual-restyling gate.

## Review correction: large navigator and duplicate views

Review found that the initial item 8 record did not measure the required large,
paged, cross-workspace conversation navigator. The focused workflow was
extended without changing production app code or beginning Phase 9 item 9. It
now seeds 120 durable topics in each of two temporary workspace roots, creates
four newer profiled topics through the renderer, opens a duplicate view of one
topic, searches the 244-topic collection, loads both older pages through the
virtualized navigator, and then runs the existing four-topic stream workload.

The two review invocations used:

```sh
node desktop/tests/electron/topic-conversation-performance.test.mjs \
  --skip-build \
  --keep-artifacts \
  --artifact-dir \
  .recordings/topic-conversation-phase9-item8-review-final-untraced-20260714

node desktop/tests/electron/topic-conversation-performance.test.mjs \
  --skip-build \
  --trace \
  --keep-artifacts \
  --artifact-dir \
  .recordings/topic-conversation-phase9-item8-review-traced-20260714
```

The navigator profile exercised renderer, preload, authenticated HTTP, and
SQLite paging paths. Each invocation loaded the initial 80-topic page for both
workspaces and both remaining page tails. Scroll extent grew from 5,904 px to
7,452 px and then 8,856 px, while virtualization mounted at most 20 items
against a 40-item guardrail.

| Navigator metric | Review untraced | Review trace-enabled invocation |
| --- | ---: | ---: |
| Durable topic conversations | 244 | 244 |
| Workspace groups | 2 | 2 |
| Sample duration | 686.1 ms | 673.6 ms |
| Frames | 79 | 78 |
| Average FPS | 120.01 | 120.02 |
| p50 frame delta | 8.30 ms | 8.30 ms |
| p95 frame delta | 8.80 ms | 9.10 ms |
| p99 frame delta | 9.30 ms | 9.30 ms |
| Maximum frame delta | 9.30 ms | 9.30 ms |
| Frames over 16.67 ms | 0 | 0 |
| Renderer long tasks | 0 | 0 |
| Maximum mounted navigator items | 20 | 20 |
| Mutation observer callbacks | 59 | 59 |
| Total mutation records | 1,572 | 1,572 |

The trace begins after the navigator sample so tracing does not distort its
scroll and paging frame measurements. The second invocation still repeats the
navigator guard before tracing the subsequent stream workload.

## Review large-collection stream follow-up

The stream workload ran with five Easy Button panes for four topics, including
two views of one conversation. It asserted every profiled navigator row reached
`Working` and returned to `Idle`, retained the 200-event projection windows,
and kept all final pane surfaces at 94 descendants. The production layout also
exercised two frozen visuals and one snapshot texture while events streamed.

| Stream metric | Review untraced | Review traced |
| --- | ---: | ---: |
| Committed cursor delta | 2,716 | 2,717 |
| Sample duration | 3,868.3 ms | 3,616.7 ms |
| Average FPS | 119.74 | 118.90 |
| p95 frame delta | 9.20 ms | 9.00 ms |
| p99 frame delta | 9.30 ms | 9.30 ms |
| Maximum frame delta | 15.80 ms | 41.00 ms |
| Frames over 16.67 ms | 0 | 1 |
| Renderer long tasks | 0 | 0 |
| Measured cursor throughput | 702.1 events/s | 751.2 events/s |
| Mutation observer callbacks | 545 | 505 |
| Total mutation records | 10,441 | 10,317 |
| Palette identity attribute applications | 21 | 21 |
| Non-null palette identity changes | 0 | 0 |

The traced maximum remains isolated from the headline result because trace and
CPU-profiler startup introduce scheduler stalls. The stable palette assertion
distinguishes lifecycle remounts from an actual old-to-new palette id change;
the duplicate, frozen, throttled, and restored panes had no identity change
during streaming.

Together with the pane-churn, palette-identity, and simultaneous-speech
workflows above, this review closes the previously missing navigator scrolling,
paging, large-collection row-update, duplicate-view, hidden/snapshot, and
semantic palette-token performance evidence required for Phase 9 item 8. It
does not refine palette presentation or perform any Phase 9 item 9 work.
