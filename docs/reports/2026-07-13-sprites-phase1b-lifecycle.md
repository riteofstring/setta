# Sprites Phase 1b Lifecycle Adapter Evidence

Date: 2026-07-13  
Status: **BLOCKED — confirmed-cold memory-loss semantics are not observable on the live provider**

## Scope

This phase implemented the minimum typed Sprites lifecycle adapter and a live,
destructive Go harness. The harness uses disposable, deterministically named
Sprites in an otherwise idle test organization and always verifies deletion.
No Sprites organization credential is copied into a Sprite; the in-Sprite
lease probe talks only to `/.sprite/api.sock`.

Pinned client and observed server:

- Go SDK: `github.com/superfly/sprites-go v0.0.0-20260706200727-0d0f37d154bd`
- live Sprite server: `0.0.1-rc45`
- organization limits observed by the harness: 10 running, 10 warm

## Implemented surfaces

- Setta-owned `runtimeprovider.Provider` contracts for create, inspect, exec,
  URL access, Service create/inspect, network policy apply/inspect, checkpoint
  create/inspect, restore, and destroy.
- A separate `WorkloadLeaseManager` boundary for the in-Sprite Tasks API.
- Deterministic SHA-256-derived names and exact ownership labels. All mutations
  verify ownership, and create reconciles ambiguous provider failures without
  adopting foreign resources.
- No Sprites SDK response type crosses into `internal/runtimeprovider`.
  Provider status mappings are exhaustive and fail on unknown values.
- Content-free typed operation errors retain HTTP status and `Retry-After`
  metadata. The live harness honors provider-supplied creation backoff without
  guessing.
- HTTP/JSON Tasks client over the Unix management socket, with whole-second
  TTL bounds, create, renew, inspect, and idempotent release.

## Pinned-surface probes

| Surface | Result |
| --- | --- |
| Names and labels | Deterministic Setta name and exact labels round-tripped live. |
| URL | URL exists; authenticated mode round-tripped. |
| Services | Minimal Python Service created and ran; process preservation was measured with a persistent start counter and heartbeat. |
| Policy | Ordered allow/deny network policy applied and round-tripped. |
| Checkpoints | Create, inspect, whole-Sprite restore, and filesystem rollback passed. |
| Deletion | Target and all pressure Sprites were destroyed; absence and empty-org cleanup were repeatedly verified. |
| Placement | Detailed response returned an empty placement; no placement control was exposed by the pin. |
| Usage | No authoritative per-Sprite usage/cost observation was exposed by the pin; this remains Phase 1c work. |
| Resource/privilege policy | Not exposed by the pinned SDK lifecycle surface; only the live-proven network policy is in the minimal adapter. |

The live list payload also differs from the pinned SDK model: organization
capacity fields are top-level rather than nested under `org`. The adapter keeps
this provider-specific decoding private. The detailed and list status fields
reported `cold` while memory was demonstrably retained, so core state does not
treat provider activity labels as authoritative.

## Automated lifecycle evidence

Command:

```sh
./scripts/test_sprites_lifecycle.sh
```

Passed in the aggregate live run:

- create, identity/label verification, URL configuration, and network policy;
- filesystem marker persistence;
- warm behavior: during a 120-second no-client interval a 100 ms Service
  heartbeat froze substantially while the Service start count remained one;
- checkpoint creation and restore rolled `after-checkpoint` back to
  `before-checkpoint`;
- a detached agent-like job completed beyond the normal disconnected-exec
  window while a 20-second Task was renewed;
- Task release completed, and a simulated supervisor crash left a five-second
  Task that disappeared without DELETE;
- target and ten pressure Sprites were destroyed, and the org was empty.

## Blocking cold result

The provider does not document a bounded warm-to-cold interval. To avoid a
flaky sleep, the harness filled the empty organization's observed warm capacity:
one target plus ten Service-backed pressure Sprites, each followed by the same
no-client interval that behaviorally proved suspension.

The provider then reported:

```text
Running: 0, Warm: 0, Cold: 11, RunningLimit: 10, WarmLimit: 10
```

After waking the oldest target, the harness polled for a Service restart for a
full 60 seconds. The persisted start count remained `1`, and the same process's
heartbeat resumed from `598` to `1207`. A restarted Service would increment the
start count and reset the heartbeat near zero. Therefore the reported `cold`
state retained process memory and did not satisfy the documented cold behavior
or the Phase 1b confirmed-cold Service-restart gate.

This was reproduced after a Claude Code Fable 5/high-effort review identified
and closed the former one-shot-read race. The second opinion agreed the provider
status/memory discrepancy is genuine once the restart poll and heartbeat reset
check are present.

## Verification and commit status

Focused checks pass:

```text
./scripts/go.sh test ./internal/runtimeprovider ./internal/sprites ./cmd/setta-sprite-lease-probe -count=1
```

`./scripts/format.sh` completed after the final source edits. Claude's read-only
review also ran `go vet` successfully. Its supply-chain check found the
pre-existing pinned Go 1.26.4 advisory `GO-2026-5856`, fixed in Go 1.26.5; a
toolchain patch is outside this blocked phase and needs an owner decision.

No implementation commit and no final broad quality run were made. The user
requested final quality only after Phase 1b passes its gates, and the
confirmed-cold gate is red. Do not waive it by trusting the provider's `cold`
label; resolve the rc45 semantics with Fly or obtain a deterministic,
memory-dropping cold operation first.
