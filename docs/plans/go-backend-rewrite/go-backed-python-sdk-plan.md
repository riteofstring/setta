# Go-Backed Python SDK Plan

Date: 2026-03-24
Branch: `go-rewrite` (`2fd1db05e`)

## Goal

Keep the retained Python SDK surface ergonomic for users while removing duplicate
backend/runtime ownership between Python and Go.

This plan covers both SDK needs:

- communicating with a running Setta backend
- executing canonical Setta logic locally, without routing that work through the
  already-running backend server

## Problem Statement

The repo already has a workable "Python talks to a running backend" story. The
retained SDK uses HTTP and websocket routes to communicate with the Go backend,
and the packaged Python entrypoint already dispatches to Go in
`backend/setta/entrypoint.py`.

The harder remaining problem is local execution.

Today, some Python SDK code still does meaningful Setta-specific work by relying
on Python-owned state/types/runtime logic instead of a Go-owned source of truth.
Examples include:

- `backend/setta/api/listener.py`
- `backend/setta/api/runner.py`
- `backend/setta/types/project_state.py`
- `backend/setta/types/project_chat_windowing.py`

That creates two failure modes:

- duplicate correctness logic between Go and Python
- pressure to keep old Python project-state/runtime ownership alive because the
  SDK still needs local logic

The plan therefore needs to separate three concerns that are currently too mixed
in the retained Python boundary:

1. transport to a running backend
2. ergonomic local Python helpers
3. canonical local Setta logic that should be Go-owned

## Working Decision

Use this architecture:

- Go owns canonical behavior:
  - project-state semantics
  - authoritative validation
  - runner/listener lifecycle semantics
  - canonical derived metadata that must match backend truth
- a shared contract layer owns request/response/event/snapshot shapes
- Python owns ergonomics:
  - `SettaListener`
  - `SettaRunner`
  - callback scheduling
  - context managers
  - iterators
  - friendly lookup/builders
  - exception mapping

Do not treat "Python can do local work" as a reason to keep canonical runtime
ownership in Python.

Do not start with in-process Go/Python FFI.

Do not rewrite existing backend communication just for architectural purity.
The current HTTP/websocket path should stay in place unless a concrete caller or
contract problem forces change.

## Clean-Break Rule

This repo does not need a long-lived transition layer.

Apply these defaults throughout this plan:

- do not preserve old Python-owned canonical paths once a Go-owned replacement
  exists
- do not add compatibility shims between old and new SDK-internal contracts
- do not support multiple retained contract generations long term
- do not keep feature-flagged old/new ownership in parallel beyond the minimum
  bounded implementation window needed to land a change
- fail closed on Python package and Go-core mismatches instead of trying to
  auto-adapt them

## Key Clarification

The retained Python SDK absolutely can keep doing local work after it receives
data from the backend.

The important distinction is what kind of local work it is doing:

- Python-retained local work is acceptable when it is non-authoritative:
  - callback ergonomics
  - filtering
  - batching/debouncing
  - naming/lookups
  - local iteration helpers
  - convenience wrappers over already-authoritative snapshots
- Go-owned local work is required when correctness depends on matching backend
  truth:
  - canonical state validation
  - canonical derived metadata
  - state transitions
  - listener/runner semantics that must not diverge from the backend

The first objective is to shrink the second category by improving the
authoritative snapshots and contracts that Go already sends to Python.

Only after that should the repo introduce a dedicated local Go execution path
for the remaining canonical local logic.

## Current Repo State

### Already In Good Shape

- The wheel/entrypoint boundary already knows how to dispatch into Go:
  `backend/setta/entrypoint.py`
- The packaged distribution already includes Go binaries:
  `pyproject.toml`
- The active listener websocket transport is already being moved to a Go-owned
  protocol:
  `docs/plans/go-backend-rewrite/setta-listener-protocol-redesign-plan.md`
- `SettaRunner` is already mostly an HTTP client, not a second backend.

### Still Mixed

- `backend/setta/api/listener.py` still imports and uses Python-owned state
  types and listener-visible logic that should continue to move behind Go-owned
  contracts.
- `backend/setta/api/runner.py` still builds local summaries/lookups from
  `ProjectStateSingleConfig`.
- `backend/setta/types/project_state.py` and
  `backend/setta/types/project_chat_windowing.py` still represent a retained
  Python ownership surface for canonical project-state behavior.

