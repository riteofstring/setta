# Setta 4 Graph Renderer — Scale, Viewport, and Scenario Measurement

Date: 2026-07-24

## Scope

This closes items 6, 8, 9, and 10 of Phase 2 in
`docs/plans/setta-4-director-command-center-plan.md`: the canvas-pixel checks,
the required scale and viewport scenarios, the profile, and the fixes the
measurement found.

It measures the **standalone renderer**. The graph is fed the committed packed
fixtures through the harness page; no Director endpoint, backend state, or
conversation store is involved. That is what makes these numbers comparable
between builds — the same scene always produces the same columns.

Append-only. A later run writes a new report; this one is not edited.

## 1. Environment

Re-measured on the machine that produced this report, per section 1 of
[`setta-4-target-performance-matrix-20260724.md`](setta-4-target-performance-matrix-20260724.md).

| Field | Value |
| --- | --- |
| Machine | MacBook Pro, `MacBookPro18,3` |
| Chip | Apple M1 Pro, 8 CPU cores (6 performance, 2 efficiency) |
| GPU | Apple M1 Pro, 14 cores |
| Memory | 32 GB |
| OS | macOS 26.5.2, build 25F84, arm64 |
| Display | Built-in Liquid Retina XDR, 3024×1964 native, ProMotion up to 120 Hz |
| WebGL renderer | `ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)` |
| GPU timer queries | `EXT_disjoint_timer_query_webgl2` present |
| Runtime | Electron 41.7.0, Node 25.2.1, pnpm 10.23.0 |
| Source | `2d7c6a754` plus the Phase 2 measurement commit this report lands with |
| Build | `pnpm -C desktop exec electron-vite build` |

### Observed refresh period

Frame delta p50 was **8.3 ms** in every one of the 19 runs, so the report frame
budget resolves to **8.33 ms (120 Hz)** through the committed convention in
`desktop/tests/electron/performance-frame-budget.mjs`.

The renderer's own adaptation budget was **6.0 ms** throughout — it is derived
from the single shortest frame delta ever observed and is deliberately
optimistic, so a renderer stuck at half rate cannot redefine the target as half
rate. It is an adaptation input, not the display's period, and reports do not
use it as the budget.

## 2. Method

- Harness page: `desktop/src/renderer/director-graph.html`, mounting
  `features/director-graph/harness/`. A second renderer entry rather than a mode
  of the app shell, so no store, rail, or shell DOM lands in a frame sample.
- Workflow:
  `node desktop/tests/electron/director-graph-renderer-performance.test.mjs --skip-build`
  (registered as `director-graph-renderer-performance` in the `performance` tier
  of the Electron workflow manifest).
- Scenarios are the matrix's section 4 list expressed over the committed packed
  fixtures. A replay pushes each batch when the replay clock reaches the fixture
  time of its newest committed fact, at 2.5× fixture speed, so the renderer sees
  the arrival cadence a live subscription produces.
- Tiers are applied through `Emulation.setDeviceMetricsOverride`, except the
  laptop tier, which clears the override and measures the real window at the
  real device pixel ratio. The phone DPR-3 tier is the first E2E in this
  repository to set a device scale factor above 1, which was the matrix's first
  capability gap.
- Every scenario ends with a canvas-pixel check read back inside the frame that
  drew it, then the recorded renderer console is checked for errors.
- Total measured wall time: 200 s across 19 runs, plus a separate traced pass.

## 3. Results

All 19 runs passed. Zero long tasks, zero frames over 50 ms, and a maximum
slow-frame ratio of 0.2 % across the whole matrix. Frame delta p99 was 9.3–9.4 ms
and the worst single frame anywhere was 11.4 ms.

Budgets: main-thread ≤ 2 ms at p95, GPU ≤ 4 ms at p95.

