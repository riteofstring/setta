# Cold-Gate Decision Memo: Accept vs Re-architect

Date: 2026-07-16
Status: SIGNED — Option A (owner, 2026-07-17). Fly response still pending;
per condition 3 it will be recorded in the plan when it arrives.

## Decision to make

The Phase 1b cold gate required live proof that a provider-reported `cold`
Sprite actually dropped memory. Two runs show the opposite: reported `cold`
with memory retained. Per the 2026-07-15 amendment, the owner must choose:

- **Option A — accept the provider contract without live cold proof.** Treat
  the docs' definition (cold ⇒ memory dropped, Services restart) as the
  contract, our own behavioral evidence as the monitor, and stop trying to
  observe a real cold transition before beta.
- **Option B — re-architect the memory-loss boundary.** Stop depending on
  the provider's warm/cold distinction entirely; define our own deterministic
  boundary (e.g. periodic forced restarts via checkpoint restore) as the only
  memory-loss event the product acknowledges.
- **Option C — leave Sprites.** Only if A and B are both untenable.

## Evidence

- Phase 1b (2026-07-13): org counters 0/0/11; woken target preserved its
  process (start count 1, heartbeat 598→1207). Server 0.0.1-rc45.
- Soak run (2026-07-14→16): three Sprites individually `cold` from
  17:37:44Z. 12h cohort woken at 13.2h: behaviorally warm (same boot ID).
  24h cohort woken at 28.6h: behaviorally warm (same boot ID).
- 48h cohort woken at 53.5h (2026-07-16T23:07:54Z): behaviorally warm —
  unchanged boot ID, start count 1, heartbeat continued (563 → 576),
  sentinel intact. Experiment complete; org cleaned to 0/0/0. Full results:
  `docs/reports/2026-07-16-sprites-confirmed-cold-soak-final.md`.
- Fly response: **PENDING** (community thread 28288; billing email;
  support plan not yet purchased).
- Docs state cold ⇒ "in-memory state is dropped … starts processes fresh"
  and warn "you can't see the transition."

## What already protects us regardless of the choice

- Rule 19: memory is a cache; everything durable is on disk or
  reconstructible. Nothing in the product is correct only when cold works.
- Rule 24: provider lifecycle labels are hints; recovery and billing
  enforcement use our own signals (sentinels, boot IDs, heartbeats, leases).
- Recovery paths are exercised deterministically via checkpoint restore and
  Service kills (documented process-loss events), independent of real cold.
- Rules 23/26/27: adapter-only provider coupling, provider-exit export, and
  the conformance suite keep the exit one adapter away.

## Residual risk if we accept (Option A)

1. Billing: if "warm" Sprites retain memory for days, warm-pool economics
   and any Fly-side eviction change could alter wake latency and cost
   without notice. Mitigation: Phase 1c measurement + utilization-based
   billing per staff statements; verify against invoices.
2. Semantics drift: Fly may later make `cold` real and aggressive.
   Mitigation: rule 19 already assumes the worst case; our soak harness can
   re-run any time as a regression check.
3. Unknown eviction trigger: we cannot rehearse a true provider-initiated
   cold. Mitigation: checkpoint restore rehearses an equivalent-or-worse
   process-loss event (full FS rollback + reboot).

## Recommendation (draft)

**Option A**, with three conditions:

1. Record the 48h soak result and close the experiment cleanly (org empty).
2. Keep the confirmed-cold soak harness maintained as an on-demand
   regression probe, not a gate.
3. Treat any future Fly statement on cold semantics as documentation to
   record in the plan, not a trigger to rebuild.

Rationale: both product correctness (rule 19) and safety rails (rules 23-27)
are independent of the provider's label accuracy. The only thing live cold
proof would buy is confidence in a behavior we have already engineered not
to rely on.

## Sign-off

- Owner decision: A
- Date: 2026-07-17
- Recorded in setta-cloud-platform-sprites-plan.md progress log: yes
  (2026-07-17 entry on `setta-3-sprites`, the plan of record)