## Target Architecture

### Layer 1. Go Runtime

Go remains the single owner of:

- state transitions
- validation
- listener/runner behavior
- canonical derived metadata
- local-core execution, if a serverless canonical path is still needed

### Layer 2. Shared Contracts

Introduce a shared schema/codegen layer for:

- listener snapshots
- listener realtime events
- runner-facing snapshots
- local-core commands/results
- shared error payloads
- version handshake payloads

Preferred direction:

- Protobuf + Buf + generated Go/Python artifacts

That is the default recommendation, but the decisive requirement is not a
specific schema brand. The requirement is one contract source of truth and no
hand-maintained duplicate DTO ownership.

### Layer 3. Python SDK Facade

Retain these Python-first surfaces:

- `setta.api.SettaListener`
- `setta.api.ListenerHotReloader`
- `setta.api.chat_toolkit`
- share listener entrypoints
- `setta.api.SettaRunner`

These stay handwritten ergonomic APIs even as their underlying DTOs and
canonical logic move behind Go-owned contracts.

### Layer 4. Execution Adapters

The SDK should support two distinct execution adapters behind the same Python
surface:

- backend adapter:
  communicates with an already-running Setta backend over existing
  HTTP/websocket routes
- local-core adapter:
  communicates with a managed local Go process only for canonical logic that
  still needs to run locally without using the running backend

These two adapters should use the same contract family where possible.

## Ownership Rules

Use these rules whenever a Python SDK behavior is under review.

### Keep In Python

Keep a behavior in Python when it is:

- read-only over authoritative DTOs
- purely ergonomic
- callback or iterator oriented
- transport/session glue
- hot-reload or logging glue
- explicit convenience composition that lowers to already-canonical request
  payloads

Examples that may stay Python if backed by Go-owned snapshots:

- `RunPlan`
- `VariantLookup`
- `ParamLookup`
- metadata-backed listener containers such as `ctx.ids` and `ctx.values`

### Move To Go

Move a behavior to Go when it:

- defines canonical state meaning
- validates canonical invariants
- computes derived values that must match backend truth
- mutates state
- filters or expands events in a way that changes correctness
- depends on project/runtime semantics rather than SDK ergonomics

### Do Not Keep Duplicated

Do not allow both languages to own the same canonical semantics. If a behavior
must be canonical, it needs one owner, and that owner should be Go.

## Non-Goals

- Do not introduce a broad second user-facing backend server just for the SDK.
- Do not expose raw internal Go structs over the boundary.
- Do not mirror the full internal project graph one-to-one into a public RPC
  surface.
- Do not start with `c-shared`, `ctypes`, or other in-process Go/Python ABI
  integration.
- Do not preserve Python project-state ownership just because it currently makes
  some local helper code convenient.

## Implementation Plan

### Phase 0. Inventory The SDK Boundary

Produce a concrete inventory of retained Python SDK behaviors and classify each
one as:

- backend transport only
- local ergonomic helper
- local canonical behavior that must move to Go

This inventory should cover at least:

- `SettaListener`
- `ListenerHotReloader`
- `chat_toolkit`
- `SettaRunner`
- share listener entrypoints
- any Python helpers that still consume `ProjectStateSingleConfig`

Deliverable:

- a repo-local matrix listing each public SDK behavior, current owner, desired
  owner, and whether a running-backend path already exists

Execution artifact:

- `go-backed-python-sdk-surface-inventory.md` (completed 2026-03-24)

Phase 0 verdict:

- the running-backend path already exists for nearly all retained Python SDK
  surfaces
- the immediate blocker is duplicated post-response canonical processing in
  Python, not missing transport
- local Go-core work should remain gated until runner/listener contract cleanup
  proves a residual serverless canonical gap

Exit criteria:

- there is no ambiguity about which Python behaviors are being retained for
  ergonomics versus which are rewrite debt

### Phase 1. Lock The Contract Shape

Before adding a new local-core path, define the retained Python boundary in
terms of commands, events, and snapshots instead of Python project-state
internals.

Minimum contract slices:

- listener bootstrap snapshot
- listener dependency catalog
- listener realtime delta/event payloads
- listener registration ack/error payloads
- runner snapshot/summary payloads
- local-core command/result envelopes
- shared protocol/version handshake payloads

