# Setta 4 Target Performance Matrix

Date: 2026-07-24

## Scope

This closes item 8 of Phase 0 in
`docs/plans/setta-4-director-command-center-plan.md`: the target performance
hardware, display, viewport, and device-pixel-ratio matrix.

It defines *what must be measured and on what*. It is not a measurement. The
pre-cutover baseline capture (Phase 0 item 7) is a separate release gate,
already recorded in
`docs/reports/setta-4-phase0-ownership-inventory-20260724.md`, section 5.

Every performance report written for Setta 4 states which tier and which row of
section 3 it ran, and re-records the environment fields in section 1 from the
machine that produced it. Reports do not copy this document's environment block
forward.

## 1. Target hardware

### 1.1 Primary target (development and acceptance)

Recorded on 2026-07-24 from `sw_vers`, `uname -m`, and `system_profiler`:

| Field | Value |
| --- | --- |
| Machine | MacBook Pro, `MacBookPro18,3` |
| Chip | Apple M1 Pro, 8 CPU cores (6 performance, 2 efficiency) |
| GPU | Apple M1 Pro, 14 cores, Metal 4 |
| Memory | 32 GB |
| OS | macOS 26.5.2, build 25F84, arm64 |
| Display | Built-in Liquid Retina XDR, 3024×1964 native, ProMotion adaptive up to 120 Hz |
| Runtime | Electron 41.7.0, Node 25.2.1, pnpm 10.23.0 |

This is the machine the 120 Hz budgets must hold on. It is also the only real
display available to the project today: no external 4K, 6K, ultrawide, or phone
hardware is attached.

### 1.2 Display refresh

ProMotion is adaptive, so the frame budget is derived per sample rather than
assumed. Two existing mechanisms already do this and stay authoritative:

