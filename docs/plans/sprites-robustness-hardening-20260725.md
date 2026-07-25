# Sprites Robustness Hardening — 2026-07-25

**Status:** Proposed. Derived from a read-and-run audit of the Sprites-related
packages after the Phase 7 disk-pressure and storage-ceiling slices.

**Scope:** `internal/sprites`, `internal/runtimeprovider`,
`internal/runtimeinstall`, `internal/hostedmeasurement`, the control-plane
validation seam, and the unix-socket test harness that gates all of them. No
frontend work, no Director UI, no Setta 4 reconciliation.

**Audit baseline:** at `14d9e47e6`, `go build ./...` and `go vet` are clean;
`go test` and `go test -race -count=2` pass for every Sprites-related package;
`./check_quality.sh --files <sprites-related Go files>` passes. The findings
below are latent hazards and reproducibility gaps, not present breakage —
except Slice 1, which is reproducible today.

## Operating context

Hosted runtime management is meant to be invisible: the Director resolves an
outcome, the control plane provisions and installs, and the user never sees a
provider concept. Two consequences shape this plan.

1. **Nobody is watching the safe path.** A failure that silently strands a
   billable Sprite is worse here than in an operator-driven system, because no
   human is reviewing an inventory afterward. Every finding that touches
   inspect, ownership, or destroy is therefore treated as first priority, ahead
   of diagnosability and cleanliness.
2. **Failures surface as ephemeral UI, so they must be classifiable.** A
   failure the Director can only render as an opaque string is a failure the
   product cannot explain. The existing `runtime_disk_pressure` /
   `runtime_disk_inspection_failed` codes are the right shape; several hosted
   lifecycle paths still return bare strings. Slice 10 closes that gap and is
   the one deliberate scope addition in this plan.

## Principles for this pass

- Separate **product policy** from **contract validation**. A provisioning
  ceiling must never make an existing resource unobservable.
- One ownership predicate, used everywhere ownership is decided.
- Prefer failing loudly with a typed, content-free code over a bare string.
- Do not weaken the AGENTS.md temporary-directory or production-path test
  rules to make a test pass.

## Slices

Each slice is one code commit plus one progress-log commit, per the branch
commit protocol. Slices are ordered so that the gate is trustworthy before the
safety fixes land, and the safety fixes land before the cleanups.

### Slice 1 — Make unix-socket tests independent of `TMPDIR` length

**Problem.** 19 tests in `internal/controlplane` and `cmd/setta-control-plane`
fail on a stock macOS `TMPDIR`. Socket paths built from `t.TempDir()` exceed
the 104-byte `sun_path` limit: `/var/folders/h8/…/T/` (47 bytes) + test name
and PID (~72) + `/001/admin.sock` (15) = ~134. Confirmed causal — the same
packages pass under `TMPDIR=/tmp/st`. `scripts/run_go_tests.sh` does not pin
`TMPDIR`, so `./check_quality.sh` passes or fails depending on the operator's
environment.

**Change.** Add a small shared helper package (precedent:
`internal/runtimeprovider/runtimetest`) that returns a private,
auto-cleaned temporary directory whose path is short enough that a socket
created inside it fits the platform limit, and that fails loudly with a
specific message if it cannot. Route the socket-bearing tests through it.

Call sites: `internal/controlplane/admin_test.go` (10 sites),
`internal/controlplane/runtime_progress_admin_test.go:35`,
`cmd/setta-control-plane/backup_test.go:162`,
`cmd/setta-control-plane/main_test.go` (83, 93, 251, 297, 598), and
`internal/sprites/workload_lease_test.go` for consistency. Several sites derive
the socket path from `filepath.Dir(store.Path())`, so the **store** must be
created under the short directory, not just the socket.

**Explicitly not the fix:** setting `TMPDIR` inside `scripts/run_go_tests.sh`.
That hides the limit from anyone running `go test` directly and papers over the
same failure in future tests.

**Proof.** The 19 tests pass with the OS default `TMPDIR`, and also under a
deliberately long `TMPDIR`. Cleanup still happens; no test writes outside a
temporary directory.