Rules:

- contracts must be coarse-grained
- avoid getter/setter chatter
- do not mirror internal structs unnecessarily
- use explicit schema revisioning only so packaged Python and Go fail closed
  when out of sync, not to preserve old contracts

Deliverables:

- `proto/` or equivalent contract source directory
- code generation for Go and Python
- CI contract-drift/codegen gate

Execution artifact:

- `internal/pythonsdkcontracts/contracts.go`
- `cmd/setta-gen-python-sdk-contracts/main.go`
- `backend/setta/sdk_contracts/generated.py`
- `internal/pythonsdkcontracts/generator_test.go`

Phase 1 verdict:

- the repo now has a Go-owned retained-Python-SDK contract source of truth and a
  checked-in generated Python contract module
- the landed contract layer covers the first narrow runner/listener/local-core
  envelope set needed for the next implementation slices
- active listener/runner runtime consumers have not been switched yet; that
  remains Phase 2 and Phase 3 work

Exit criteria:

- new DTOs for the retained Python boundary are not being hand-maintained in two
  languages

### Phase 2. Refactor Python SDK Internals Around Contracts

Retain the targeted Python API surface while replacing Python-internal
dependence on `ProjectStateSingleConfig` and similar canonical models.

Concrete work:

- replace listener internal state construction with contract-backed snapshots
- replace runner summaries/lookups with a narrower runner snapshot DTO from Go
- isolate Python transport/session glue behind internal adapters
- introduce a single internal error/version mapping layer

Important rule:

- do not force a local Go core into places where a better Go-owned snapshot from
  the running backend removes the need entirely

Exit criteria:

- the Python SDK can operate on Go-owned DTOs instead of Python-owned canonical
  runtime models

### Phase 3. Use `SettaRunner` As The First Narrow Pilot

`SettaRunner` is the best first implementation slice because it is simpler than the
listener boundary and already behaves mostly like a client.

Concrete work:

- define a runner snapshot contract with only the data needed for:
  - section lookup
  - variant lookup
  - param lookup
  - run planning inputs
- keep Python ergonomic builders such as `RunPlan`, but make them lower to
  explicit contract payloads instead of Python project-state internals
- remove runner dependence on `ProjectStateSingleConfig`

Success condition:

- `SettaRunner` remains pleasant to use, but it no longer depends on Python
  project-state ownership

Execution artifact:

- `internal/projectstate/runner_summary_snapshot.go`
- `internal/httpapi/detached_run_routes.go`
- `backend/setta/api/runner.py`
- `tests/api/test_runner.py`

Phase 3 verdict:

- `SettaRunner.summary()` now consumes a narrow Go-owned runner snapshot
  contract instead of `ProjectStateSingleConfig`
- detached-run entry section name resolution now uses the same runner snapshot
  path rather than a full latest-project-state fetch
- Python retained the lookup ergonomics (`RunnerSummary`, `ParamLookup`,
  `VariantLookup`, `RunPlan`) while Go now owns the canonical summary
  materialization

### Phase 4. Finish The Listener Boundary Migration

This phase should build directly on
`setta-listener-protocol-redesign-plan.md`, not replace it.

Concrete work:

- complete listener snapshot/value/delta contract ownership in Go
- keep Python listener bookkeeping metadata-backed rather than project-state
  backed
- remove local dependency-graph/codegen/runtime fallback from the active
  listener path
- make callback-local work operate over authoritative Go-supplied data

Important constraint:

- the listener path should remain event-oriented and Python-friendly
- callback execution should stay local in Python
- correctness-sensitive listener-visible values should come from Go

Success condition:

- `SettaListener` remains a Python authoring API, but it is no longer a second
  owner of listener-visible backend semantics

Execution artifact (current slice):

- `internal/listenersnapshot/payload.go`
- `internal/realtime/listener_messages.go`
- `internal/realtime/listener_broadcaster.go`
- `internal/realtime/listener_temporary_ids.go`
- `internal/wsapi/routes.go`
- `internal/httpapi/listener_routes.go`
- `backend/setta/types/listener.py`
- `backend/setta/api/listener.py`
- `tests/api/test_listener_realtime.py`
- `tests/api/test_listener_router_endpoint_calls.py`
- `tests/api/test_listener_local_dependency_updates.py`

Phase 4 progress:

