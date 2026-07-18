# Sprites-Alternatives Deep-Research Prompt

Date: 2026-07-15
Status: Ready to use; not yet run

Prompt for an external deep-research session (e.g. ChatGPT Pro) to sweep the
managed sandbox/VM market for feature and price parity with Fly.io Sprites.
Deliberately anonymized: no product name, beta size, or internal budget
details beyond the public-style $25/user envelope. Baseline numbers come from
`docs/reports/2026-07-14-cloud-runtime-provider-options.md`, the Phase 1a/1c
Sprites evidence, and the 2026-07-15 pricing checks; the prompt asks the
researcher to re-verify all of them.

When the report comes back, save it under `docs/reports/` as a dated
external-research artifact and review it against the internal evidence before
acting on it.

## Prompt (copy everything inside the fence)

```text
# Research request: managed sandbox/VM providers for per-user persistent
# cloud dev environments — feature and price parity with Fly.io Sprites

## Context (confidential)

We're a two-person team building a desktop + mobile developer product. Each
user gets a persistent cloud Linux workspace — "their computer in the cloud" —
running interactive terminals, dev-server previews, and AI coding-agent runs.
Users never see infrastructure: no provider accounts, regions, machine types,
or start/stop buttons. The workspace must feel local: open the app and type;
the runtime wakes automatically. Users are in North America initially, so
US/Canada regions are required; EU is nice to have. No GPU needed.

## Hard requirements (score every candidate against these, 1–9)

1. One durable environment per user, retained for months, mostly idle.
   Filesystem persists across sleep/wake indefinitely.
2. Automatic or API-driven sleep on idle and wake on access. Wake target:
   p50 ≤ 35s, p95 ≤ 60s from stopped to usable; sub-5s resume is a major
   advantage. Memory preservation across sleep is a bonus, not required —
   filesystem durability is required.
3. Agent runs continue for hours with all clients disconnected, so hard
   session-length caps are a problem unless pause/resume transparently
   extends them.
4. Either authenticated preview URLs/ports, or support for tunneling all
   traffic out through our own gateway via an outbound connection from an
   agent process inside the environment.
5. Untrusted, potentially root-capable user code — hardware-grade isolation
   per user (Firecracker/microVM/dedicated VM). Shared-kernel container
   isolation is disqualifying.
6. Enforceable outbound egress policy (domain allowlists) that code inside
   the environment cannot bypass — enforced below/outside the guest.
7. Programmatic lifecycle API (REST or Go SDK preferred): create, wake,
   sleep, stop, destroy, snapshot/restore or filesystem export (we need an
   off-provider backup/exit path), and a hard "stop compute now" that works
   within 60 seconds even against a hostile busy process.
8. Per-resource usage/billing observability via API or export, with a stated
   reporting delay.
9. Disk ≥ 20 GB per user (repos + toolchains); 50–100 GB is better.

## Budget and pricing scenarios

Target: ~$25/month per user in provider cost, all-in. Price these four
profiles for EVERY candidate, assuming a 2 vCPU / 4 GB active shape:

- P1 "retained idle": 0 active hours, 20 GB stored, full month.
- P2 "moderate": 60 h active compute + 120 h attached-but-idle (connection
  open, ~0–5% CPU) + 20 GB stored.
- P3 "heavy": 120 h active + 200 h attached-idle + 40 GB stored.
- P4 "failure case": environment accidentally left running 24/7 at near-idle
  CPU for a month. What does the stuck month cost? Flag any provider where
  P4 exceeds ~$50 — billing-model robustness matters as much as the happy
  path.

Include platform/base fees amortized at 20 users and at 100 users.

## The benchmark: Fly.io Sprites (sprites.dev)

This is the feature/price combination we want parity with: usage-metered
billing (actual CPU via cpu.stat at $0.07/CPU-hr, actual RAM at
$0.04375/GB-hr, small metering minima ≈ $0.015/hr floor), hot storage
$0.50/GB-mo, cold $0.02/GB-mo, scale-to-zero with a persistent ~100 GB
filesystem, wake-on-URL with auth gating, per-user microVM isolation,
host-enforced domain egress policy the guest cannot bypass, checkpoints,
~1 s suspend. Its weaknesses — why we're looking — are maturity (the server
is a release candidate), no documented per-environment usage/billing API,
ambiguous suspended-vs-cold lifecycle observability, and Fly's mixed
reliability history. Verify these claims too; they may have changed.

## Already evaluated — verify current state, don't re-tread basics

E2B (provisioned-shape billing ~$0.0504/vCPU-hr + $0.0162/GiB-hr, $150/mo
Pro, 24 h session cap, 20 GiB disk cap, pause preserves FS+memory, resume
~1 s); Daytona (similar rates; VM pause/fork announced July 2026, very new);
Modal (architecture mismatch — not one durable computer); Runloop (pricier;
suspend requires $250/mo tier); Cloudflare Containers/Sandbox (disk erased
on sleep); Vercel Sandbox (ephemeral); Northflank sandboxes (cheap listed
rates, snapshot/hibernation semantics unverified); Morph Cloud (Infinibranch
memory snapshots/branching, MCU-based pricing, opaque rates); Together Code
Sandbox / CodeSandbox SDK (hibernate + ~0.5 s resume, operationally proven
fleet, ~$0.15/hr credit pricing, mid-acquisition into Together AI); Upstash
Box (active-CPU-only metering — excellent billing model — but shared-kernel
container isolation, launched weeks ago, us-east-1 only, Node-only SDK).

## Deliverables

1. A sweep for candidates we may have missed, including lesser-known and
   recently launched ones (e.g. Freestyle, Namespace.so, Beam, Koyeb,
   Unikraft Cloud, Blaxel, Gitpod/Ona, Depot, and anything shipped in the
   last 12 months). Include ONE reference row for DIY Firecracker on cheap
   bare metal (Hetzner/OVH/Latitude) for cost calibration, but managed
   offerings are the priority.
2. For each serious candidate: an evidence table against requirements 1–9,
   citing primary sources (pricing pages, docs, changelogs, status pages)
   with access dates. Distinguish documented behavior from marketing claims.
3. P1–P4 pricing per candidate, with the P4 flag.
4. Reliability: 12-month status-page incident history, SLA scope, company
   maturity/funding signals.
5. A ranked top-3 shortlist with the specific kill-questions a 1-week
   hands-on probe should answer for each, and what evidence would
   disqualify it.
6. An explicit statement of where Sprites remains unmatched, and the
   closest single alternative on (a) economics, (b) isolation + egress,
   (c) operational maturity.

Throughout: date every price, and for each provider state explicitly whether
billing is usage-metered (actual consumption) or provisioned-shape (wall
clock × allocated size) — that distinction is the crux of this comparison.
```
