# Sprites Confirmed-Cold Soak Test Plan

Date: 2026-07-14  
Status: Handoff ready; not implemented or started

## Purpose

Determine whether the Sprites control plane reports `cold` before process
memory is actually discarded, and whether a fresh Sprite reaches a
behaviorally confirmed cold boot 12, 24, or 48 hours after bounded warm-pool
pressure first makes the provider report it as `cold`.

This experiment addresses the remaining Phase 1b gate in
`setta-cloud-platform-sprites-plan.md`. It does not waive or redefine that
gate. Provider status is evidence to record, not proof of cold behavior.

## Prior evidence

The existing live harness filled the organization's 10-Sprite warm capacity.
The provider then reported 11 cold Sprites, but the target's original Service
process resumed with its start counter still at one and its heartbeat continuing
from the previous value. That proved memory retention despite the reported
`cold` state.

All disposable Sprites from that run were destroyed. At the start of this plan,
the `setta-100` organization reports zero running, warm, and cold Sprites.

## Questions and hypotheses

Primary question: after a long uninterrupted interval beginning when the
provider first reports `cold`, does a wake preserve the old process or start a
new boot?

Record enough evidence to distinguish these outcomes:

1. **Delayed real cold:** pressure eviction changes the status before the
   provider actually discards memory, but memory is discarded later and the
   Service eventually restarts.
2. **Status-only cold:** the provider continues to report `cold` while the same
   boot and Service process remain preserved.
3. **No cold within the window:** the Sprite remains behaviorally warm through
   48 hours, regardless of its reported status.
4. **Provider failure:** the Sprite cannot wake, loses its durable sentinel, or
   the Service fails to recover.

The test cannot determine the exact instant memory is discarded because any
in-Sprite observation wakes the machine. It can establish bounds: the first
non-waking `cold` observation, the chosen wake time, and the behavioral result
at that wake.

## Non-goals

- Do not maintain pressure during the soak. Preparation may reproduce the same
  bounded warm-capacity eviction used by the earlier test, but all pressure
  Sprites must be deleted before the 12-hour clock starts.
- Do not use checkpoint restore, restart, destroy/recreate, or undocumented
  lifecycle endpoints as substitutes for cold.
- Do not test the rest of Phase 1b again.
- Do not keep a local test process, terminal, websocket, proxy, preview, or HTTP
  connection open for the duration of the soak.
- Do not infer lifecycle behavior from timing or status strings alone.

## Safety and ownership rules

- Require `SETTA_LIVE_SPRITES=1` before any billable or destructive action.
- Resolve the organization token through the existing secure CLI/keychain path.
  Never write the token to the manifest, logs, command line, test output, or a
  Sprite.
- Refuse `prepare` unless the dedicated organization has zero running, warm,
  and cold Sprites. Refuse ambiguous pagination or capacity responses.
- Create exactly three targets, all with deterministic Setta-owned names and
  exact ownership labels derived from the run ID and cohort duration. Create no
  more than the observed warm limit of temporary pressure Sprites, also with
  distinct deterministic ownership.
- Before every mutation or deletion, re-read and verify the target's ownership
  labels. Never adopt or delete a foreign resource with a colliding name.
- Store live-run state in a newly created temporary directory outside Git. The
  path must be supplied to every later command. Unit tests use `t.TempDir()`.
- Make cleanup idempotent and safe to rerun after partial preparation,
  interruption, failed verification, or an expired local shell.
- Preparation must destroy every pressure Sprite and verify its absence before
  starting the soak clock. Final cleanup must destroy all three owned targets
  and verify that the organization is empty.

## Cohort design

Prepare three otherwise identical Sprites at the same time:

| Cohort | First behavioral wake |
| --- | ---: |
| `12h` | 12 hours after the common reported-cold epoch |
| `24h` | 24 hours after the common reported-cold epoch |
| `48h` | 48 hours after the common reported-cold epoch |

Three cohorts are required because waking a Sprite ends its uninterrupted idle
period. If the 12-hour cohort is still warm, the untouched 24- and 48-hour
cohorts preserve the later observations.

During preparation, create the three targets first so they are the oldest warm
Sprites. Then create at most `warm_limit` temporary pressure Sprites and let all
of them idle. With the observed limit of ten, three targets plus ten pressure
Sprites gives the provider enough newer warm candidates to report all three
oldest targets as cold. Bound this preparation by the existing live-test
timeout and creation backoff rules.