- listener bootstrap and force-refresh websocket payloads now carry the
  Go-owned `ListenerSnapshot` contract instead of a Python-owned
  `ProjectStateSingleConfig`
- the active retained Python listener path no longer caches or replays a full
  Python project-state snapshot
- listener snapshot metadata/value hydration now rebuilds runtime state from the
  Go-owned snapshot contract and uses metadata-backed cache refresh only
- the old top-level `projectState` / `dependencyCatalog` / `dependencyValues`
  force-refresh envelope has been deleted in favor of `content.snapshot`
- the retained Python listener websocket parser now round-trips realtime,
  dependency-event, and force-refresh JSON/binary payloads with the current
  contract wire shape instead of relying on the deleted project-state envelope
- retained Python listener transport models are now constrained to the current
  Go-owned contract shape for active websocket payloads, even where the Python
  side still needs handwritten wrapper models for dependency-key/value-bearing
  payloads
- the active listener runtime no longer ships the project-state reconstruction
  helpers that were only needed for test/fallback paths; that logic now lives
  under `tests/helpers/` instead of the retained production SDK surface
- the production listener metadata/runtime path no longer exposes graph-derived
  project-state assembly hooks; the remaining dependency-graph builders are
  retained only in test helpers

Phase 4 status:

- complete

Phase 5 progress:

- the repo now has a hidden `setta sdk-local-core` process entrypoint that
  emits a fail-closed version/contract handshake over stdio and handles a
  narrow command surface for retained-SDK local canonical work
- the first local-core command is
  `listener_render_realtime_dependency_values`, which uses the same Go
  listener realtime derivation path as the main backend runtime instead of
  reintroducing Python-owned graph/value semantics
- `backend/setta/api/local_core.py` now manages that hidden Go subprocess from
  the retained Python side and verifies protocol version, sdk version, and
  sdk-contract version before using it
- the active retained Python listener now uses the local core for canonical
  realtime dependency rendering and no longer rehydrates realtime deltas by
  rebuilding listener node/value semantics in Python

### Phase 5. Introduce A Narrow Local Go Core Only For Proven Gaps

After phases 1 through 4, re-evaluate what canonical local logic is still
required.

Expected outcome:

- a substantial amount of currently duplicated logic should disappear simply by
  making the running backend send better authoritative contracts

Only then introduce a managed local Go core for the remaining serverless
canonical work.

Required properties:

- process boundary, not in-process FFI
- narrow coarse-grained command surface
- hidden behind the retained Python API
- uses the same contract family as the backend-facing adapter where practical
- reuses the same internal Go packages as the main backend runtime

Candidate local-core responsibilities:

- canonical validation or transformation over snapshots already held by the SDK
- correctness-sensitive derivations that cannot remain Python helpers
- serverless operations needed by share/listener/runner workflows that should
  not route through the already-running backend

Transport choice:

- default direction is managed local Go process plus typed RPC
- choose the specific RPC transport only after the command surface is known
- do not lock the repo into in-process ABI complexity unless profiling proves
  the process boundary is insufficient

Success condition:

- any remaining canonical local SDK logic is Go-owned without forcing the SDK to
  become a raw transport wrapper

Phase 5 status:

- complete for the active retained SDK listener gap

### Phase 6. Delete Duplicate Python Runtime Ownership

Once the contract-backed runner/listener paths and any required local-core path
exist, remove the duplicated Python ownership that no longer serves a retained
boundary.

Likely targets:

- Python project-state/runtime validators and derivations that were only kept to
  support SDK-local canonical logic
- Python listener fallback logic that rebuilds backend state locally
- Python-only DTOs that duplicate generated contract artifacts

This phase should coordinate with:

- `unused-python-deletion-plan.md`
- `caller-backed-backend-surface-checklist.md`
- `backend-capability-coverage-checklist.md`

Success condition:

- the retained Python SDK is thin, intentional, and not a shadow backend

Phase 6 progress:

- the retained Python listener boundary no longer hand-maintains the generic
  init, error, register-ack, frontend-emit, and router-endpoint envelope DTOs
  that already exist in the generated SDK contract module
- the retained Python listener boundary now also imports the generated
  dependency catalog, rendered-value, snapshot, force-refresh, register, and
  outer realtime/dependency-event contract types directly through
  `backend/setta/types/listener.py`