| Tier | Scenario | Frames | CPU p50/p95/p99/max ms | GPU p50/p95/p99/max ms | Δ p95 ms | Tier steps | Render scale | Heap MB start→peak→end |
| --- | --- | ---: | --- | --- | ---: | ---: | --- | --- |
| laptop | one-active-workstream | 520 | 0.2/0.5/0.7/2.4 | 1.68/1.89/3.56/4.86 | 9.2 | 1 | 0.72–1 | 9.5→9.5→9.5 |
| laptop | director-and-worker-interleaved | 1065 | 0.2/0.4/0.6/3.6 | 1.47/1.77/2.41/4.20 | 9.2 | 0 | 1–1 | 9.5→9.5→9.5 |
| laptop | branch-merge-and-dead-end | 948 | 0.2/0.5/0.6/1.1 | 1.69/1.84/2.49/2.74 | 9.0 | 0 | 1–1 | 9.5→9.5→9.5 |
| laptop | history-compaction-boundary | 959 | 0.2/0.4/0.5/1.2 | 1.70/3.35/3.63/4.40 | 9.2 | 0 | 1–1 | 9.5→9.5→9.5 |
| laptop | approval-and-artifact-arrival | 825 | 0.2/0.4/0.6/1.2 | 1.71/3.70/4.29/4.79 | 9.0 | 0 | 0.72–1 | 9.5→9.5→9.5 |
| laptop | cancellation-failure-recovery | 1200 | 0.2/0.4/0.6/1.2 | 1.64/1.77/1.85/2.51 | 9.1 | 0 | 1–1 | 9.5→9.5→9.5 |
| laptop | navigate-100-workstreams | 297 | 0.2/0.4/0.5/1.1 | 1.71/1.79/1.83/2.30 | 9.0 | 0 | 1–1 | 9.5→9.5→9.5 |
| laptop | burst-cursor-replay | 582 | 0.2/0.4/0.5/1.0 | 1.70/1.77/2.02/2.34 | 9.2 | 0 | 1–1 | 9.5→9.5→9.5 |
| laptop | restart-durable-replay | 434 | 0.2/0.3/0.3/0.4 | 1.44/1.45/1.58/1.63 | 9.2 | 0 | 1–1 | 9.5→9.5→9.5 |
| laptop | occlusion-transitions | 85 | 0.2/0.4/0.7/0.8 | 1.71/1.82/2.41/2.41 | 9.3 | 0 | 1–1 | 9.5→9.5→9.5 |
| laptop | sustained-activity (60 s) | 1200 | 0.2/0.4/0.6/0.9 | 1.49/2.33/3.05/4.70 | 9.1 | 0 | 0.72–1 | 9.5→9.5→9.5 |
| harness-standard | one-active-workstream | 518 | 0.2/0.4/0.5/0.6 | 0.79/0.88/1.26/2.26 | 9.1 | 0 | 1–1 | 9.5→9.5→9.5 |
| harness-standard | restart-durable-replay | 434 | 0.2/0.5/0.7/0.9 | 0.78/1.20/2.25/2.94 | 9.0 | 0 | 1–1 | 9.5→9.5→9.5 |
| desktop-4k | director-and-worker-interleaved | 1067 | 0.2/0.4/0.5/2.8 | 1.76/1.82/1.86/2.73 | 9.2 | 2 | 1–1 | 9.5→9.5→9.5 |
| desktop-4k | navigate-100-workstreams | 297 | 0.2/0.4/0.5/0.7 | 1.75/2.15/2.40/2.43 | 9.3 | 0 | 1–1 | 9.5→9.5→9.5 |
| desktop-4k | burst-cursor-replay | 584 | 0.2/0.4/0.5/1.3 | 1.74/2.06/2.40/2.52 | 9.3 | 0 | 1–1 | 9.5→9.5→9.5 |
| desktop-6k | director-and-worker-interleaved | 1065 | 0.2/0.4/0.6/3.1 | 1.74/2.23/2.62/3.64 | 9.3 | 2 | 1–1 | 9.5→9.5→9.5 |
| phone-dpr3 | one-active-workstream | 518 | 0.1/0.3/0.4/1.8 | 0.60/0.98/1.38/1.68 | 9.1 | 0 | 1–1 | 9.5→9.5→9.5 |
| phone-dpr1 | one-active-workstream | 512 | 0.2/0.3/0.4/1.3 | 0.33/0.57/0.81/0.91 | 9.2 | 0 | 1–1 | 9.5→9.5→9.5 |

