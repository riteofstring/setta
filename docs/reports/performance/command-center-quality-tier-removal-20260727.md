# Command Center Quality Tier Removal — Before/After

Date: 2026-07-27

## Scope

The Phase 1 measurement gate for
`docs/plans/command-center-mockup-fidelity-plan.md`: removing the
viewport-area quality-tier predictor (`graphQualityForViewport` →
`graphStartingQualityProfile`) and keeping `fieldFlow` at the `reduced` tier.

- **Baseline:** `fb4c5c203` (plan doc only; renderer unchanged from `81f0c40ec`)
- **Change:** `8cd7f13d7`

Both revisions were built from source and measured on the same machine in one
session, alternating by restoring the three touched renderer files and running
`pnpm build` between runs.

**This gate did not pass, and it does not pass on the baseline either.** Four
assertions in this workflow are red before the change. What follows separates
what was measured from what remains unmeasured.

## Environment

| Field | Value |
| --- | --- |
| Machine | MacBook Pro, `MacBookPro18,3` |
| Chip | Apple M1 Pro, 8 cores (6 performance, 2 efficiency) |
| Memory | 32 GB |
| OS | macOS 26.5.2, build 25F84, arm64 |
| Display | Built-in, real; window forced to 1512×982 CSS at DPR 2 |
| Runtime | Electron 41.7.0, Node 25.2.1, pnpm 10.23.0 |
| Observed frame budget | 8.33 ms (120 Hz), derived per sample |
| Measurement | Real viewport for the laptop tier; CDP-emulated above it |

## Command

```sh
node desktop/tests/electron/director-command-center-performance.test.mjs \
  --skip-build --keep-artifacts --scenario lifecycle
```

Artifacts: baseline `.recordings/director-command-center-performance/20260727T203951412Z`,
change `.recordings/director-command-center-performance/20260727T204218520Z`.

## Result — laptop tier, lifecycle scenario

| Metric | Baseline `fb4c5c203` | Change `8cd7f13d7` |
| --- | ---: | ---: |
| Post surface | 2268 × 1473 (3.34 MP) | 2268 × 1473 (3.34 MP) |
| Frame delta p50 | 8.3 ms | 8.2 ms |
| Frame delta p95 | 9.3 ms | 9.0 ms |
| Frame delta p99 | 9.4 ms | 9.3 ms |
| Frame delta max | 16.0 ms | 10.1 ms |
| Average FPS | 119.2 | 125.3 |
| Frames over 50 ms | 0 | 0 |
| Long tasks | 0 | 0 |
| Heap peak | 10.11 MB | 10.11 MB |
| Canvas peak luminance | 0.28 | 0.31 |
| Frames sampled | 165 | 153 |

Both hold the 120 Hz budget with margin. The change is equal or slightly better
on every frame-timing metric. The difference is within run-to-run noise for a
single sample and is not claimed as an improvement.

## The finding that corrects the plan

**The post surface is identical on both revisions, at the `full` tier's size.**

At 1512×982 with DPR 2, `graphQualityForViewport` returns `balanced`, whose
2.6 MP post ceiling would produce a 2000 × 1299 surface. The baseline measured
2268 × 1473 — the `full` tier's size — so the baseline was running at `full`
by the end of the scenario.

The mechanism is `GraphQualityController.sample`: once the render scale is at
maximum and GPU time stays under 30 % of the refresh period for eight
consecutive samples, it steps the tier *up*. On this GPU that condition is met
almost immediately, so the baseline climbed `balanced → full` within a fraction
of a second. The existing unit test "recovers the scale before it climbs back to
a richer tier" already proves that path.

So the plan's diagnosis 1 was wrong about the steady state on a fast machine.
It said every ordinary window renders at `balanced` and a large display at
`reduced`. In fact the viewport tier is only a *starting* tier, and a fast GPU
climbs out of it. The corrected account of what the predictor actually cost:

1. **A visible ramp at startup**, while the graph climbs one or two tiers.
2. **A reset on every viewport change.** The baseline's `applyViewport`
   re-derived the starting tier whenever the viewport key changed, so any
   resize knocked an earned `full` back to `balanced` or `reduced` and forced
   the climb again. This is a real repeated regression, and removing it is the
   substantive win in this change.
3. **A permanent downgrade on any GPU that cannot hold under 30 % of the
   refresh period** — where the climb never fires. Not measurable here; this
   machine is far too fast to exercise it.
4. **A frozen background field at `reduced`**, which bit exactly the machines
   in case 3. Fixed independently of the predictor.