### Slice 2 — Move the 100 GB ceiling to the request boundary

**Problem.** `RuntimeResources.Validate()`
(`internal/runtimeprovider/provider.go:146`) enforces
`MaximumPersistentStorageBytes`, and the same method validates provider
*responses* at `internal/sprites/adapter.go:586`. A Sprite observed with more
than 100 GB therefore fails `mapRuntime` with `ErrUnexpectedProviderValue`.
Because `Adapter.Destroy` (adapter.go:444), `requireOwnedRuntime`, and
`SpritesCleanupClient.List`/`Destroy` all route through `Inspect`, such a
Sprite becomes un-inspectable and un-destroyable through Setta. The failure
mode is a billable orphan that the cleanup path structurally cannot see —
against the working-state gate that independent final inventories prove every
run-owned Sprite absent.

Not reachable today, since everything Setta provisions is at or below the
ceiling. It is a hazard on the one path that must never fail.

**Change.** Keep `MaximumPersistentStorageBytes` where it is — one constant at
the owning domain boundary, no cross-boundary duplication. Remove the ceiling
check from `Validate()` and add a request-side validator on the same type that
composes `Validate()` with the ceiling.

Request-side call sites: `internal/hostedmeasurement/manifest.go:151`,
`internal/controlplane/runtime_policy_validation.go:21`, `Adapter.Create`'s
`request.Resources` check (`internal/sprites/adapter.go:140`),
`spriteConfig` (`internal/sprites/sdk_client.go:97`), and the control-plane and
hosted-measurement CLI bootstrap/ensure paths. The observation mapper keeps
plain `Validate()`.

**Proof.** A new test that an observed 200 GB runtime is still inspectable and
still destroyable through `Adapter.Destroy` and `SpritesCleanupClient`. The
existing boundary-value and one-byte-overflow tests move to the request
validator. `requireOwnedObservation`'s exact resource-shape equality is
unchanged, so an unauthorized shape is still refused at create time.

### Slice 3 — One ownership predicate

**Problem.** `adapter.requireLabels` (`internal/sprites/adapter.go:710`) sorts
both label sets before comparing. `internal/hostedmeasurement/sprites_cleanup.go:60`
and `internal/hostedmeasurement/sprite_provision.go:147` compare
provider-returned labels with order-sensitive `slices.Equal`. If the provider
ever reorders, the adapter accepts the runtime and cleanup refuses to delete
it — the orphan case again, on the cleanup path.

Probability is low: there are only two labels, and `setta-managed` sorts before
`setta-owner-…`, so a provider that sorts returns the order we sent. The
divergence is still latent and the fix is small.

**Change.** Add an order-insensitive ownership predicate to `ManagedIdentity`
in `internal/runtimeprovider`, holding the comparison currently inlined in
`requireLabels`. Use it at all three sites. Leave
`ManagedIdentity.Validate()`'s `slices.Equal` (provider.go:90) alone — that
validates labels Setta itself constructed, where order is ours to fix.

**Proof.** A table test that reversed provider label order is accepted
identically by the adapter, the provisioner, and the cleanup client, plus a
cleanup test that a reordered-label Sprite is still destroyed.

### Slice 4 — Preserve service-stream failure detail without leaking content

**Problem.** `consumeServiceStream` (`internal/sprites/sdk_client.go:477`)
returns a bare `ErrIncompleteProviderStream` on an `error` event, discarding
the payload. `consumeMutationStream` (line 527) does the opposite, building a
`mutationStreamError` with detail. A failed `EnsureService` during a live
install is therefore materially harder to diagnose than a failed checkpoint —
and `EnsureService` is on the hosted install path.

**Change.** Give service streams the same typed-error treatment, carrying the
detail from `ServiceLogEvent.Data` (the pinned type has no separate `Error`
field). Surface it through the existing `OperationError.Detail`.

**Content-safety constraint, non-negotiable for this slice.** A service
stream's `Data` is the service's own stdout/stderr. It must not reach an
evidence file. Bound the detail, take it only from `error`-type events, and add
a test proving that the hosted-measurement evidence record for a failed
`EnsureService` contains no detail string. Live evidence containing no
credential values or user content is a working-state gate criterion.