CPU marks, worst value across the whole matrix:

| Mark | p95 ms | max ms |
| --- | ---: | ---: |
| projection | 0.1 | 0.8 |
| packing | 0.1 | 0.2 |
| upload | 0.1 | 3.1 |
| draw | 0.3 | 2.3 |

The upload and draw maxima are first-frame costs — a snapshot replacement
uploads every column once and a viewport change reallocates the surfaces. They
land inside single frames that stayed under the 50 ms dropped-frame threshold
and never produced a long task.

### Surfaces actually in force

| Tier | Logical viewport | DPR | Post pass | Scene pass | Quality tier | Letterboxed frame (fraction of canvas) |
| --- | --- | ---: | --- | --- | --- | --- |
| laptop | 1512 × 982 (real window) | 2 | 2268 × 1473 (3.34 MP) | 1881 × 1222 (2.30 MP) | full | 0.507 × 1.000 |
| harness-standard | 1440 × 900 | 1 | 1440 × 900 (1.30 MP) | 1440 × 900 (1.30 MP) | full | 0.488 × 1.000 |
| desktop-4k | 3840 × 2160 | 1 | 2529 × 1423 (3.60 MP) | 2021 × 1137 (2.30 MP) | full | 0.229 × 0.521 |
| desktop-6k | 6016 × 3384 | 1 | 2529 × 1423 (3.60 MP) | 2021 × 1137 (2.30 MP) | full | 0.146 × 0.333 |
| phone-dpr3 | 390 × 844 | 3 | 585 × 1266 (0.74 MP) | 585 × 1266 (0.74 MP) | full | 1.000 × 0.591 |
| phone-dpr1 | 390 × 700 | 1 | 390 × 700 (0.27 MP) | 390 × 700 (0.27 MP) | full | 1.000 × 0.713 |

These match the matrix's section 3.1 predictions to within a pixel, and they
confirm its first consequence: 4K and 6K produce identical pass sizes, so above
the laptop tier the ceilings hold GPU cost constant and the tiers differ only in
sharpness.

## 4. Scenario properties

Frame time is not the only claim these scenarios make.

| Scenario | Asserted property | Observed |
| --- | --- | --- |
| burst-cursor-replay | A backlog of pushed batches reaches the columns in one frame | 10 batches, 1 frame, at both laptop and 4K |
| restart-durable-replay | A cold rebuild at a durable cursor lands on the columns the live push stream produced, and draws the same picture | digest `6:5:1:93eca1d1` on both paths; content centroids within 0.02 |
| navigate-100-workstreams | No task longer than one frame during workstream navigation | 100 switches, longest frame 1.1 ms (laptop) and 0.7 ms (4K) |
| occlusion-transitions | The graph stops entirely while occluded and resumes without a catch-up burst | 0 frames across 4.4 s hidden, scheduler asleep, 85 frames in the 707 ms after resume |
| sustained-activity | 60 s of continuous replay without drift | 10 fixture cycles, heap flat at 9.5 MB, no long tasks |

## 5. Canvas-pixel checks

Every run passed. The check reduces the drawn canvas to a luminance grid that
resolves the *letterboxed reference frame* rather than the canvas, so one set of
thresholds holds from a phone to 6K, and then asserts the content is centred on
the spine, inside the letterbox, and in the live edge's band.

- Content centroid X across all 19 runs: 0.497–0.502 of canvas width.
- Content centroid Y: 0.446–0.790, tracking how much history each fixture has.
- Peak cell luminance: 0.23–0.36 drawn, against 0.02 for a canvas showing only
  the drifting medium — the separation the thresholds are set from.

Blankness is judged on concentration rather than brightness because the medium's
brightest *pixel* (0.44) is as bright as a node's. An absolute pixel threshold
would pass an empty canvas.

## 6. Profile