The change is still correct — the predictor discarded earned tiers and the
frozen field was a fidelity defect — but its user-visible effect on a fast
machine is a shorter ramp and resize stability, not the large steady-state
fidelity gain the plan claimed.

## Pre-existing failures that block the full gate

Each reproduced on the **baseline**, so none is attributable to this change.

| Assertion | Tier / scenario | Baseline evidence |
| --- | --- | --- |
| Blank graph canvas | `desktop-6k` / one-active-workstream | peak cell luminance 0.0042 (change: 0.0041); identical digest class, both fail |
| Blank graph canvas | `laptop` / navigate-100-workstreams | peak cell luminance 0.0107, lit ratio 0.0029 |
| Best-effort text deltas → DOM churn | `desktop-4k` / text-delta-burst | 414 mutation records, 108 added / 106 removed nodes |
| Long task recorded | `laptop` / occlusion-transitions | one 79 ms task; p50 8.3 / p95 9.2 / p99 9.4 ms otherwise |

The two blank-canvas failures are the pixel-readback heuristic in
`graph-pixel-check.ts`: it judges a cell-averaged luminance, and the halftone
plus the letterboxed fit frame drive the average below
`minimumPeakCellLuminance` even though the brightest pixel reads 0.47–0.55.
That is a defect in either the check or the framing, not evidence of a blank
canvas — but it is out of scope for this plan and is recorded here, not fixed.

## What this measurement does and does not establish

Established:

- The laptop tier holds the 120 Hz budget at `full` with zero long tasks, and
  is no worse than the baseline.
- At `desktop-6k` the change passed `assertSmoothFrameSample`, the DOM budgets,
  and the layout assertions before reaching the pre-existing pixel check —
  the same point the baseline reaches. Running 6K at `full` rather than
  `reduced` did not break the frame budget.

Not established, and still owed:
- **Sustained activity.** The 10-minute GC/thermal scenario was not run; this
  change raises steady-state load on machines that were not already climbing to
  `full`.
- **A slow GPU.** The case where the predictor's downgrade was permanent — and
  therefore where this change matters most — has no hardware here to measure.
- **Tier-change counts.** `GraphFrameSampler` records `tierChanges`,
  `renderScaleMinimum`, and `renderScaleMaximum`, but the workflow summary does
  not surface them. Surfacing them would have made the climb directly
  observable instead of inferred from the post surface size, and is the
  cheapest next instrument to add.

## Addendum — the 4K tier, 2026-07-27

The 4K row was owed because its scenarios sat behind two failures. One of those
(`text-delta-burst`) went green when phase 3 removed the activity cards, so the
tier is measurable now.

```sh
node desktop/tests/electron/director-command-center-performance.test.mjs \
  --skip-build --keep-artifacts --scenario text-delta-burst
```

Artifact: `.recordings/director-command-center-performance/20260727T222818168Z`.
Revision `d29ab018d`. Same machine and environment as section 1.

| Metric | Laptop 1512×982 @2 | Desktop 4K 3840×2160 @1 |
| --- | ---: | ---: |
| Post surface | 2268 × 1473 (3.34 MP) | 2529 × 1423 (3.60 MP) |
| Frame delta p50 | 8.3 ms | 8.3 ms |
| Frame delta p95 | 9.1 ms | 9.1 ms |
| Frame delta p99 | 9.3 ms | 9.3 ms |
| Frame delta max | 9.4 ms | 9.6 ms |
| Long tasks | 0 | 0 |
| Frames over 50 ms | 0 | 0 |
| Canvas pixel check | pass | pass |

Observed budget 8.33 ms at both. The harness thresholds are p95 ≤ 11.2 ms and
p99 ≤ 16.7 ms, so both tiers hold 120 Hz at `full` with margin.

**This is the empirical confirmation phase 1 was reasoning from.** The change
removed the viewport predictor on the argument that the profile's own ceilings
already equalise GPU cost above the laptop tier, so viewport area could not
predict load. 4K lands on the 3.60 MP post ceiling rather than its native
8.29 MP, and its frame timing is identical to the laptop's to within 0.2 ms at
the maximum. Cost did not move with the viewport, exactly as
`setta-4-target-performance-matrix-20260724.md` section 3.1 said it would not.

A parent-revision A/B is no longer isolable at this tier: phases 2–5 landed on
top of the phase 1 commit, so a rebuild of `fb4c5c203` would measure five
changes rather than one. The question the gate owed — does `full` hold the
observed refresh period at 4K — is answered by this run alone.

Still owed after this addendum: the 6K tier as a *timing* measurement (its
scenario passes but was not sampled for frame stats here), the 10-minute
sustained-activity scenario, and hardware slow enough to exercise the case the
change most affects.
