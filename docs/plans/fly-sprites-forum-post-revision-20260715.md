# Fly forum post — to-do

Thread: https://community.fly.io/t/28288
Rule: no product name, no beta details. Post from the anonymized account.

Done so far: the 12h and 24h wakes ran. Both Sprites kept their original
process despite reporting `cold` for over a day. Only the 48h wake is left.

---

## 1. Edit the post (today)

**New title:**

When is a Sprite actually cold? Mine reported cold but woke with its process still running

**New body:**

I'm testing Sprites for per-user dev environments and got confused by `cold`.

My test Sprite ran a small Service that keeps two counters on disk: how many times the Service has started, and a heartbeat that restarts from zero whenever the Service restarts. I created ten more Sprites (the org's warm limit) and let everything sit idle. The API then said all eleven Sprites were cold:

```
Running: 0, Warm: 0, Cold: 11
```

Then I woke my Sprite. The Service had never restarted: start count still 1, heartbeat continuing where it left off. Its memory had survived. That's a warm resume, but the docs say cold means "in-memory state is dropped".

I've since repeated this with individual status checks: three fresh Sprites that each show `status: "cold"`. I'm waking them one at a time and posting results below.

Questions:

1. Can a Sprite show `cold` while its memory is still intact?
2. Is there any reliable way to tell that memory was actually discarded?
3. Can I force a Sprite cold, for testing?
4. Is per-Sprite usage (CPU/RAM/storage) available via API, and with what delay?

Happy to share Sprite names and timestamps.

**Add at the bottom:**

*Edited for brevity; results from the rerun are in the replies.*

---

## 2. Then post this reply

Update, as promised. Three fresh Sprites sat idle, and all three showed `status: "cold"` the whole time (since 2026-07-14 17:37 UTC). I checked again seconds before each wake.

I woke one after 13 hours cold and another after 28 hours. Both times the original process was still there:

* boot ID unchanged
* Service start count still 1
* heartbeat continued where it left off, not reset

So even after a day of reporting `cold`, memory was never dropped. I'll wake the third Sprite at the 48-hour mark and post that too.

One more detail: `updated_at` never changes after creation, so it doesn't show lifecycle transitions either.

Which leaves the main question: does `cold` mean "scheduled for eviction" rather than "memory is gone"? And if so, what tells me when the memory is actually gone?

---

## 3a. DONE — final 48h result. PASTE this reply now:

Final result for the third Sprite: after ~53.5 hours of continuously reported `status: "cold"` (checked repeatedly without touching it, including seconds before the wake), it also resumed its original process — same kernel boot ID, Service start count still 1, heartbeat continued where it left off, filesystem intact.

So all three Sprites (woken at ~13h, ~28h, and ~53h of reported cold) were memory-preserving resumes. In this org, `cold` never corresponded to an actual memory discard within 2+ days. The questions in the original post stand — happy to share Sprite names, timestamps, and request IDs privately so someone can correlate server-side.

## 3. (superseded) Original 48h wake instructions

```bash
cd /Users/jeff/Documents/_projects/setta.setta-3-cloud-platform
SETTA_LIVE_SPRITES=1 ./scripts/test_sprites_cold_soak.sh verify-due \
  --state /private/tmp/setta-sprites-cold-soak.PU3jQX
SETTA_LIVE_SPRITES=1 ./scripts/test_sprites_cold_soak.sh cleanup \
  --state /private/tmp/setta-sprites-cold-soak.PU3jQX
```

Then post the 48h result as a short reply (same bullets; its baseline heartbeat is 563) and confirm the org is empty.

---

## Notes

- The confirmed-cold gate is still RED: no wake has shown a real cold boot (changed boot ID, counter 2, heartbeat reset). It stays blocked until Fly answers or the owner decides.
- Raw evidence: `/private/tmp/setta-sprites-cold-soak.PU3jQX/` (manifest.json, observations.jsonl) and the reports in the cloud-platform worktree.
- Customer-workload/abuse questions go to billing@fly.io, not the forum (see `fly-sprites-support-inquiry.md`).
