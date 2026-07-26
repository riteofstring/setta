# Sprites Runtime Capacity Observation — 2026-07-26

**Status:** Proposed. Derived from the 2026-07-26 live capture showing that the
Sprites API no longer reports per-Sprite resource configuration.

**Scope:** `internal/runtimeprovider`, `internal/sprites`, `internal/runtime`,
`internal/runtimecapability`, `internal/runtimereporting`, `internal/httpapi`
control-plane endpoints, `internal/controlplane`, `internal/runtimeinstall`,
`internal/hostedmeasurement`, and `cmd/setta`. No Director UI work, no renderer
contract regeneration, no Setta 4 reconciliation.

**Evidence baseline:** one diagnostic Sprite created on 2026-07-26 with the
exact request the adapter sends and destroyed immediately. `POST /v1/sprites`
returned 201 with the full Sprite object; neither it, nor `GET
/v1/sprites/{name}` polled through `cold` → `warm`, nor `GET /v1/sprites`
contains a `config` object, and `primary_region` is absent too. The pinned SDK
and the newest published `sprites-go` both still declare `SpriteConfig`, and the
installed CLI exposes no resource flags. The full payload is recorded in the
progress log in `setta-cloud-platform-sprites-plan.md`.

## The problem this plan solves

Setta asks the provider for an exact resource shape and then verifies the
provider gave it that shape. The verification is a comparison against the
provider's own echo of our request, at four sites:

- `internal/sprites/adapter.go:787` `requireOwnedObservation`
- `internal/controlplane/reconciler.go:456` and `:476`
  (`provider_resources_mismatch`, permanent)
- `internal/controlplane/store_runtime_results.go:382`
  `validateProviderObservation`
- `internal/hostedmeasurement/sprite_provision.go:169`
  (`hosted_lifecycle_resource_shape_mismatch`)

The provider no longer echoes anything, so all four are unsatisfiable and
hosted provisioning fails at create. Two things follow.

First, Setta must stop claiming to observe what the provider does not report.
Keeping `RuntimeObservation.Resources`
(`internal/runtimeprovider/provider.go:198`) as a field that no adapter can
populate is the silent-fallback trap: the next person adds a zero value and the
comparison quietly passes.

Second, the property those four checks defended is worth keeping, and the echo
was always a weak way to defend it. A provider repeating our own request back
to us proves nothing about the machine. The runtime itself knows what it has,
Setta installs its own signed release inside that runtime, and that release
already measures its own disk. Measuring capacity in the runtime is strictly
better evidence than the echo it replaces.

## Operating context

1. **Budget accounting is not affected.** `accountingCeilings`
   (`internal/controlplane/budget_evidence_authority.go:35`) reads
   `runtimes.cpu_core_millionths`, which is written from the claim
   (`request.Resources`), not from any observation. The authorized shape stays
   authoritative for billing throughout this plan. Measured capacity is
   verification evidence, never a billing input — otherwise a runtime that
   under-reports lowers its own bill.

2. **Verification moves from synchronous to post-install.** The echo was a
   create-time gate. Measured capacity cannot exist until the runtime is
   installed and running, so the gate becomes evidence that arrives with the
   first health report. The window is bounded by the existing install and
   health loop, during which the runtime is not yet `ready`.

3. **The reporting channel already exists.**
   `internal/runtimereporting.Client` talks to
   `POST /control-plane/runtime-accounting/events`
   (`internal/httpapi/endpoints.go:50`), authorized per runtime by
   `Store.AuthorizeRuntimeReporter`. `internal/runtimeinstall` already writes
   the credential into the Sprite at `runtime-reporting-credential.json`, 0600,
   owned by the trusted runtime identity, and starts the runtime with
   `--workload-accounting-url` and `--workload-accounting-credential-file`.
   Usage transitions that drive billing already flow over this channel, so
   carrying capacity over it introduces no new trust assumption.

4. **Storage is already measured.** `DiskSpaceDiagnostic`
   (`internal/runtimecapability/diagnostics.go:89`) already carries `TotalMiB`
   from `syscall.Statfs`. Only CPU and memory are missing.

5. **The control plane does not yet drive installs.** Nothing in
   `internal/controlplane` imports `runtimeinstall`; the install loop is
   exercised today by `internal/hostedmeasurement/sprite_runtime.go:106` and by
   tests, and no production call site constructs a `WorkloadAccountingConfig`.
   Capacity reporting is therefore provable end to end through the hosted
   harness now, and becomes live in production only when the reconciler drives
   installs. That wiring is out of scope here and is called out as a
   dependency, not silently assumed.

