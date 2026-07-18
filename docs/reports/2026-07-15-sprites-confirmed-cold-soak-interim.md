# Sprites Confirmed-Cold Soak: Interim Handoff

Date: 2026-07-15  
Status: **IN PROGRESS — preparation passed; behavioral wake results are pending**

## Purpose

This experiment tests whether Fly Sprites' provider-reported `cold` state
actually means that process memory has been discarded. An earlier Phase 1b
run proved that a Sprite could report `cold` while its original Service process
and heartbeat remained preserved. Provider status is therefore recorded as
evidence but is not accepted as proof of cold behavior.

The experiment uses three independent target cohorts. Each target remains
untouched until its one behavioral wake at 12, 24, or 48 hours after a common
provider-reported-cold epoch. Waking a target ends its uninterrupted idle
period, so separate targets are required for the three durations.

Source plan:
`docs/plans/sprites-confirmed-cold-soak-test-plan.md`.

## Live run identity

- Run ID: `20260714T173244Z-97151`
- External state directory:
  `/private/tmp/setta-sprites-cold-soak.PU3jQX`
- Manifest schema: `1`
- Provider API: `v1`
- Pinned Go SDK:
  `github.com/superfly/sprites-go v0.0.0-20260706200727-0d0f37d154bd`
- Sprite CLI: `v0.0.1-rc45`
- Live Sprite server: `0.0.1-rc46`
- Organization: `setta-100`
- Observed limits: 10 running, 10 warm
- Initial organization state: zero running, warm, and cold Sprites

The state directory contains an atomic versioned `manifest.json` and an
append-only, fsynced `observations.jsonl`. It contains no credentials or raw
persistence-sentinel material.

## Implemented test surface

The restart-safe command surface is:

```text
prepare --state <temporary-directory>
observe --state <temporary-directory>
verify-due --state <temporary-directory>
cleanup --state <temporary-directory>
```

Every invocation reloads and validates the manifest, reconstructs exact
deterministic ownership labels, and re-inspects a Sprite before mutation or
deletion. No local process, terminal, websocket, proxy, preview, HTTP
connection, or scheduler remains open during the soak.

The dedicated Service fixture records under
`/home/sprite/.setta/cold-soak/`:

- a random, read-only persistence sentinel whose SHA-256 digest is retained in
  the manifest;
- an atomic monotonic Service start counter;
- an append-only, durably flushed start history with UTC start time, Linux boot
  ID, and process ID;
- an atomic heartbeat that resets to zero on every Service start and updates
  every 100 ms while compute is running.

The harness classifies a wake as confirmed cold only when the sentinel is
unchanged, the start counter increases from one, a new history entry has a
different boot ID, the captured heartbeat is below the pre-idle baseline, and
the Service becomes healthy within 60 seconds. Preserved process identity and
a continuing heartbeat are classified as behaviorally warm. Missing durable
state, wake failure, inconsistent history, or Service recovery failure are
provider failures, not cold proof.

Management listing handles pagination without silently truncating resources.
The live provider returned `has_more=true` and a null continuation token even
for an empty organization. A tokenless terminal page is accepted only when the
explicit aggregate `running + warm + cold` count exactly equals every unique
resource already collected. Any mismatch still fails preparation or
observation.

## Completed live procedure

Preparation ran on 2026-07-14 and passed in 304.52 seconds.

1. Confirmed the selected organization was `setta-100` and was empty.
2. Created exactly three deterministic target Sprites.
3. Configured authenticated URL access and the Phase 1b minimal external
   network policy on each target.
4. Installed the sentinel and Service fixture on each target.
5. Verified one healthy Service start, one history entry, a matching boot ID,
   and a meaningful heartbeat baseline on each target.
6. Disconnected clients and waited one shared 120-second interval.
7. Woke each target for the warm baseline and verified that the sentinel,
   original boot ID, and start count of one survived while the heartbeat was
   substantially frozen.
8. Created exactly ten deterministic pressure Sprites, matching the observed
   warm limit, and allowed them to idle.
9. Used management-plane reads only until all three targets reported `cold`.
   At that observation the organization reported 13 cold Sprites.
10. Deleted all ten pressure Sprites, reverified every deletion, and confirmed
    that only the three targets remained and all three still reported `cold`.
11. Durably recorded the common reported-cold epoch and deadlines.
12. Exited the local test process.

The common reported-cold epoch is:
`2026-07-14T17:37:49.889727Z`.

## Cohorts and pending wake schedule

