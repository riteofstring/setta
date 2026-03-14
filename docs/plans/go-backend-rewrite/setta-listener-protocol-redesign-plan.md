# SettaListener Protocol Redesign Plan

## Purpose

This doc covers the rewrite slice for keeping the public Python
`setta.api.SettaListener` authoring surface while moving listener websocket,
bootstrap, endpoint-dispatch, and mutation authority to Go.

Use this doc when a task touches any of these boundaries:

- `setta.api.SettaListener`
- `setta.api.chat_toolkit`
- `setta.api.hot_reload`
- share deployment listener entrypoints
- built-in listener endpoint dispatch
- listener websocket protocol design

## Why This Slice Is Open Now

- The current caller-backed checklist still marks built-in listener endpoint
  parity beyond the active plugin listener caller surface as partial.
- The active Go websocket route already owns plugin listener endpoint dispatch
  on `/ws/listeners/{listenerID}`, but the public Python listener SDK still
  depends on the Python `/pythonScript/{id}` websocket family.
- The product direction for this slice is to keep the Python listener authoring
  experience, not to preserve or expand the Python backend transport/runtime.
- The current Python listener stack duplicates backend semantics locally through
  dependency-graph construction, Python code generation, runtime hydration,
  local endpoint-update heuristics, and Python-owned built-in endpoint
  dispatch.

## Current State And Evidence

Current Go ownership:

- `internal/wsapi/routes.go`
  - Go-owned `/ws/listeners/{listenerID}` route already handles listener
    registration and plugin listener endpoint dispatch.
- `internal/realtime/listener_messages.go`
  - Go-owned listener message DTOs currently cover registration, plugin
    endpoint calls/results, realtime deltas, dependency events, and force
    refresh.

Current Python listener SDK/backend coupling:

- `backend/setta/api/listener.py`
  - still connects to `/pythonScript/{id}`
  - still sends `ListenerInit`
  - still rebuilds `DependencyGraph`
  - still generates Python runtime code and instantiates `state`
  - still applies `router_endpoint_local_updates`
- `backend/setta/websockets/msg_handlers/python_script_receiver.py`
  - still owns project-name bootstrap resolution
  - still owns temporary-id negotiation and conversion
  - still owns built-in listener endpoint dispatch
  - still owns `emit_to_frontend` resolution/application
- `backend/setta/listeners/listener_router_endpoint_registry.py`
  - Python-owned built-in listener router endpoint inventory
- `backend/setta/listeners/router_endpoint_local_updates.py`
  - Python-owned heuristic local mutation patching after endpoint calls
- `backend/setta/share/listener_runtime.py`
  - share deployment listener entrypoints create `SettaListener` instances
    today, so share listener workflows ride on the same protocol boundary

Public Python SDK evidence:

- `backend/setta/api/__init__.py`
  - exports `SettaListener`, `ListenerHotReloader`, listener chat helpers, and
    `SettaRunner`
- `docs/reference/setta-listener-examples.md`
- `docs/reference/setta-listener-hot-reload.md`
- `docs/reference/chat-toolkit.md`
- `tests/api/test_listener_*.py`
- `tests/share/test_listener_runtime.py`

## Working Decision

Recommended direction:

- Keep the public Python `SettaListener` SDK surface.
- Do not keep the Python listener backend transport/runtime as an active
  rewrite target.
- Do not use FFI, embedded Go, or subprocess RPC so Python can "call Go
  functions" directly.
- Redesign the listener protocol so Go owns:
  - project resolution and bootstrap
  - listener dependency metadata
  - snapshot/delta/event payloads
  - built-in listener endpoint dispatch
  - authoritative post-mutation patches or refreshes
  - listener update application for `emit_to_frontend`
- Make the Python listener runtime thin:
  - websocket lifecycle
  - auth/session discovery
  - callback scheduling
  - hot reload
  - metadata-backed state/container helpers

## Scope

In scope:

- Go-owned listener bootstrap handshake for project-id, project-name, and
  default-project selection
- Go-owned listener snapshot, delta, action-event, and registration DTOs
- Go-owned built-in listener endpoint dispatch
- Go-owned authoritative mutation effects for endpoint calls and
  `emit_to_frontend`
