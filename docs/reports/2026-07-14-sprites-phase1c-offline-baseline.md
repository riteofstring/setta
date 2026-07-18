# Sprites Phase 1c Offline Capacity and Cost Baseline

Date: 2026-07-14
Status: **PARTIAL — offline accounting foundation passes; live capacity and bill reconciliation remain gated**

## Scope and safety boundary

This increment advances only the parts of Phase 1c that do not require the live
Sprites organization. That organization is reserved for the independent
12/24/48-hour confirmed-cold soak. No workload, URL, exec, Service, pressure,
capacity, or billing-probe request was sent to it for this work.

This report does not close Phase 1c, does not waive the Phase 1b cold gate, and
does not call published-rate arithmetic a measurement.

## Authoritative-usage surface audit

As observed on 2026-07-14:

- The [public rate card](https://sprites.dev/) defines CPU as cumulative usage
  measured by `cpu.stat`, memory as actual usage, and hot/cold storage in
  GB-hours. It publishes $0.07/CPU-hour, $0.04375/GB-hour,
  $0.000683/hot-GB-hour, and $0.000027/cold-GB-hour.
- The [documented API categories](https://docs.sprites.dev/api/dev-latest/)
  cover Sprites, checkpoints, control, exec, filesystem, policy, ports, proxy,
  and Services. They do not list usage, billing, cost, or metrics.
- A source audit of pinned `sprites-go`
  `v0.0.0-20260706200727-0d0f37d154bd` found no billing, usage, cost, or metering
  client surface.
- The lifecycle documentation says compute billing stops in `warm` and that
  storage is billed for bytes written, but it does not expose a per-Sprite bill
  or reporting-lag contract.

Conclusion: Setta currently has no documented machine-readable,
provider-authoritative per-Sprite usage/cost observation to integrate. There
may be provider-side or dashboard data outside the documented API, so a Fly
support inquiry and later bill reconciliation remain required. Reporting lag
cannot be measured until such a source is identified.

## Implemented accounting boundary

The offline implementation adds two deliberately separate concepts:

1. `runtimeprovider.UsageObservation` records provider-neutral evidence with an
   explicit basis: `provider_authoritative` or `setta_conservative`.
2. `runtimecost.Estimate` applies an immutable provider rate card to that
   evidence using integer base units and micro-US dollars.

The important safety properties are:

- An explicit coverage list distinguishes a measured zero from an unavailable
  metric.
- The optional `UsageObserver` interface is separate from the lifecycle
  `Provider`; a working lifecycle adapter does not falsely imply billing API
  support.
- CPU uses core-microseconds; memory and storage use byte-seconds. Cost
  arithmetic uses integer rational math and rounds each non-zero line upward.
- A provider mismatch, invalid observation, overflow, or covered dimension
  without a published rate fails loudly.
- Sprites' CPU and memory billing minima are rate-card pricing rules. For
  Setta-conservative evidence, cost uses at least those billed quantities even
  when an enforced ceiling is smaller.
- Setta-conservative retained storage is priced entirely at the hot rate. Cold
  usage is accepted only from separate provider-authoritative evidence, not a
  lifecycle status or manually asserted classification.
- Egress ceilings are bytes-per-second rates integrated over both the current
  window and the maximum cutoff lag; a fixed byte count is not reused as future
  exposure.
- The Sprites rate card owns only its published CPU, memory, hot-storage, and
  cold-storage rates. Checkpoint storage and egress remain unavailable rather
  than being silently priced at zero.

Focused tests reproduce the public Claude-session example at $0.445240 before
display rounding and the Phase 1a continuous minimum compute floor at
$11.178125 for 730 hours.

## Reproducible published-rate baseline

These figures are arithmetic scenarios, not observed bills. Decimal GB units
match the provider card.

| Scenario | Assumption | Compute | Storage | Published-rate subtotal |
| --- | --- | ---: | ---: | ---: |
| Retained cold | 20 GB cold for 730 h | $0 | $0.3942 | **$0.3942** |
| Active minimum floor | 6.25% CPU + 0.25 GB for 1 h | $0.0153125 | — | **$0.0153125/h** |
| Attached-idle proxy | 6.25% CPU + 1 GB for 120 h | $5.7750 | $0.3942 cold baseline | **$6.1692** |
| Forgotten active | minimum floor for 730 h | $11.178125 | $0.3942 cold baseline | **$11.572325** |
| Light active work | 1 CPU + 2 GB for 60 h | $9.4500 | not modeled | **$9.4500 + storage** |
| Heavy active work | 2 CPU + 4 GB for 120 h | $37.8000 | not modeled | **$37.8000 + storage** |
| Hot-storage extreme | 20 GB hot for 730 h | $0 | $9.9718 | **$9.9718** |

The attached-idle row preserves the Phase 1a one-GB assumption; it is not a
claim about observed memory. Subscription fees/credits, checkpoint retention,
bandwidth, gateway cost, support margin, tax, and reporting lag are excluded.

## Hard-cutoff finding

Elapsed active time at Sprites' minimum billable floor is a lower bound, not a
safe dollar ceiling. A Sprite may use up to eight CPUs and provider-managed
memory can grow under pressure. Setta therefore cannot claim a conservative
upper cost bound from active duration alone.

A defensible hard budget needs both:

1. trusted Setta accounting based on enforced CPU, memory, storage, and network
   ceilings, with attached-idle and workload-lease durations sourced from
   trusted gateway and lease events; and
2. later reconciliation against provider-authoritative usage/cost with a
   measured reporting lag.

The Phase 1a suspend result still demonstrates a roughly one-second
non-destructive compute stop and fits the provisional 60-second cutoff-lag
budget. It does not prove that Setta can calculate the trigger accurately.
Until trusted cgroup limits and accounting are part of the runtime, the product
must use a conservative elapsed-time allowance with substantial safety margin
and treat the $25/user/month threshold as provisional.

The resilience side plan subsequently implemented the provider-neutral,
restart-safe accounting and cutoff evaluator offline. It persists expiring
workload leases, treats provider exposure independently from attachments, and
constructs maximum-cutoff-lag exposure internally from explicitly enforced
whole-runtime bounds. Sprites creation still does not request and attest a fixed
whole-runtime CPU/memory shape, so this proves the evaluator—not a live Sprites
hard-dollar ceiling. See
`docs/plans/cloud-runtime-resilience-side-plan.md` and
`docs/plans/phase1c-live-measurement-runbook.md`.

## Remaining live measurement matrix

Run this only after the soak releases its organization or in another explicitly
authorized disposable organization:

| Measurement | Required evidence |
| --- | --- |
| Provider reconciliation | Before/after authoritative usage or invoice export for isolated controlled windows; record first visibility and final-settlement lag |
| Warm/cold wake | Behaviorally proven process-preserving warm and memory-dropping cold; do not use status labels alone |
| Activity classes | Trusted timestamps for open attachment without Task, active Task, ordinary exec, preview traffic, and post-disconnect suspend |
| CPU and memory | Trusted child-cgroup counters under enforced ceilings; compare integrated values with provider usage |
| Storage | Allocated/written bytes, delete/TRIM behavior, hot/cold classification, and provider charge over time |
| Checkpoints | Incremental bytes and retained charge for identical, small-delta, and large-delta checkpoints |
| Gateway/network | Ingress and egress bytes at both Setta and provider boundaries, plus any separate gateway charge |
| Fixed-shape capacity | One agent, proposed concurrent agents, terminals, builds, previews, disk pressure, and noisy-neighbor effects |
| Placement/latency | Identical interactive flows from intended beta geographies with provider placement evidence |
| Cutoff | Hostile keepalive at the enforced ceiling; decision-to-compute-stop lag and worst-case extra spend |

The output must include raw timestamped observations, rate-card version,
provider bill snapshots, assumptions, missing dimensions, and cleanup proof.

## Exit assessment

The provider-neutral accounting seam and exact published-rate model are ready
for the live evidence. Phase 1c remains open because authoritative cost data,
reporting lag, trusted resource ceilings, capacity, placement, latency,
checkpoint cost, bandwidth, subscription allocation, and actual provider bill
reconciliation are not yet measured.
