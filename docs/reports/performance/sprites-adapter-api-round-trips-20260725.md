# Sprites Adapter API Round Trips — 2026-07-25

## Scope

This report records deterministic offline `sdkAPI` call counts for successful
Sprites adapter operations and one successful fresh runtime install. It is
evidence for a later Phase 8 provider rate-limit decision. No adapter behavior
changed, and no ownership pre-flight `Inspect` was removed or weakened.

## Per-operation counts

`FindRuntime` is the `sdkAPI` method used by adapter `Inspect`. Except for direct
`Inspect`, each `FindRuntime` below includes an ownership pre-flight. Fresh
`Create` has one pre-flight `FindRuntime` and one post-create `FindRuntime`.

| Adapter operation | Total `sdkAPI` calls | Breakdown |
| --- | ---: | --- |
| `Create` (fresh runtime) | 3 | `FindRuntime` 2, `Create` 1 |
| `Inspect` | 1 | `FindRuntime` 1 |
| `Suspend` | 2 | `FindRuntime` 1, `Suspend` 1 |
| `Exec` | 2 | `FindRuntime` 1, `Exec` 1 |
| `ConfigureURL` | 2 | `FindRuntime` 1, `ConfigureURL` 1 |
| `DialPrivateRuntime` | 2 | `FindRuntime` 1, `ProxySocket` 1 |
| `EnsureService` | 2 | `FindRuntime` 1, `EnsureService` 1 |
| `InspectService` | 2 | `FindRuntime` 1, `FindService` 1 |
| `ApplyNetworkPolicy` | 2 | `FindRuntime` 1, `ApplyNetworkPolicy` 1 |
| `InspectNetworkPolicy` | 2 | `FindRuntime` 1, `InspectNetworkPolicy` 1 |
| `CreateCheckpoint` | 2 | `FindRuntime` 1, `CreateCheckpoint` 1 |
| `InspectCheckpoint` | 2 | `FindRuntime` 1, `FindCheckpoint` 1 |
| `RestoreCheckpoint` | 2 | `FindRuntime` 1, `RestoreCheckpoint` 1 |
| `Destroy` (existing runtime) | 2 | `FindRuntime` 1, `Destroy` 1 |
| `ServerVersion` | 2 | `FindRuntime` 1, `ServerVersion` 1 |

## Full install-loop count

A successful fresh install through the real `runtimeinstall.Loop` made 44
`sdkAPI` calls:

| `sdkAPI` method | Calls |
| --- | ---: |
| `FindRuntime` | 22 |
| `Exec` | 21 |
| `EnsureService` | 1 |
| **Total** | **44** |

The 22 `FindRuntime` calls are ownership pre-flights: one before each of the 21
adapter `Exec` calls and one before `EnsureService`.

## Method

`TestAdapterSDKAPICallCountsByOperation` and
`TestRuntimeInstallLoopSDKAPICallCounts` in
`internal/sprites/api_round_trip_test.go` produce and assert these counts.
The existing `fakeSDKAPI` seam records calls per `sdkAPI` method. The install
test passes a Sprites `Adapter` backed by that counting fake to the production
`runtimeinstall.Loop`, using a locally generated release artifact and scripted
successful provider responses. It does not contact Sprites or another provider.

Reproduce the measurement with:

```bash
TMPDIR=/tmp ./scripts/go.sh test ./internal/sprites \
  -run 'Test(AdapterSDKAPICallCountsByOperation|RuntimeInstallLoopSDKAPICallCounts)$' \
  -count=1 -v
```