- Python listener refactor to remove local dependency-graph/codegen ownership
- Python listener-adjacent surfaces that ride on the same runtime:
  - `ListenerHotReloader`
  - `setta.api.chat_toolkit`
  - share deployment listener entrypoints
- Go-owned source of truth for Python listener endpoint bindings if
  `generated_listener_endpoints.py` remains part of the public SDK

Out of scope:

- preserving `/pythonScript/{id}` as a long-lived boundary
- preserving temporary-id support unless a current caller proves it is still
  required
- FFI/shared-library or subprocess bridges from Python into Go
- rewriting listener authoring into Go
- broad redesign of unrelated Python package surfaces
- reopening plugin listener endpoint runtime work that already landed in Go

## Public Python Surface Triage

Primary redesign target:

- `setta.api.SettaListener`
  - this is the public surface with the duplicated local runtime problem

Listener-adjacent Python surfaces that must move with it:

- `setta.api.ListenerHotReloader`
  - callback rebuild/watch behavior rides directly on `SettaListener`
- `setta.api.chat_toolkit`
  - these helpers call listener router endpoints and consume listener
    callbacks/events
- `backend/setta/share/listener_runtime.py`
  - share listener entrypoints instantiate `SettaListener` and depend on the
    same websocket/runtime contract

Public Python surfaces that do not currently need the same redesign:

- `setta.api.SettaRunner`
  - thin HTTP client over existing backend routes; no duplicate local listener
    runtime
- `setta.llm.chat_toolkit`
  - library utilities, not a backend transport/runtime boundary
- Python dev startup/reload tooling
  - already documented as an explicit retained Python boundary for the rewrite

Conclusion:

- This is not just the bare `SettaListener` class.
- It is the `SettaListener` family: listener SDK, hot reload, chat helpers,
  and share listener entrypoints.
- No other current public Python surface has the same "duplicate backend
  runtime semantics in-process" problem.

## Problems To Remove

- Go listener sockets currently require `projectId` on the route query, while
  the Python listener expects project-name or default-project bootstrap through
  a `ListenerInit` message.
- The Python listener rebuilds `DependencyGraph`, regenerates Python code, and
  rehydrates local state from `ProjectStateSingleConfig`, creating dual
  ownership of listener metadata and runtime semantics.
- Built-in listener router endpoint dispatch still lives in Python; Go only
  owns plugin listener endpoint dispatch.
- Post-endpoint local state changes currently depend on the heuristic
  `router_endpoint_local_updates.py` pathway instead of an authoritative server
  result.
- Temporary-id translation is Python-server-owned complexity that should not be
  carried forward by default.
- `generated_listener_endpoints.py` is a large Python client surface with no
  current Go-owned source of truth if listener endpoint ownership moves to Go.

## Target Architecture

### 1. Connection And Bootstrap

Recommended shape:

- Keep `/ws/listeners/{listenerID}` as the canonical Go listener websocket
  route.
- Keep the existing `projectId` query support for the active plugin caller.
- Add an explicit bootstrap message for Python SDK/share listener clients that
  do not know the project ID upfront.
- Resolve project selection in Go from:
  - explicit `projectConfigId`
  - explicit `projectName`
  - default project when neither is provided and the mode allows it
- Return an explicit bootstrap ack or bootstrap error from Go rather than
  relying on Python `/pythonScript/{id}` semantics.

Recommended protocol fields:

- protocol version
- project selector
- share session scope, when applicable
- capability flags only where they express real protocol behavior

Explicitly not recommended:

- a second compatibility websocket route just for Python listeners
- keeping `useTemporaryIds` as a default protocol feature

### 2. Listener State Contract

The server should stop shipping `ProjectStateSingleConfig` as the listener
source of truth for the Python SDK.

Instead, Go should provide a listener-focused snapshot contract that includes:

- project identity
- dependency catalog
- current listener-visible values
- sequence reset point
- any metadata needed for `ctx.ids`, `ctx.values.by_id`, and dependency-name
  resolution

Recommended dependency catalog shape:

- stable dependency identity based on the canonical dependency key
- canonical listener dependency name used by existing Python listener authors
- section ID and optional param/code-object ID
- enough dependency kind metadata to support value hydration and ID helpers

Recommended Python-side state shape:

