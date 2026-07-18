# Phase 1c Live Measurement Runbook

Date: 2026-07-14
Status: Prepared; not authorized or executed

## Purpose

Collect the live evidence still required by Phase 1c after the confirmed-cold
soak releases its organization, or in a separately authorized disposable
organization. This runbook never treats the provider's `running`, `warm`, or
`cold` labels as behavioral proof.

The local accounting command is `cmd/setta-runtime-accounting`. It accepts no
provider token and makes no network calls. It consumes a strict configuration,
an append-only JSONL event file, and an absolute state path. A prefix can be
applied before restart; the full stream can later be replayed idempotently and
finalized into identical evidence.

## Authorization prerequisites

Before any live run, record all of the following in the run manifest:

- explicit owner approval for the disposable organization and maximum spend;
- organization name, deterministic runtime prefix, intended geography, start
  deadline, and cleanup deadline;
- provider API/server, CLI, SDK, Setta commit, runtime build, and rate-card
  versions;
- current running/warm limits and proof the organization contains no unrelated
  resources;
- the exact whole-runtime CPU and memory shape requested and returned. If
  Sprites still cannot request and attest a fixed whole-runtime shape, cost
  results remain measurements rather than enforceable upper bounds;
- provider bill or invoice-export access and the responsible observer;
- a stop condition for unexpected spend, provider errors, unrelated resources,
  missing cleanup authority, or evidence corruption.

Never use the active cold-soak organization concurrently.

## Raw evidence

Retain append-only, UTC/monotonic-correlated observations for:

| Boundary | Required observation |
| --- | --- |
| Provider exposure | possible-wake start and confirmed compute-stop end; status labels are supplementary |
| Attachments | authenticated gateway/terminal/preview connection open and close IDs |
| Workload lease | authoritative acquired, renewed, released, and persisted expiry values |
| CPU | whole-runtime `cpu.stat` deltas and child-workload deltas, clearly separated |
| Memory | whole-runtime current, peak, events, enforced maximum, and child-workload values |
| Storage | logical and allocated bytes before/after write, delete, TRIM, suspend, warm, and confirmed-cold windows |
| Checkpoints | checkpoint IDs, creation latency, unchanged/small/large delta sizes, retention interval, and deletion |
| Network | gateway ingress/egress and provider-billed bytes if available; never log URLs containing credentials |
| Latency | create, warm wake, behaviorally confirmed cold wake, exec, terminal echo, preview, suspend, and reconnect |
| Billing | before, first-visible, and final-settled provider snapshots with source and timestamp |

The provider-exposure interval begins before the operation that may wake
compute and ends only after compute stop is behaviorally or authoritatively
confirmed. Disconnecting an attachment or releasing a workload lease does not
end provider exposure by itself.

## Workload cohorts

Run each cohort in isolation before combining them:

1. retained filesystem with no compute;
2. attached idle with no workload lease;
3. bounded agent-like work under a renewable workload lease;
4. terminal plus build;
5. terminal, build, and authenticated preview;
6. disk growth/deletion and checkpoint deltas;
7. hostile keepalive at the proposed whole-runtime ceiling followed by budget
   cutoff;
8. proposed beta concurrency, increasing only after the single-runtime cohort
   is clean.

Use the same repository fixture and command sequence for capacity and geography
runs. Record contention, throttling, disk pressure, provider errors, and every
retry. Do not add an automatic scheduler.

## Restart-safe live driver

Create the state directory outside Git, generate the offline manifest, and
fill every blank authorization field plus the `before` billing placeholder:

```sh
state="$(mktemp -d "${TMPDIR:-/tmp}/setta-sprites-phase1c.XXXXXX")"
./scripts/test_sprites_live_measurement.sh init-manifest \
  --state "${state}" --prefix phase1c-owner-approved --concurrency 1
```

After owner authorization, use `prepare`, each explicit `measure-<cohort>` in
the workload-cohort order above, `observe`, and `cleanup`. Set
`SETTA_LIVE_SPRITES=1` only for those live phases. The driver does not schedule
cohorts automatically. It refuses a later cohort until every earlier cohort is
measured and its deterministic resources are confirmed absent.

The state directory contains an atomic, versioned `manifest.json` and an
append-only, fsynced `observations.jsonl`. To add Cost Explorer evidence, fill
the `first-visible` or `final-settled` billing placeholder in the manifest and
run `observe`; source, UTC observation time, and a secret-free artifact path
are required. Provider status records are named
`provider_status_supplementary` and are never used as behavioral or billing
proof.

The provider-neutral lifecycle contract does not expose authoritative
checkpoint delta bytes, provider-billed network bytes, or suspend. The driver
keeps the previously proven raw suspend endpoint measurement-only, records the
available Setta-boundary values, and emits explicit missing observations
instead of treating provider labels or zero values as proof.

## Local accounting workflow

The strict configuration selects the immutable
`sprites-public-2026-07-14` rate card, the managed runtime name, a half-open
measurement window, whole-runtime enforced ceilings, required priced
dimensions, the covered micro-USD limit, safety reserve, and maximum cutoff
lag. Egress is configured as an enforced bytes-per-second ceiling so cutoff-lag
exposure scales with time. Setta-conservative retained bytes are always priced
as hot; only a separate provider-authoritative observation may report cold
usage, and a provider status label is not authoritative billing evidence. The
Sprites rate card applies its CPU and memory billing minima as pricing rules in
addition to the enforced resource ceilings.

Apply an event prefix safely:

```sh
./scripts/go.sh run ./cmd/setta-runtime-accounting \
  --config /absolute/run/config.json \
  --events /absolute/run/events-prefix.jsonl \
  --state /absolute/run/accounting-state.json
```

After the window is complete, replay the full stream and finalize:

```sh
./scripts/go.sh run ./cmd/setta-runtime-accounting \
  --config /absolute/run/config.json \
  --events /absolute/run/events.jsonl \
  --state /absolute/run/accounting-state.json \
  --finalize \
  --out /absolute/run/evidence.json
```

The command refuses changed replayed events, sequence gaps, unknown JSON fields,
unpriced required dimensions, unenforced required bounds, invalid windows, and
unsafe budget policies. State and evidence are written through synced temporary
files and atomic rename.

## Reconciliation and exit

For each cohort, compare Setta's conservative covered subtotal with the
provider-authoritative CPU, memory, storage, checkpoint, and network lines.
Record first-visibility and final-settlement lag separately. Allocate plan fees
and included credits only after raw resource reconciliation.

The live run passes only when:

- every runtime and checkpoint is destroyed and absence is verified;
- provider billing has settled for the declared observation window;
- required dimensions reconcile within a predeclared tolerance or the
  discrepancy has a provider-confirmed explanation;
- the worst-case cutoff completes inside 60 seconds and projected additional
  spend fits the safety reserve;
- raw artifacts, assumptions, missing dimensions, and cleanup proof are stored
  without secrets;
- the measured package, including subscription allocation, gateway, support
  margin, and retained storage, fits the provisional $25/user/month beta cap.