Once all three targets are individually reported as `cold`, destroy every
pressure Sprite without touching a target's workload path. Re-inspect the
targets through the control plane. Start the common reported-cold epoch only if
all three remain reported `cold` after pressure cleanup. Otherwise classify
preparation as inconclusive and clean up everything.

## Behavioral probe

Add a dedicated, normal source fixture for this experiment rather than
embedding executable Python in a Go or shell string. The Service must maintain
these files under a dedicated soak directory:

- an immutable random persistence sentinel created by the harness;
- an atomic, monotonically increasing Service start counter;
- an append-only Service start history containing UTC time, `/proc` boot ID,
  and process ID;
- an atomic heartbeat counter that starts from zero on each Service start and
  advances frequently enough to prove suspension and distinguish a restart.

Flush the start record durably before beginning the heartbeat loop. Process ID
alone is not sufficient because it may be reused after a boot. The boot ID,
start counter, and reset heartbeat provide independent behavioral evidence.

Reuse the existing minimal Service and adapter patterns where appropriate, but
do not change `runtimeprovider.Provider` merely to expose test-only organization
counters. Prefer a live test driver inside `internal/sprites`, where the existing
provider-specific capacity decoder is already available.

## Restart-safe command surface

Implement a thin script wrapper and a phase-based Go live harness. The exact
names may follow repository conventions, but the operator workflow must be
equivalent to:

```text
prepare --state <temporary-directory>
observe --state <temporary-directory>
verify-due --state <temporary-directory>
cleanup --state <temporary-directory>
```

No phase should depend on an earlier process still running. Every phase reloads
the manifest, validates its version and run ID, re-inspects provider resources,
and fails specifically on missing or conflicting state.

`prepare` creates and configures all cohorts. `observe` performs control-plane
reads only. `verify-due` wakes only cohorts whose deadlines have passed.
`cleanup` destroys all still-owned cohorts and verifies absence.

The wrapper may print suggested future commands, but it must not install a
cron job, launch agent, or other persistent scheduler. The operator or calling
agent owns when later phases run.

## Manifest and evidence

Write an atomic versioned manifest plus append-only JSON Lines observations in
the temporary state directory. Do not store credentials. Record at least:

- run ID and schema version;
- provider API, pinned SDK, CLI, and live server versions;
- organization limits and initial empty counts;
- cohort duration, deterministic name, provider resource ID, and creation time;
- pressure Sprite identities, creation/deletion times, and verified absence;
- persistence sentinel digest, not secret material;
- initial boot ID, Service start count, heartbeat, and start history;
- each target's first observed `cold` time, the common reported-cold epoch, and
  each cohort's due time;
- every control-plane observation with UTC time, reported activity, provider
  update time, and organization running/warm/cold counters;
- pre-wake control-plane observation and post-wake behavioral values;
- classification, cleanup attempts, and confirmed deletion time.

Handle list pagination correctly. Do not treat `has_more` without a continuation
token as permission to loop forever, and do not silently truncate resources.

After the full experiment, add a sanitized append-only report under
`docs/reports/`. Raw temporary artifacts remain uncommitted.

## Experiment procedure

### 1. Preflight

1. Inspect `git status`; preserve all existing Phase 1b work and unrelated user
   changes. Do not reset or clean the worktree.
2. Run focused unit tests for new manifest, scheduling, classification, and
   cleanup logic with fake time and temporary directories.
3. Confirm the current CLI organization is `setta-100` and the organization is
   empty without issuing any Sprite URL, exec, proxy, or Service request.
4. Record versions and limits before creating anything.

### 2. Prepare the cohorts

For each cohort:

1. Create the deterministic owned Sprite through the typed adapter.
2. Configure authenticated URL access and the same minimal external network
   policy used by the Phase 1b target.
3. Create the persistence sentinel and install the dedicated Service probe.
4. Verify one healthy Service start, one start-history entry, and matching
   boot ID.

After all three are ready, disconnect every client and wait the existing
120-second warm interval once for all cohorts in parallel. Wake each target in
turn and prove the sentinel survives, the start count remains one, the boot ID
is unchanged, and the heartbeat was substantially frozen. This establishes a
valid warm baseline for every target.

After the last baseline read, perform no further in-Sprite request. Create and
idle the bounded pressure set. Poll only the control plane until all three
targets are individually reported `cold` or the preparation timeout expires.
Destroy and verify absence for every pressure Sprite, then confirm all three
targets still report `cold` without waking them.