- generic metadata-backed state container
- preserve `state.foo__bar` style access for listener authors
- preserve `ctx.changed` keyed by canonical dependency names
- preserve `dep_id(...)`, `ctx.ids.*`, and `ctx.values.by_id(...)` using the
  Go-provided dependency catalog

Not recommended:

- rebuilding the full dependency graph in Python
- executing generated Python state code from project snapshots

### 3. Registration And Filtering

Registration should remain callback-oriented, but the server should become the
only dependency-resolution authority.

Recommended shape:

- Python client sends callback registration using declared dependency names and
  dependency mode
- Go resolves those names against the bootstrap dependency catalog
- registration ack returns accepted/rejected status and enough resolved
  metadata for client bookkeeping
- Go remains the only owner of server-side listener filtering

This keeps the existing authoring API shape while removing Python
dependency-resolution ownership.

### 4. Realtime Deltas And Action Events

Recommended shape:

- realtime deltas and action events are emitted from Go using the same
  dependency identities introduced in the bootstrap catalog
- payloads carry typed values/events directly
- sequence handling remains Go-owned and share-session-aware
- binary payload support stays explicit in the protocol rather than implicit in
  Python-only websocket helpers

The Python client should apply updates through metadata-backed state mutation,
not through dependency-graph or generated-code introspection.

### 5. Built-In Listener Endpoint Dispatch

Go must become the single runtime owner for listener endpoint dispatch:

- plugin listener endpoints are already Go-owned
- built-in listener endpoints should join the same Go-owned invoker boundary

Recommended source of truth:

- explicit Go-owned endpoint specs and DTOs
- no Python listener router registry as the long-term source of truth

The built-in listener endpoint path should be designed so that:

- HTTP handlers and listener endpoint contracts derive from the same explicit
  Go boundary declarations where possible
- endpoint naming stays deterministic and reviewable
- unsupported or ambiguous contract shapes fail closed instead of silently
  degrading

### 6. Authoritative Mutation Effects

The Python client should stop guessing post-mutation state changes.

Recommended rule:

- every listener endpoint result or listener-originated update application
  should produce authoritative effects from Go

Preferred effect forms:

- explicit dependency patches when the changed listener-visible values are
  known precisely
- explicit full refresh when the affected state is too broad or expensive to
  patch precisely

Not acceptable:

- heuristic client-side local patching like
  `router_endpoint_local_updates.py`

This same rule applies to `emit_to_frontend`:

- keep the Python API method if it remains useful
- change the protocol so Go resolves, validates, applies, and broadcasts the
  resulting updates using the listener dependency catalog as the source of
  truth

### 7. Python Listener Endpoint Bindings

`setta.api.chat_toolkit` and other listener helpers currently depend on
`generated_listener_endpoints.py`.

Recommended direction:

- if a generated Python listener endpoint client remains part of the public
  SDK, make it Go-owned
- drive it from explicit Go endpoint specs/DTOs instead of the current
  Python-owned registry/contracts
- keep generation fail-closed; do not hand-maintain a long-lived Python blob

Practical source-of-truth direction:

- reuse the existing explicit-Go-contract pattern already established in
  `internal/frontendbindings`
- add a sibling Go-owned generator/output for the Python listener SDK only if
  the current public helper surface actually requires it

## Execution Plan

### Step 1. Lock The Protocol Contract

Deliverables:

- define the target listener bootstrap, snapshot, delta, event, registration,
  endpoint-call/result, and update-application DTOs
- decide the protocol versioning and cutover rules
- document the recommended dependency identity model:
  canonical dependency key plus canonical dependency name alias

Exit criteria:

- there is one written protocol contract
- temporary IDs are either explicitly removed from scope or called out as a
  proven caller requirement

### Step 2. Add Go Bootstrap And Snapshot Ownership

Deliverables:

- extend `internal/wsapi` and `internal/realtime` with explicit listener
  bootstrap handling
- add Go project-name/default-project resolution for listener bootstrap
- add a Go listener snapshot builder that emits listener-specific metadata and
  values instead of raw `ProjectStateSingleConfig`

Exit criteria:

- a Python or share listener can bootstrap entirely against the Go websocket
  route without Python `/pythonScript/{id}` support

### Step 3. Thin The Python Listener Runtime

Deliverables:

