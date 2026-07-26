# Setta 4 Command Center - Graph Update Performance

Date: 2026-07-25

## Scope

This is a focused Phase 4 item 8 measurement for the production Director
command-center shell's graph-update cluster:

- pushed text-delta burst at laptop and emulated 4K tiers
- large live history compaction at the laptop tier
- foreground/background occlusion and resume at the laptop tier

The run uses the existing integrated Electron workflow and scripted Codex
provider. It does not seek external hardware, credentials, GUI-only setup, or
remote access.

## Method

Commands:

```sh
pnpm -C desktop build
node desktop/tests/electron/director-command-center-performance.test.mjs \
  --skip-build \
  --keep-artifacts \
  --scenario text-delta-burst \
  --scenario history-compaction-boundary \
  --scenario occlusion-transitions
```

Environment:

| Field              | Value                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| Workflow           | `director-command-center-performance`                                  |
| Source             | `298970525` plus this measurement report commit                        |
| Artifact directory | `.recordings/director-command-center-performance/20260725T124547638Z/` |
| Production build   | `pnpm -C desktop build`                                                |

The workflow exercised Electron main, preload, HTTP, durable store, the Director
registry subscription, React rails/composer, and the WebGL2 graph mount. It
asserted frame cadence, renderer long tasks, DOM bounds, graph canvas pixels,
text-delta DOM churn, hidden-document draw suppression, and a clean renderer
console.

## Results

All selected rows passed.

| Tier / scenario                | Frames |       p95 / p99 / max | Long tasks | Frames >50 ms | DOM | Graph labels | Canvas cells |
| ------------------------------ | -----: | --------------------: | ---------: | ------------: | --: | -----------: | -----------: |
| Laptop / text-delta burst      |    430 |  9.6 / 10.3 / 10.4 ms |          0 |             0 | 162 |            3 |         0.02 |
| 4K / text-delta burst          |    461 |  9.8 / 10.3 / 10.4 ms |          0 |             0 | 183 |            6 |         0.02 |
| Laptop / occlusion transitions |    365 |  9.9 / 10.3 / 49.7 ms |          0 |             0 | 184 |            7 |         0.05 |
| Laptop / history compaction    |    320 | 10.0 / 10.3 / 10.4 ms |          0 |             0 | 184 |            7 |         0.04 |

The text-delta rows stayed inside the committed churn guardrail:

| Tier   | Added nodes | Removed nodes | Character-data records |
| ------ | ----------: | ------------: | ---------------------: |
| Laptop |          19 |             7 |                      7 |
| 4K     |          18 |            10 |                      7 |

The occlusion row confirmed the graph did not draw while the document was
simulated hidden and did redraw after visibility resumed. The compaction row
confirmed the live graph reached the 400-node visible cap with `hasEarlier`
true.

## Remaining Phase 4 Performance Rows

Repository-actionable rows still open after this measurement:

- navigation among 100 workstreams at laptop and 4K
- ten minutes of sustained activity and memory observation at laptop
- restart and durable replay at laptop and harness-standard

Release gates still unavailable to repository automation:

- real 4K, 6K, and phone hardware
- side-by-side mockup review on representative real displays