**Proof.** An `error` service event's detail is reachable via
`errors.As(*OperationError)`; the corresponding evidence record is free of it.

### Slice 5 — Organization snapshot must tolerate provisioning Sprites

**Problem.** `organizationSnapshotCountMatches`
(`internal/sprites/sdk_client.go:392`) requires
`Running + Warm + Cold == len(Runtimes)`. `mapRuntimeActivity` also recognizes
`created` and `provisioning`, which no counter represents. A Sprite mid-provision
anywhere in the organization makes the whole snapshot fail with
`ErrUnexpectedProviderValue`.

Live-evidence paths only (`live_measurement_test.go:129`,
`live_cold_soak_test.go:799`), so it presents as harness flakiness during an
expensive authorized run rather than as a product bug — which is the worst time
to discover it.

**Change.** Classify each listed Sprite's raw status and require the
`Running`/`Warm`/`Cold` counters to equal the observed counts of exactly those
three activities, allowing `created`/`provisioning` Sprites as uncounted
extras. Keep failing loudly on an unrecognized status.

**Proof.** A page containing a provisioning Sprite plus counters covering only
the other three yields a complete snapshot; a genuine counter mismatch still
fails.

### Slice 6 — Truthful checkpoint lookup, documented create-diff

**Problem.** `FindCheckpoint` (`internal/sprites/sdk_client.go:309`) scans
`ListCheckpoints`, which passes `IncludeAuto: false`, so `InspectCheckpoint`
reports `found=false` for an auto checkpoint that genuinely exists.
`CreateCheckpoint` (line 286) identifies its result by diffing before/after
lists — three API calls, ambiguous under concurrent creation. The diff is
*justified*, because the pinned `StreamMessage` carries no checkpoint ID, but
nothing in the code says so, and it reads as accidental.

**Change.** Use `ListCheckpointsWithOptions{IncludeAuto: true}` for lookup so
inspection cannot deny a real checkpoint. Keep `IncludeAuto: false` on both
sides of the create diff, so a racing auto checkpoint cannot be misidentified
as ours. Add a comment recording that the pinned and latest SDK stream messages
carry no checkpoint ID, which is why the diff exists.

**Proof.** An auto checkpoint is findable by ID; the create diff ignores auto
checkpoints; `singleNewCheckpoint`'s ambiguity rejection is unchanged.

### Slice 7 — Disk-admission constants, dead branch, and the local default

**Problem.** `"disk_space_below_minimum"` is duplicated as a literal between
`internal/runtime/diagnostics.go:360` and `internal/runtime/disk_admission.go:60`
— a cross-file coupling with no named owner. The `readStats == nil` fallback in
`AdmitTurn` (disk_admission.go:48) is unreachable: the constructor always sets
it and both tests set it.

**Change.** Hoist the diagnostic reason codes to named constants at their owner
in `internal/runtime` and use them at both sites. Delete the unreachable
fallback.

**Open decision — owner call.** `--minimum-disk-free-mib` defaults to `0` in
both `cmd/setta/serve.go:74` and `cmd/setta-backend/main.go:103`, and
`newRuntimeDiskAdmissionGate` returns nil at `0`. Only the hosted install path
sets it, from the signed manifest. So hosted runtimes have disk admission and
local desktop installs do not, while the Phase 7 item reads as unconditional.
Recommendation: give the desktop a nonzero default so a local disk-pressure
failure produces the same typed, renderable code as a hosted one, with `0`
remaining an explicit opt-out. Alternative: keep `0` and state in the plan that
disk admission is hosted-only. Either is defensible; it should be written down
rather than inherited from a flag default.

**Proof.** Existing disk tests, plus one asserting the gate maps to the named
reason-code constants. If the default changes, the deterministic
`hosted-cloud-chat` Electron workflow and the live Codex gates re-run, since
this seam is turn admission.

### Slice 8 — Measure adapter API round trips