- the nested realtime-delta and dependency-event entry wrappers are now thin
  subclasses of the generated contract models, with Python-only binary payload
  attachment kept as the only retained behavior on those types
- backend-only helper payloads such as realtime UI-change and dependency-event
  broadcast content have been moved out of the retained listener type module
  and now live on the backend websocket type side instead
- the backend websocket type module no longer keeps the dead
  `ProjectStateSingleConfigWithCompletedOpIds` envelope, so that retained
  module no longer imports `ProjectStateSingleConfig` just to carry an unused
  latest-state payload wrapper
- the handwritten listener DTOs that remain in the retained listener type
  module are now limited to the binary payload attachment shim layer around the
  generated nested entry models

Current Phase 6 boundary:

- keep the Python-only binary payload attachment shim on the nested
  `ListenerRealtimeDelta` and `DependencyEvent` wrappers unless that behavior
  moves into the generated contract layer itself
- keep any future backend-only helper payloads out of the retained listener
  type module unless they are promoted into the retained SDK contract family

Phase 6 status:

- complete for the active retained SDK path
- the production Python API/share surfaces no longer import
  `ProjectStateSingleConfig`; the remaining Python project-state modules are no
  longer on the active retained SDK path and therefore no longer block this
  plan

### Phase 7. Packaging, Versioning, And CI Hardening

Finalize the retained Python boundary as a supported surface.

Concrete work:

- bundle or locate the local Go core binary in a platform-correct way
- add explicit protocol/core version handshake checks
- add contract/codegen drift CI
- add Python-to-Go integration coverage
- add release smoke tests for:
  - packaged wheel
  - running-backend SDK path
  - local-core SDK path

Success condition:

- the packaged Python SDK is reliable across supported platforms and cannot
  silently drift from the Go core

Phase 7 progress:

- the generated retained-Python SDK contract base model no longer sets
  `extra="forbid"`, because that Pydantic config breaks nested discriminated
  dependency-key unions and prevents the generated listener contract models
  from round-tripping their own JSON
- Go generator coverage now fails if the shared generated base model regains
  that strict-extra setting
- retained Python test coverage now directly proves that generated
  `ListenerRegisterRequest` and `ListenerForceRefreshEvent` models round-trip
  dependency-key unions, which is required before more listener DTOs can be
  deleted in Phase 6
- CI now runs the Go-side retained SDK contract generator test job directly in
  `.github/workflows/ci.yml`, so drift between `internal/pythonsdkcontracts`
  and the checked-in generated Python contract module fails in the default CI
  path instead of only during local focused testing
- `internal/app` now includes a live Python-to-Go integration test for the
  running-backend SDK path: it starts a real Go app server, runs the retained
  Python `SettaRunner` against that server, and verifies runner summary lookups
  across the actual auth, metadata, and runner-summary routes instead of
  relying only on unit-level monkeypatch coverage
- the running-backend SDK path now has an explicit fail-closed version
  handshake contract: Go exposes a dedicated generated handshake payload with
  backend sdk version, core version, and sdk-contract version, and both the
  retained Python runner and listener verify that against the local Python
  package version plus the generated contract-version constant before using the
  backend
- `verify_install.sh` now performs a real packaged local-core smoke after the
  built sdist install by starting `python -m setta sdk-local-core` from the
  installed package, verifying the handshake payload, and exercising a real
  realtime dependency render command over the actual stdio command/result
  boundary instead of treating `uv pip install` success alone as sufficient
  package smoke
- `internal/app` now also includes a live `SettaListener` integration test for
  the running-backend SDK path: it starts a real Go websocket server on a real
  bound port, lets the retained Python listener complete bootstrap +
  registration against that server, and asserts that listener metadata is
  hydrated from the authoritative Go force-refresh snapshot
- the retained Python SDK now also has a real local-core subprocess test:
  `tests/api/test_local_core.py` starts the hidden Go `sdk-local-core`
  command through the packaged/source-checkout Python entrypoint path and
  verifies realtime dependency rendering across the actual stdio handshake and
  command/result contract boundary

Phase 7 status:

- complete for the running-backend retained SDK path
- complete for the local-core-specific release/install smoke path

## Recommended First Implementation Sequence

Use this order for actual implementation work:

