# Sprites Confirmed-Cold Soak: Final Results

Date: 2026-07-16
Status: COMPLETE — all three cohorts verified, all resources destroyed, org empty
Run: `20260714T173244Z-97151` (see the 2026-07-15 interim report for setup)

## Results

All three targets individually reported `status: "cold"` continuously from
`2026-07-14T17:37:44Z` (confirmed by repeated non-waking management reads,
including a final read seconds before each wake). Each was woken once with a
single exec:

| Cohort | Woken at | Idle at wake | Boot ID | Start count | Heartbeat | Sentinel | Classification |
| --- | --- | ---: | --- | ---: | --- | --- | --- |
| 12h | 2026-07-15T06:52:20Z | ~13.2h | unchanged | 1 | 565 → 577 (continued) | intact | behaviorally warm |
| 24h | 2026-07-15T22:12:59Z | ~28.6h | unchanged | 1 | 567 → 580 (continued) | intact | behaviorally warm |
| 48h | 2026-07-16T23:07:54Z | ~53.5h | unchanged | 1 | 563 → 576 (continued) | intact | behaviorally warm |

## Conclusion

Within this organization and observation window (server 0.0.1-rc46), the
per-Sprite `status: "cold"` field did not correspond to an actual memory
discard at any point up to 53.5 hours of uninterrupted idle. Every wake was a
memory-preserving resume. The provider's `cold` label describes something
other than "in-memory state has been dropped" — the documented definition.

Additional field observation: each Sprite's `updated_at` never changed after
creation, so it does not reflect lifecycle transitions either.

The Phase 1b confirmed-cold gate therefore remains unobservable rather than
failed: no behavioral cold wake was available to verify against. Per the
2026-07-15 build-while-blocked amendment, resolution moves to the owner
decision memo (`docs/plans/sprites-cold-gate-decision-memo.md`) and Fly's
answer on community thread 28288.

## Cleanup

All three targets destroyed and verified absent after their wakes; the ten
pressure Sprites were destroyed on 2026-07-14. Final organization state:
0 running / 0 warm / 0 cold. Raw evidence (manifest.json, observations.jsonl)
remains outside Git at `/private/tmp/setta-sprites-cold-soak.PU3jQX`.