**Problem.** Every adapter mutation performs a pre-flight `Inspect`, doubling
provider round trips. The install loop issues six or more execs, so one install
costs roughly a dozen API calls. The ownership safety is worth paying for; the
cost is currently unquantified, and Phase 8 requires a provider rate-limit
conversation backed by numbers.

**Change.** No behavior change. Count provider calls per adapter operation and
across one full install loop using the existing offline fake provider, and
record the result as an append-only report under
`docs/reports/performance/`.

**Proof.** The report exists and states per-operation and install-loop totals.
This is evidence for a later decision, not a decision.

### Slice 9 — Push the branch

`setta-3-sprites-development` is 99 commits ahead of its origin ref. The
working-state gate requires a clean, pushed checkpoint suitable for later
reference. Owner action; no code change.

### Slice 10 — Typed failure codes for hosted lifecycle (scope addition)

**Problem.** The runtime turn path already emits stable, content-free,
retryable codes the Director can classify. The hosted lifecycle does not:
`internal/hostedmeasurement/sprites_cleanup.go` and `sprite_provision.go`
return bare strings such as `"Sprites cleanup inventory request failed"` and
`"hosted Sprite observation differs from the authorized resource shape"`. An
ephemeral failure card built on those can only show opaque text, and cannot
distinguish "retry in a moment" from "an operator must look at this".

**Change.** Give the hosted provisioning and cleanup failures the same shape as
the turn-admission failures: a stable code, a retryable flag, and no provider
or user content. Do not change the message text policy — content-free stays
content-free.

**Marked as a scope addition.** It is not one of the audit findings; it follows
from the ephemeral-UI direction. Cut it from this pass without affecting Slices
1–9.

## Verification per slice

Per AGENTS.md, narrowest first: the changed package's tests, then
`./scripts/format.sh`, then `./check_quality.sh --git-changes`. Notes:

- Slices 1, 3, 4, 5, 6, 8 are provider-adapter and test-harness scoped. Package
  tests plus the quality gate are sufficient; no Electron or live-provider gate
  is implied.
- Slice 2 touches control-plane assignment validation and signed manifest
  validation, so the deterministic hosted lifecycle suites re-run.
- Slice 7 touches turn admission if the default changes. That requires the
  registered `hosted-cloud-chat` Electron workflow and, with `OPENAI_API_KEY`
  removed, the four ChatGPT-authenticated live Codex gates.
- No dependency manifest, lockfile, or supply-chain configuration changes are
  expected, so `./scripts/check_supply_chain.sh` is not required unless that
  assumption breaks.
- Run Slice 1 before the rest. Until it lands, a green
  `./check_quality.sh --git-changes` on one machine does not mean green on
  another.

## Out of scope

Checkpoint retention stays open and is not addressed here. The pinned
`sprites-go@v0.0.0-20260706200727` and the newer `@20260708201521` both expose
create, list, get, and restore, and no delete — independently confirmed during
this audit. Retention needs a provider-supported, testable delete plus an
explicit policy; a count- or age-based default would be a forbidden heuristic.
Cache cleanup, destructive full-disk recovery, and user-facing quota behavior
also remain open Phase 7 items.

The single dated rate card returned unconditionally from the control-plane
composition root (`cmd/setta-control-plane/main.go:231`) is correct for
pre-beta and auditable through its version string. Schedule selection is a
Phase 8 concern, not a robustness defect.

## Sequence

| # | Slice | Class | Gate beyond package tests |
|---|---|---|---|
| 1 | Socket-path test determinism | Reproducibility | — |
| 2 | Ceiling to request boundary | Safety | Hosted lifecycle suites |
| 3 | One ownership predicate | Safety | — |
| 4 | Service-stream detail | Diagnosability | Evidence content test |
| 5 | Snapshot tolerates provisioning | Live correctness | — |
| 6 | Checkpoint lookup | Correctness | — |
| 7 | Constants, dead branch, default | Cleanliness + decision | Electron + live if default changes |
| 8 | API round-trip measurement | Evidence | Append-only report |
| 9 | Push the branch | Housekeeping | — |
| 10 | Typed hosted failure codes | Scope addition | — |