- switch `backend/setta/api/listener.py` to the Go listener websocket route
- replace local dependency-graph/codegen/runtime-state construction with a
  metadata-backed state container
- preserve public callback ergonomics:
  - `@listener.listen(...)`
  - `state.foo__bar`
  - `ctx.changed`
  - `ctx.ids.*`
  - `ctx.values.by_id(...)`
  - hot reload scheduling behavior

Exit criteria:

- the core Python listener tests pass without Python ownership of dependency
  graph or generated runtime state

### Step 4. Move Built-In Endpoint Dispatch And Mutation Effects To Go

Deliverables:

- implement Go-owned built-in listener endpoint dispatch
- unify plugin and built-in listener endpoint invocation under a Go-owned
  boundary
- add authoritative patch-or-refresh effects for listener endpoint results
- remove client-side reliance on `router_endpoint_local_updates.py`

Exit criteria:

- built-in listener router calls no longer require Python backend dispatch or
  heuristic local updates

### Step 5. Move Listener Endpoint Binding Ownership To Go

Deliverables:

- decide whether `generated_listener_endpoints.py` remains as generated API
  surface or is replaced by a smaller Go-owned Python client layer
- if it remains, generate it from Go-owned endpoint specs and DTOs
- update `setta.api.chat_toolkit` to consume the Go-owned listener endpoint
  client boundary

Exit criteria:

- built-in listener endpoint contracts have one Go-owned source of truth

### Step 6. Cut Over Share Listener Runtime And Remove Python Backend Transport

Deliverables:

- update `backend/setta/share/listener_runtime.py` to use the Go-owned listener
  protocol
- remove the Python `/pythonScript/{id}` transport/runtime from active
  listener workflows
- remove now-unused Python listener backend components once tests/docs are cut
  over

Exit criteria:

- share listener entrypoints and direct Python listener usage no longer depend
  on Python listener backend transport

## Verification Plan

Go coverage to add or extend:

- listener bootstrap success/failure cases
  - project ID
  - project name
  - default project
  - share session scoping
- listener snapshot generation and refresh behavior
- built-in listener endpoint dispatch
- authoritative mutation patch/refresh result handling
- `emit_to_frontend`-style update application
- listener sequence reset and force-refresh behavior

Python coverage to preserve or adapt:

- `tests/api/test_listener_realtime.py`
- `tests/api/test_listener_router_endpoint_calls.py`
- `tests/api/test_listener_dependency_translation.py`
- `tests/api/test_listener_hot_reload.py`
- `tests/api/test_listener_websocket_endpoint.py`
- `tests/share/test_listener_runtime.py`
- `tests/llm/test_chat_toolkit_listener_clients.py`

Tests expected to shrink or disappear after cutover:

- `tests/websockets/test_python_script_receiver.py`
- `tests/websockets/test_python_script_receiver_app_mode.py`
- `tests/websockets/test_python_script_receiver_share_mode.py`
- Python-only local-update heuristic tests tied to
  `router_endpoint_local_updates.py`

Manual verification follow-up:

- update `tests/manual_listener_smoke.py` so it proves the Go-owned listener
  route and snapshot protocol

## Recommended Choices On Open Design Points

### Dependency Identity

Recommended:

- protocol identity should use canonical dependency keys plus canonical
  dependency names as user-facing aliases

Why:

- keys are stable and source-of-truth friendly
- names preserve the current Python authoring ergonomics

### Post-Mutation Sync

Recommended:

- authoritative patches when precise
- explicit full refresh when not precise

Why:

- this removes the current heuristic local update path without forcing full
  refreshes for every endpoint call

### Python Bindings Source Of Truth

Recommended:

- Go-owned explicit endpoint specs and DTOs

Why:

- the repo already uses this pattern successfully for TypeScript frontend
  bindings
- it avoids a second handwritten Python contract registry

## Closeout Condition

This slice is complete when all of the following are true:

- the public Python listener SDK still works for supported workflows
- listener websocket/bootstrap/runtime authority is Go-owned
- built-in listener endpoint dispatch is Go-owned
- authoritative mutation effects replace Python client heuristics
- share listener entrypoints use the same Go-owned protocol
- the current source-of-truth docs no longer list built-in listener endpoint
  parity as partial for the active listener-backed workflows