Record the common reported-cold epoch at that final confirmation and calculate
the 12-, 24-, and 48-hour deadlines from it. The soak has not started until the
pressure set is gone and this confirmation is durably recorded.

### 3. Observe without waking

Run `observe` when convenient, ideally near 1, 4, 8, 12, 24, 36, and 48 hours.
Missing an intermediate observation makes the status-transition bound coarser
but does not invalidate the later behavioral wake.

Observation may use only management-plane list/get operations already proven
not to wake compute. It must not call exec, inspect the in-Sprite Service API,
open a preview or URL, create a checkpoint, or contact the Sprite gateway.

### 4. Verify each due cohort

Immediately before waking a due cohort, append a final non-waking control-plane
observation. Then:

1. Wake it with one bounded typed exec.
2. Verify the persistence sentinel before making any conclusion.
3. Poll for at most 60 seconds for the Service probe files to become readable
   and internally consistent.
4. Read the start counter, complete start history, latest boot ID, and
   heartbeat.
5. Classify the outcome using the rules below.
6. Append and fsync the evidence before cleanup.
7. Destroy that cohort, verify absence, and leave the later cohorts untouched.

If verification is interrupted after a wake, classify that cohort as
inconclusive on the next invocation; do not pretend it retained an uninterrupted
idle interval. Cleanup must still remove it safely.

### 5. Finish

After the 48-hour cohort is verified, run cleanup even if earlier cleanup
appeared successful. Confirm zero running, warm, and cold Sprites. Produce the
sanitized report and update the main Phase 1b progress log without checking the
cold gate unless the behavioral acceptance criteria actually passed.

## Classification and acceptance

### Confirmed cold — gate evidence

All of the following are required on the same Sprite:

- the persistence sentinel is unchanged;
- the Service start counter increased from one;
- the start history contains a new entry with a different boot ID;
- the heartbeat restarted from a value below its pre-idle baseline rather than
  continuing the old counter;
- the Service becomes healthy within the bounded restart poll.

Record the earliest cohort that satisfies these conditions. This proves a
memory-dropping cold wake by that duration, but not the exact transition time.

### Behaviorally warm

Classify the cohort as warm when the sentinel is unchanged, the start counter
remains one, the boot ID is unchanged, and the old heartbeat resumes. If the
provider reported `cold`, record a lower bound on status inaccuracy from the
first such status observation through the behavioral wake.

### Provider failure

Treat any of the following as a separate red result, not as cold proof:

- missing or changed persistence sentinel;
- wake timeout or an unwakeable Sprite;
- Service failure to recover within 60 seconds;
- inconsistent or missing probe history;
- unknown provider status or malformed capacity response.

### Inconclusive

Classify as inconclusive if anything touched the workload path during the idle
window, local evidence was lost, the cohort was verified before its deadline,
or the provider resource disappeared before verification.

## Implementation and verification sequence

1. Add manifest/schedule/classification code and focused unit tests.
2. Add the dedicated Service fixture and its narrow tests.
3. Add the phase-based live harness and secure wrapper.
4. Run the narrow non-live tests first through `./scripts/go.sh`.
5. Run `./scripts/format.sh` and `./check_quality.sh --git-changes` before any
   source commit, following `AGENTS.md`.
6. Start the live experiment only with explicit authorization and retain the
   printed state-directory path.
7. Run each due verification, then final cleanup and evidence review.
8. If the experiment supplies evidence that satisfies the Phase 1b gate, run
   the required Claude Code second opinion with `claude-fable-5 --effort high`
   as specified in the main plan. Run final broad quality checks only after
   review findings are resolved. If the experiment remains red or
   inconclusive, preserve the evidence and report the blocker without treating
   review or quality checks as proof of provider behavior.

The current Phase 1b adapter is uncommitted because its live cold gate is red.
Do not create a commit that depends on uncommitted source absent from that
commit. Either keep the soak implementation local until the gate decision, or
include it later in a coherent commit whose staged checks pass. Never reset,
discard, or silently absorb the existing work.

## Handoff requirements

The implementing agent must return:

- files changed and the exact operator commands;
- focused test results;
- the temporary state-directory path if a live run was prepared;
- created Sprite names and due times, without credentials;
- current cleanup status and an idempotent emergency cleanup command;
- any departure from this plan and why;
- no claim that the cold gate passed until behavioral evidence meets every
  confirmed-cold criterion above.