A separate untimed pass captures a Chromium trace of the 4K interleaved scenario
(tracing costs frame time, so a traced run is not an accepted result):
361,195 events. Over 1,069 frames, `ProxyMain::BeginMainFrame` totals 405 ms
(0.38 ms per frame) and `GPUTask` totals 229 ms. No task in the trace exceeds one
frame except tracing's own `CpuProfiler::StartProfiling` at startup.

## 7. What the measurement found

Three defects, none of which frame time alone would have shown.

1. **The ladder layout kept incremental state across a snapshot replacement.**
   `GraphLadderLayout` keyed its turn ranges on the workstream id, so a
   replacement that kept the id — a resync, a cold replay after restart, a
   reloaded window — left ranges describing the previous snapshot. The soak
   reproduced it as an exception thrown every frame. Fixed: `setSnapshot` resets
   the ladder and the index-derived view focus alongside the packer.
2. **An exception inside the frame loop was invisible to the measurement.** It
   kills that frame and nothing else, so the scenario still reported frames, still
   passed its budgets, and still showed the last good picture. The workflow now
   reads the recorded renderer console and fails on any error.
3. **The quality controller could never hold a tier it earned.** Every frame that
   changed quality re-derived the tier from the viewport, which handed back the
   viewport's starting tier immediately: 894 tier changes in one 1200-frame run,
   each one a geometry rebuild. Fixed by separating the two decisions — a
   viewport change re-derives the tier, everything else only resizes — with the
   surface key now covering the adaptive scale so a scale step actually reaches
   the framebuffers. Tier steps per run fell to 0–2, CPU p95 halved (0.8 → 0.4 ms),
   and the upload mark p95 fell from 0.3–0.4 ms to 0.1 ms.

Fixing (3) surfaced a fourth, because the graph then ran at the `full` tier on
4K and 6K for the first time:

4. **The halftone cell degenerated on capped surfaces.** The dither cell is
   authored in CSS pixels so the dots stay a constant size on screen, but the
   post surface is capped at 3.6 MP: at a 4K viewport it holds 0.66 device pixels
   per CSS pixel, so the cell shrank to about two surface pixels. A cell samples
   the scene once, and with two fragment centres across it every mid-tone dot
   falls between them and is erased — the 4K frame drained to a dim blur with a
   peak cell luminance of 0.05, and the canvas-pixel check called it blank.
   Fixed by flooring the cell at its authored size in surface pixels
   (`graphDitherCellPixels`). Peak cell luminance at 4K returned to 0.30.

No frame-time hitch was found on the primary target.

## 8. Decisions this report records

- **Phone tier.** The matrix required Phase 2 to set the phone tier by
  measurement rather than leave the prototype default implicit. The device-pixel
  clamp of 1.5 stays: at DPR 3 it renders 390 × 844 into a 585 × 1266 post
  surface, which measures 0.98 ms GPU p95 here. That headroom is not evidence for
  raising the clamp, because an emulated phone viewport on an M1 Pro says nothing
  about phone silicon. The clamp is revisited when real hardware exists.
- **Soak length.** The committed scenario runs 60 s. The matrix's ≥ 10 minute
  soak is the same scenario with `--soak-ms 600000`; it is not part of the
  routine workflow because a routine check should not cost ten minutes.

## 9. Release gates

Recorded once, not repeated as blockers:

- **Real 4K, 6K, and phone hardware.** Those tiers are emulated. Emulation
  exercises layout, raster, and GPU cost, not scanout, compositor, or thermal
  behaviour at those resolutions, and not phone silicon at all.
- **The ≥ 10 minute soak** has not been run; the 60 s soak is what this report
  measures.
- **Pre-cutover baseline capture (Phase 0 item 7)** still needs an interactive
  desktop session and is unrelated to this renderer.

## 10. Artifacts

`.recordings/director-graph-renderer-performance/20260725T014701874Z/`
(git-ignored, local to the machine that produced this report):

- `graph-performance.json` — every run, including per-frame deltas and the pixel grids
- `graph-performance-summary.json` — the table above
- `trace-desktop-4k.json`, `profile-desktop-4k.json` — the Chromium trace and its summary
- `tier-*.png` — a screenshot per tier
- `renderer-console.jsonl` — the console the run is asserted to have left clean