## Principles for this pass

- Delete the unobservable field rather than leaving it zero-valued. No optional
  resource shape, no "unknown" sentinel, no dual verified/unverified path.
- One source for measured capacity, chosen from live evidence, read directly,
  failing loudly when absent. No fallback chain across cgroup, `/proc`, and
  `nproc`.
- The authorized shape bills; the measured shape verifies. A mismatch is a
  typed, content-free failure, not a reconciliation.
- Report on change, not on a timer. Capacity is fixed for a runtime's life, so
  it is reported once per start alongside health.
- Do not weaken the AGENTS.md temporary-directory or production-path test rules
  to make a test pass.

## Slices

Each slice is one code commit plus one progress-log commit, per the branch
commit protocol. Slice 1 unblocks hosted provisioning on its own and does not
depend on any later slice.

### Slice 1 — Stop observing resources through the provider

**Problem.** Four echo verifications and three durable columns depend on a
field the provider no longer sends. Hosted create fails outright.

**Change.** Remove `Resources` from `runtimeprovider.RuntimeObservation`. Delete
`mapRuntimeResources` and its call in `mapRuntime`; `requireOwnedObservation`
reduces to the ownership predicate. Delete the two reconciler checks and the
`provider_resources_mismatch` failure code, the resource comparison in
`validateProviderObservation`, and the comparison plus
`hosted_lifecycle_resource_shape_mismatch` in `validateSpriteObservation`. Drop
`cpu_core_millionths`, `memory_bytes`, and `storage_bytes` from
`provider_observations` (`internal/controlplane/store_schema.go:296`) and from
the insert and select in `store_runtime_results.go`. Update
`runtimetest.Provider` to stop echoing resources and
`conformance/suite.go` to stop asserting the echo.

The request path is untouched: `CreateRequest.Resources`,
`ValidateProvisioningRequest`, `MaximumPersistentStorageBytes`, the `config`
body still sent on create, the `runtimes` columns, and budget ceilings all stay
exactly as they are.

This is a schema break with no migration, per the repository's
no-backward-compatibility rule. Existing development control-plane databases are
recreated.

**Proof.** The Sprites adapter maps the live 2026-07-26 payload shape — an
`httptest` server replaying the captured body verbatim — through create,
inspect, and destroy without error. The reconciler and hosted provisioner accept
that same observation. A live Stage 4a run reaches the conformance harness
instead of failing at create.

### Slice 2 — Determine the authoritative capacity source on a live Sprite

**Problem.** Inside a Fly-hosted Sprite, `nproc` and `/proc/meminfo` may report
the host rather than the machine's allocation, and a cgroup v2 limit may or may
not be present. Guessing produces exactly the heuristic fallback chain this
repository forbids.

**Change.** No product code. Create one short-lived Sprite through the existing
lifecycle path, exec a small probe that captures `/sys/fs/cgroup/cpu.max`,
`/sys/fs/cgroup/memory.max`, `/proc/cpuinfo`, `/proc/meminfo`, and `statfs` on
the runtime state directory, destroy it, and record the raw values against the
requested shape. Pick the one source per dimension that matches the request.

**Proof.** A dated evidence entry in the progress log naming the chosen source
per dimension and the raw readings that justify it, plus confirmation that the
Sprite was destroyed and the organization inventory is empty.

### Slice 3 — Measure capacity inside the runtime

**Problem.** The runtime reports disk but not CPU or memory, so it cannot yet
answer what machine it is running on.

**Change.** Add `CapacityDiagnostic` to
`runtimecapability.RuntimeDiagnostics` carrying `CPUCoreMillionths`,
`MemoryBytes`, `StorageBytes`, a `DiagnosticStatus`, and a `ReasonCode`, in the
same shape as the existing diagnostics. Implement it in
`internal/runtime/diagnostics.go` beside `diskSpaceDiagnostic`, reading the
source chosen in Slice 2 and reusing the existing `statfs` total for storage.
Absent or unparseable sources yield `DiagnosticStatusUnavailable` with a
specific reason code; they never yield a guessed number.

**Proof.** Unit coverage over real files in a temporary directory for the
parsing, and a runtime-level test that the diagnostic reports this machine's
actual values on the developer platform. A capacity source that cannot be read
reports unavailable with the naming reason code rather than zero.