| Cohort | Target Sprite                              | First reported cold           | Behavioral wake due           |
| ------ | ------------------------------------------ | ----------------------------- | ----------------------------- |
| 12h    | `setta-u-dd700f911608b83178647d1f1dccd4ab` | `2026-07-14T17:37:44.057746Z` | `2026-07-15T05:37:49.889727Z` |
| 24h    | `setta-u-b0b07081d4a5569349073a3a417c2caf` | `2026-07-14T17:37:44.057747Z` | `2026-07-15T17:37:49.889727Z` |
| 48h    | `setta-u-0a108ef1a61b5413fc9df66101b02aa3` | `2026-07-14T17:37:44.057747Z` | `2026-07-16T17:37:49.889727Z` |

No cohort had been behaviorally woken or classified when this report was
written. The Phase 1b confirmed-cold gate has **not** passed.

## Non-waking observations

Independent `observe` invocations proved the command surface can reload the
saved state after the preparation process exits. These observations use only
the management API and do not touch the Sprite gateway or workload path.

| Observation time              | Running | Warm | Cold | Result                                                                                    |
| ----------------------------- | ------: | ---: | ---: | ----------------------------------------------------------------------------------------- |
| `2026-07-14T17:38:03.046885Z` |       0 |    0 |    3 | All targets remained provider-reported cold after preparation exited.                     |
| `2026-07-15T04:58:54.906152Z` |       0 |    0 |    3 | All targets remained provider-reported cold about 39 minutes before the 12-hour deadline. |

These status observations do not establish whether the old processes remain
in memory. Only `verify-due` may supply that behavioral evidence.

## Commands for the next agent

Run a management-plane-only observation at any time:

```bash
SETTA_LIVE_SPRITES=1 ./scripts/test_sprites_cold_soak.sh observe \
  --state /private/tmp/setta-sprites-cold-soak.PU3jQX
```

At or after a cohort deadline, run:

```bash
SETTA_LIVE_SPRITES=1 ./scripts/test_sprites_cold_soak.sh verify-due \
  --state /private/tmp/setta-sprites-cold-soak.PU3jQX
```

`verify-due` wakes only unverified cohorts whose deadlines have passed. For
each due cohort it records one final management observation, marks the wake in
the manifest before touching the workload path, performs the behavioral probe,
fsyncs the classification evidence, deletes that target, and verifies its
absence. Later cohorts remain untouched.

After the 48-hour verification, always run final cleanup:

```bash
SETTA_LIVE_SPRITES=1 ./scripts/test_sprites_cold_soak.sh cleanup \
  --state /private/tmp/setta-sprites-cold-soak.PU3jQX
```

The same command is the idempotent emergency cleanup command. It deletes only
resources whose exact deterministic ownership labels match the manifest and
then requires the dedicated organization to be empty.

## Current cleanup status

- Ten pressure Sprites: deleted and verified absent.
- Three target Sprites: intentionally retained for the soak.
- Latest organization observation: zero running, zero warm, three cold.
- Local harness processes and provider connections: none retained.
- Final organization-empty confirmation: pending the three behavioral wakes
  and final cleanup.

## Automated verification

The following implementation-scoped checks passed:

- manifest round-trip, schema, fake-time scheduling, and evidence persistence;
- confirmed-cold, behaviorally-warm, and provider-failure classification;
- idempotent ownership-checked deletion;
- Service fixture persistence, start-history append, and heartbeat reset;
- complete and ambiguous pagination handling;
- shell syntax and shellcheck;
- Python syntax;
- Go formatting, vet, tests, static analysis, and complexity limits;
- full `internal/sprites` tests;
- live `prepare` and two independent live `observe` invocations.

The implementation-scoped quality gate is clean. The broader dirty-worktree
gate remained red on unrelated existing file-length, TypeScript complexity,
unused-export, and flaky orchestrator-test failures. The supply-chain gate also
reported the repository-pinned Go 1.26.4 standard-library advisory
`GO-2026-5856`, fixed in Go 1.26.5. Neither broader failure supplies or
invalidates provider lifecycle evidence.

## Files implementing the experiment

- `internal/sprites/live_cold_soak_test.go`
- `internal/sprites/cold_soak_support_test.go`
- `internal/sprites/cold_soak_support_unit_test.go`
- `internal/sprites/testdata/cold_soak_service_probe.py`
- `internal/sprites/sdk_client.go`
- `internal/sprites/sdk_client_test.go`
- `scripts/test_sprites_cold_soak.sh`

Raw state remains outside Git at the state path above. This interim report is
sanitized and deliberately makes no confirmed-cold claim.