1. Phase 0 inventory
2. Phase 1 contract layer
3. Phase 3 runner pilot
4. Phase 4 listener completion
5. Phase 5 local-core introduction for the remaining canonical listener gap
6. Phase 6 deletion
7. Phase 7 hardening

This order is intentional.

It delays the most invasive part, the local-core process boundary, until the
repo knows how much of the local-canonical problem remains after richer
backend-authored contracts are in place.

## Decision Gates

### Gate A. Contract Technology

Default:

- Protobuf + Buf + generated Go/Python artifacts

Acceptable fallback only if a concrete repo constraint blocks that path:

- another generated schema pipeline with one contract source of truth and
  explicit drift/codegen validation

Not acceptable:

- hand-maintained duplicate DTOs long term

### Gate B. Local-Core Need

Do not build the local core just because it sounds architecturally tidy.

Build it only if, after the runner/listener contract work, there are still
canonical SDK-local operations that:

- cannot be pushed into richer backend-authored snapshots
- cannot remain Python ergonomic helpers
- must execute without sending a request to the running backend

Gate B outcome:

- satisfied by the retained listener realtime path, which still needed
  canonical Setta dependency rendering locally after phases 1 through 4

### Gate C. Local-Core Transport

Default preference:

- managed process boundary with typed RPC

Do not approve:

- in-process Go/Python ABI work as the first implementation

Only revisit FFI if:

- profiling shows the process boundary is materially insufficient
- the command surface is already proven stable and narrow
- packaging complexity is justified by real workloads

## Testing And Verification Plan

### Contract Tests

- generated Go/Python artifacts compile/import cleanly
- contract/codegen drift checks run in CI
- snapshot/event payload fixtures round-trip across both languages

### Python SDK Integration Tests

- `SettaRunner` against a real Go backend
- `SettaListener` against a real Go websocket route
- local-core adapter against a real managed Go subprocess
- version mismatch and transport failure behavior

### Cross-Path Parity Tests

For any behavior supported through both a running-backend path and a local-core
path, assert equivalent canonical results for the same contract inputs.

### Packaging Smoke Tests

- wheel install
- packaged Go binary discovery
- local-core bootstrap
- share/listener/runner retained boundary smoke coverage

## Expected Codebase Effects

### Python Code Should Trend Toward

- thin adapters
- ergonomic facades
- metadata-backed helper containers
- generated DTO imports
- explicit transport/session management

### Go Code Should Trend Toward

- shared internal packages usable by both the main backend and any local-core
  entrypoint
- authoritative contract materialization
- explicit versioned command/event/snapshot boundaries

## Risks

### Risk 1. Overbuilding The Local Core Too Early

If the repo introduces a local Go core before contracting the boundary, it will
likely recreate current duplication in a different place.

Mitigation:

- contract first
- runner pilot first
- local core only for proven residual canonical gaps

### Risk 2. Turning The SDK Into A Raw Transport Wrapper

If too much Python logic is deleted indiscriminately, the SDK becomes clumsy for
users.

Mitigation:

- keep Python ergonomic builders and callback patterns
- remove only canonical backend ownership, not user-facing conveniences

### Risk 3. Dual Go Owners

If the local core and the main backend diverge internally, duplication simply
moves from Python/Go to Go/Go.

Mitigation:

- local core must call the same internal packages and semantics as the main
  backend runtime

### Risk 4. Contract Churn

If the contract surface mirrors too much internal structure, it will be noisy
and unstable.

Mitigation:

- command/event/snapshot design
- coarse-grained boundaries
- explicit breaking checks

## Success Criteria

The plan succeeds when all of the following are true:

- the public Python SDK remains pleasant and Pythonic
- the running-backend communication path remains straightforward
- canonical Setta semantics have one owner: Go
- new DTOs and protocol shapes are not hand-duplicated in two languages
- any required serverless canonical local logic is Go-owned behind a narrow
  process boundary
- Python local logic remains only where it is intentionally ergonomic and
  non-authoritative

## Relationship To Existing Rewrite Docs

- `setta-listener-protocol-redesign-plan.md` remains the authoritative slice doc
  for the listener websocket/built-in endpoint path
- this plan is the broader architecture/implementation plan for the retained Python
  SDK as a whole
- `unused-python-deletion-plan.md` governs the eventual deletion work after the
  retained Python boundary is thinned
- `CURRENT.md` should route SDK-boundary architectural questions here