### Slice 4 — Report capacity over the existing runtime channel

**Problem.** The measurement exists only inside the runtime.

**Change.** Add a second entry to `controlPlaneEndpoints`
(`internal/httpapi/endpoints.go:50`), `RecordRuntimeCapacityObservation`, `POST
/control-plane/runtime-capacity/observations`, authorized by the same
`AuthorizeRuntimeReporter` credential and served beside
`runtimeAccountingReportHandler`. Add the corresponding method to
`runtimereporting.Client`. Report once per runtime start, on the same trigger as
the health report, only when the accounting URL and credential are configured —
a local desktop runtime has no control plane to report to and must not try.

Adding to `controlPlaneEndpoints` deliberately does not regenerate renderer
contracts; that list is outside `Contracts()` precisely so runtime-only
credential surfaces stay out of the desktop client
(`internal/httpapi/endpoints.go:47`).

**Proof.** A control-plane HTTP test that an unauthorized or wrong-runtime
credential is refused, that a valid report is accepted once, and that a
malformed body is rejected without leaking content. A runtime-side test that
the report is sent exactly once per start and not at all when accounting is
unconfigured.

### Slice 5 — Persist and verify measured capacity

**Problem.** A report nobody stores or checks proves nothing.

**Change.** Add a `runtime_capacity_observations` table keyed by runtime name,
carrying the three dimensions and `observed_at`. It is deliberately separate
from `provider_observations`: the origin differs, and Slice 1 removed resources
from that table for good reason. On record, compare against the runtime's
authorized shape in `runtimes`. A mismatch in either direction is a typed,
content-free failure — `runtime_capacity_mismatch` — that marks the runtime
degraded and is surfaced to the operator; it does not adjust ceilings, and it
does not silently reconcile. Ceilings continue to read the authorized shape.

**Proof.** Store tests that a matching report is recorded and leaves the runtime
healthy, that a smaller and a larger measured shape both produce
`runtime_capacity_mismatch` and a degraded runtime, and that the authorized
shape and therefore the billing ceilings are unchanged in every case.

### Slice 6 — Make the mismatch explicable

**Problem.** A failure the Director can only render as an opaque string is a
failure the product cannot explain, which is the same gap Slice 10 of the
hardening plan closed for hosted lifecycle codes.

**Change.** Expose the capacity observation and any mismatch through the
existing control-plane admin read model, alongside `observed_release` and
health, using the established typed failure-code shape.

**Proof.** An admin read test showing the observation and the typed code for a
mismatched runtime.

### Slice 7 — Prove it live

**Problem.** None of the above is evidence until it runs against the real
provider.

**Change.** No product code. Run Stage 4a end to end, then drive the hosted
install path with a `WorkloadAccountingConfig` against a real Sprite and confirm
the control plane records a capacity observation matching the requested shape.
Always destroy, always confirm the inventory is empty.

**Proof.** A dated progress-log entry with the observed values, the requested
shape, and the final inventory check.

## What this plan deliberately does not do

- It does not wire `runtimeinstall` into the control-plane reconciler. Capacity
  reporting is proved through the hosted harness; production verification
  becomes live when that wiring lands, and this plan states the dependency
  rather than assuming it.
- It does not make measured capacity a billing input.
- It does not add a fallback chain across capacity sources, and it does not
  infer a shape when the chosen source is unreadable.
- It does not add polling. Capacity is reported once per runtime start.
- It does not restore the provider echo if Fly reinstates `config`. If they do,
  re-adding a create-time check is a separate, small decision, and the
  in-runtime measurement remains the stronger evidence.

## Open questions

- If Fly answers that the dropped `config` is a regression rather than an
  intended contract change, Slice 1 still stands on its own merits — Setta
  should not depend on a provider echoing its own request — but the urgency
  drops and Slice 2 can be scheduled rather than rushed.
- `primary_region` is now absent too, so `RuntimeObservation.Placement` is
  always empty. It was already empty in the Phase 1b evidence, so nothing
  regresses, but the field is now unobservable in the same way `Resources` was
  and is a candidate for the same treatment once the provider's intent is known.
- `validateProviderObservation` (`store_runtime_results.go:370`) still uses a
  local order-sensitive `equalLabels`. It is a fourth ownership site that the
  "one ownership predicate" slice did not cover. Small, unrelated to capacity,
  and worth folding into whichever slice next touches that file.