- `desktop/tests/electron/performance-frame-budget.mjs` resolves the budget from
  an explicit option, then the sample's observed budget, then `p50 ≤ 10 ms →
  8.33 ms` else `16.67 ms`.
- The mockup derives the refresh period from the shortest observed frame delta
  and drives its adaptive render scale from it (mockup lines 1035–1046).

Any report that cannot state the observed refresh period is incomplete.

## 2. Frame budget

At 120 Hz one frame is 8.33 ms. The plan's budgets, treated as end-to-end
interaction budgets:

| Budget | Target |
| --- | --- |
| Main-thread frame work | ≤ 2 ms at p95 during steady animation |
| GPU frame time | ≤ 4 ms at p95 during steady animation |
| Work proportional to total history during interaction | none |
| Task longer than one frame during workstream navigation | none |
| Shader compile, large allocation, or texture upload on an interaction path | none |

The committed harness thresholds stay in force and are the pass/fail assertions
(`performance-frame-budget.mjs`):

| Assertion | Threshold |
| --- | --- |
| p95 frame delta | ≤ 1.35 × budget |
| p99 frame delta | ≤ 2 × budget |
| Slow frames (≥ 1.25 × budget) | ≤ 8 % of frames |
| Renderer long tasks | 0 |
| Frames over 50 ms | 0 |
| Minimum frames per sample | 20 |

Report p50, p95, and p99. Average FPS is not an acceptance metric.

## 3. Viewport and device-pixel-ratio matrix

Tiers are the required measurement points. "Real" means the primary display;
"emulated" means `Emulation.setDeviceMetricsOverride` through CDP, which
exercises layout, raster, and GPU cost but not real scanout at that resolution.

| Tier | Logical viewport | DPR | Backing pixels | How measured |
| --- | ---: | ---: | ---: | --- |
| Phone | 390 × 844 | 3 | 1170 × 2532 (2.96 MP) | Emulated |
| Phone, existing workflow | 390 × 700 | 1 | 390 × 700 (0.27 MP) | Emulated; current `mobile-layout` convention |
| Laptop (primary) | 1512 × 982 | 2 | 3024 × 1964 (5.94 MP) | Real |
| Harness standard | 1440 × 900 | 1 | 1440 × 900 (1.30 MP) | Emulated; existing E2E convention |
| Desktop 4K | 3840 × 2160 | 1 | 3840 × 2160 (8.29 MP) | Emulated; `viewport4k` already exists |
| Desktop 6K | 6016 × 3384 | 1 | 6016 × 3384 (20.36 MP) | Emulated |

The pane-era ultrawide viewport (12000 × 900) is retired with the pane shell and
is not a Setta 4 tier.

### 3.1 Initial quality tiers

The mockup's two-pass pipeline gives concrete starting clamps: a device-pixel
clamp of 1.5 for the canvas, a 3.6 MP ceiling on the post/dither pass, a 2.3 MP
ceiling on the scene pass, and an adaptive render scale in `[0.4, 1]` driven by
GPU timer queries against the measured refresh period (mockup lines 830–847,
1035–1046).

Applying that pipeline to the matrix:

| Tier | Post pass | Scene pass |
| --- | ---: | ---: |
| Phone 390 × 844 @3 | 585 × 1266 (0.74 MP) | 585 × 1266 (0.74 MP) |
| Phone 390 × 700 @1 | 390 × 700 (0.27 MP) | 390 × 700 (0.27 MP) |
| Laptop 1512 × 982 @2 | 2268 × 1473 (3.34 MP) | 1882 × 1222 (2.30 MP) |
| Harness 1440 × 900 @1 | 1440 × 900 (1.30 MP) | 1440 × 900 (1.30 MP) |
| 4K 3840 × 2160 @1 | 2530 × 1423 (3.60 MP) | 2022 × 1137 (2.30 MP) |
| 6K 6016 × 3384 @1 | 2529 × 1423 (3.60 MP) | 2022 × 1137 (2.30 MP) |

Two consequences to carry into Phase 2:

1. Above roughly the laptop tier the ceilings hold GPU cost nearly constant, so
   4K and 6K cost the same as each other and differ only in sharpness. Scaling
   beyond 6K is a legibility question, not a frame-time question.
2. At DPR 3 the 1.5 clamp renders the phone tier at half device resolution. That
   is a prototype default, not a product decision. Phase 2 must set the phone
   tier by measurement and record the chosen tier in the report.

These values are the starting point required by the plan's "clamp device pixel
ratio or render scale through explicit quality tiers". Phase 2 confirms or
replaces them; it may not leave them implicit.

## 4. Scenario coverage

The plan's required scenarios, mapped to the tiers each must run at.

| Scenario | Required tiers |
| --- | --- |
| One active workstream | Laptop, harness standard, phone |
| Interleaved Director and worker activity | Laptop, 4K |
| Navigation among 100 workstreams | Laptop, 4K |
| Large history compaction boundary | Laptop |
| Approval or artifact arriving during animation | Laptop |
| Cancellation, failure, retry, recovery | Laptop |
| Restart and durable replay | Laptop, harness standard |
| Phone-sized viewport at realistic DPR | Phone @3, phone @1 |
| Desktop 4K and 6K | 4K, 6K |
| Sustained activity exposing GC or thermal degradation | Laptop, ≥ 10 minutes continuous |
| Foreground/background and occlusion transitions | Laptop |
| Burst pushed-event batches and cursor replay (Phase 2 item 7) | Laptop, 4K |

## 5. Required report fields

Each append-only report under `docs/reports/performance/` records:

- hardware, GPU, memory, OS build, architecture (section 1 fields, re-measured)
- display identity and the **observed** refresh period for the sample
- tier name, logical viewport, device pixel ratio, post and scene pass sizes
- build identity: source revision, Electron/Node/pnpm versions, build command
- scenario, workload parameters, and the exact command line
- measurement method, including whether the viewport was real or emulated
- CPU frame time p50/p95/p99 and maximum
- GPU frame time p50/p95/p99 where timer queries are available
- long-task count and total, frames over 50 ms, slow-frame ratio
- render-scale distribution and any quality-tier changes during the sample
- CPU marks for projection, packing, buffer upload, and draw submission
- canvas-pixel check result (nonblank, correct framing)
- memory behavior across the sample
- artifact directory under `.recordings/`

## 6. Capability gaps to close

| Gap | Impact | Owner |
| --- | --- | --- |
| No E2E workflow has ever set `deviceScaleFactor` above 1 (all 16 uses are `1`) | The DPR tiers in section 3 are unmeasurable today | Phase 2 harness work |
| No GPU timer-query sampling exists in the repo; the mockup is the only user of `EXT_disjoint_timer_query_webgl2` | The 4 ms GPU budget has no instrument | Phase 2 item 6 |
| The only renderer frame sampler and performance-report writer live in `workspace-layout/`, inside the Phase 5 deletion scope | Measurement disappears with the pane shell unless rehomed first | Inventory section 3.5 |
| `topic-conversation-performance-driver.js` asserts on pane DOM selectors | Its sampling survives the cutover but its assertions do not | Retarget in the shell replacement change |
| No external 4K, 6K, or phone hardware | Those tiers stay emulated | Release gate below |

## 7. Release gates

Recorded once, not repeated as blockers:

- **Pre-cutover baseline capture (Phase 0 item 7).** Needs an interactive
  Electron session on the primary display at a real refresh rate.
- **Real 4K/6K display measurement.** Emulated viewports do not prove scanout,
  compositor, or thermal behavior at those resolutions.
- **Real phone hardware.** The phone tier is emulated until a device client
  exists.
