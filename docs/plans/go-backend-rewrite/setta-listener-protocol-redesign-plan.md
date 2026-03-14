# SettaListener Protocol Redesign Plan

Use this doc when work touches any of these boundaries:

- `setta.api.SettaListener`
- `setta.api.ListenerHotReloader`
- `setta.api.chat_toolkit`
- share listener entrypoints
- listener websocket protocol design
- built-in listener endpoint dispatch

## Why This Slice Exists

The rewrite should keep the public Python listener authoring surface while
removing Python backend ownership of listener websocket/bootstrap/runtime
behavior.

Current state:

- Go already owns:
  - `/ws/listeners/{listenerID}` for the active plugin listener path
  - active `SettaListener` and share-listener websocket transport on that
    route through the retained Python client
  - listener bootstrap resolution on that route for `projectConfigId`,
    `projectName`, default-project fallback, and share-session scope
  - bootstrap success/error replies on that route via
    `ListenerForceRefresh` and `ListenerError`
  - listener register parsing on that route for both plugin string
    dependencies and Python-style structured dependency keys
  - structured dependency-key emission on listener realtime/dependency event
    payloads
  - dependency-backed `ListenerFrontendEmit` project mutations for section
    params, `TextBlock`, `Chat`, and `Plugin` sections on that route, plus
    authoritative `UpdateFrontendProjectState` broadcasts to frontend clients
  - `ListenerFrontendEmit` artifact updates on that route, including
    validation, IDE/share artifact-service dispatch, and `UpdateArtifacts`
    frontend broadcasts
  - built-in listener endpoint dispatch on that route for manifest-backed
    `GoHTTPRoutes` endpoint names that already map to Go `POST /api` handlers
    without path params
  - scriptable listener chat history/metadata CRUD on that route for
    `route_create_chat`, `route_get_chat`, `route_append_chat_messages`,
    `route_set_chat_system_prompt`, `route_get_all_chat_metadata`, and
    `route_delete_chat`
  - frontend `LLMStreamingResponse` broadcasts on that route for
    `route_emit_chat_stream_delta`
  - scriptable listener chat-toolkit tool execution on that route for
    `route_run_mcp_tools`, including Setta MCP per-chat allowlist checks and
    scoped call metadata
  - authoritative `ListenerForceRefresh` follow-up after Go-owned
    `route_set_chat_section_state` calls on that route so chat section sync no
    longer depends on client-side heuristic patching; the retained Python SDK
    now waits on the correlated force-refresh `callId` instead
  - the active Python listener/chat-toolkit endpoint client boundary now lives
    in `backend/setta/api/listener_endpoint_client.py` instead of the old
    Python route-introspection generator
  - authoritative cached dependency values now back
    `ctx.values.by_id(...)`, and unresolved reads now fail through the same
    metadata-backed callback-state path instead of depending on the generated
    runtime instance
  - authoritative cached dependency values now survive snapshot refresh and
    realtime delta application even when the generated Python listener runtime
    instance is unavailable
  - callback execution now falls back to a metadata-backed fail-closed state
    view when the generated Python listener runtime instance is unavailable,
    including snapshot replay and realtime callback scheduling
  - listener cache rebuilds and direct dependency hydration no longer keep a
    long-lived `PythonCodeGenerator` inside `ListenerRuntimeState`; they now
    render direct node expressions from shared dependency metadata instead
  - listener ID helpers now resolve meta-control param IDs from dependency
    graph metadata instead of retaining project-state coupling for that path
  - `ListenerRuntimeState` no longer retains the full project snapshot; the
    remaining chat snapshot fallback reads the explicit refresh/replay snapshot
    input instead
  - Go listener bootstrap/force-refresh snapshots now carry an authoritative
    dependency catalog, and retained Python listener bookkeeping now consumes
    that catalog for callback dependency names, `ctx.ids.*`,
    `ctx.values.by_id(...)`, and `ctx.changed_by_id`, including cached
    snapshot replay
  - Go listener bootstrap/force-refresh snapshots now also carry rendered
    dependency values, and retained Python uses those values first for
    metadata-backed cache rebuild and cached snapshot replay when the generated
    runtime instance is unavailable
  - Go listener dependency catalogs now also carry the direct value-codec
    metadata the retained Python client needs for active realtime delta
    hydration, so no-runtime listener callbacks can apply metadata-expressible
    direct deltas without rebuilding the local Python dependency graph
  - Go listener dependency catalogs now also carry canonical child dependency
    edges and node names, and retained Python uses that metadata to recompute
    dict/list-style composite cached values after no-runtime realtime child
    deltas instead of mutating the local Python dependency graph
  - when Go bootstrap/force-refresh snapshots include authoritative
    `dependencyValues`, retained Python now rebuilds no-runtime snapshot/replay
    cache state from those values plus catalog edges instead of falling back to
    local dependency-graph cache construction
  - when a no-runtime snapshot/replay arrives without authoritative Go
    `dependencyValues`, the retained Python listener now stays fail-closed
    instead of rebuilding cache state from the local dependency graph
  - listener callbacks now always receive the metadata-backed state view,
    using authoritative cached dependency values only and failing closed when a
    required value is unresolved
  - runtime-present realtime deltas now recompute cached metadata dependents
    too, so the metadata-backed callback state does not serve stale composite
    values after child updates
  - realtime callbacks declared on metadata-recomputable composite listener
    dependencies now fire after child realtime deltas in both the
    runtime-present and metadata-only listener-state paths, instead of only
    waking callbacks declared on the direct child dependency key
  - Go listener snapshot `dependencyValues` now carry literal password and
    meta-control-password values from the Go password secret store instead of
    Python helper-call expressions, so metadata-backed no-runtime listener
    state can hydrate those password-backed dependencies without the retained
    generated runtime
- listener coverage and force-refresh reads/writes
  - listener websocket DTOs in `internal/realtime`
- Python still owns:
  - share listener entrypoints as an explicit retained Python authoring/loader
    boundary over the same Go listener protocol
  - local dependency-graph rebuilding still exists in code today for listener
    metadata/cache construction, but generated-runtime fallback has been
    removed; that remaining duplicate ownership is not retained end state, and
    Go must become authoritative for any listener-visible value needed by
    current callers
  - dormant broader built-in listener endpoint inventory/docs outside the
    active retained chat/chat-section client surface, pending a concrete
    caller before any further port

That split is exactly the kind of duplicate backend ownership the rewrite is
trying to remove.

## Working Decision

- Keep the public Python listener SDK surface.
- Move listener websocket/bootstrap/endpoint/mutation authority to Go.
- Do not retain local dependency-graph rebuilding, Python codegen, or
  generated runtime fallback inside the Python listener SDK.
- Do not keep `/pythonScript/{id}` as a long-lived compatibility boundary.
- Do not add FFI, embedded Go, or subprocess RPC just so Python can call Go
  functions directly.
- If a current listener workflow needs a value that Go cannot yet provide
  authoritatively, treat that as incomplete rewrite work and fix Go rather
  than preserving a Python fallback.
- Do not add heuristic fallback for listener values when Go lacks an
  authoritative source of truth.
- Do not port dormant built-in listener endpoint inventory without a concrete
  current caller.
- Do not keep temporary IDs unless a current caller proves they are still
  required.

Target end state:

- Go is the authority for listener project resolution, dependency metadata,
  snapshots/deltas, endpoint dispatch, and mutation effects.
- Python listener code becomes a thin client:
  - websocket lifecycle
  - auth/session discovery
  - callback scheduling
  - hot reload
  - metadata-backed state/container helpers
  - no local dependency-graph/codegen/runtime reconstruction

## Retained Python Surface

This slice keeps the authoring API, not the backend transport/runtime:

- `setta.api.SettaListener`
- `setta.api.ListenerHotReloader`
- `setta.api.chat_toolkit`
- share listener entrypoints that instantiate `SettaListener`

Retained surface excludes local dependency-graph rebuilding, Python codegen,
and generated-runtime fallback.

`setta.api.SettaRunner` does not currently need the same redesign. It remains
a thin Python HTTP client over backend routes.

## Must Preserve For Listener Authors

- `@listener.listen(...)`
- `state.foo__bar` access
- `ctx.changed`
- `ctx.ids.*`
- `ctx.values.by_id(...)`
- hot-reload ergonomics
- share listener workflows
- chat-toolkit helper ergonomics

## Target Protocol

### 1. Connection And Bootstrap

- Keep `/ws/listeners/{listenerID}` as the canonical Go websocket route.
- Continue to support the existing `projectId` query path for the active plugin
  caller.
- Use `projectConfigId` as the canonical project identifier field inside
  listener websocket payloads, even while the plugin bootstrap query still
  uses `projectId`.
- Add an explicit bootstrap message for Python/share listener clients that do
  not know the project ID up front.
- Let Go resolve project selection from:
  - `projectConfigId`
  - `projectName`
  - default project when mode allows it
  - share-session scope when applicable
- Return bootstrap success as a `ListenerForceRefresh` payload or a structured
  bootstrap error from Go.

Do not add a second long-lived compatibility websocket route for Python
listeners.

### 2. Listener Snapshot And State

The Python listener should stop using `ProjectStateSingleConfig` plus local
dependency-graph/codegen rebuilding as its source of truth.

Go should instead provide a listener-focused snapshot containing:

- project identity
- dependency catalog
- current listener-visible values
- sequence reset point
- metadata needed to support `ctx.ids`, `ctx.values.by_id(...)`, and canonical
  dependency-name lookup

Python should build a metadata-backed state container from that snapshot
instead of generating runtime state code locally.

### 3. Registration And Filtering

- Python should register callbacks using declared dependency names and modes.
- Go should resolve those names against the bootstrap dependency catalog.
- Registration ack should report accepted/rejected dependencies and the
  resolved metadata needed for client bookkeeping.
- Go should remain the only owner of server-side listener filtering.

### 4. Endpoint Dispatch And Mutation Effects

- Go should own built-in listener endpoint dispatch, not only plugin listener
  endpoint dispatch.
- Plugin and built-in listener endpoint invocation should converge on one
  Go-owned boundary.
- After endpoint calls or `emit_to_frontend`, Go should return authoritative:
  - precise patches when possible
  - explicit full refresh instructions when not

The goal is to remove `router_endpoint_local_updates.py`, not to recreate it
in another form. The active `route_set_chat_section_state` path now meets that
goal through correlated authoritative force-refresh handling.

### 5. Python Binding Ownership

The broad Python-generated `generated_listener_endpoints.py` surface is no
longer the active client boundary for listener/chat-toolkit callers. Keep the
retained Python listener endpoint client narrow and tied only to the active
Go-owned listener endpoint set until a fuller Go-to-Python contract pipeline
exists.

## Execution Plan

### Step 1. Lock The Protocol Contract

- Define bootstrap, snapshot, delta, event, registration, endpoint call/result,
  and mutation-effect DTOs.
- Decide protocol versioning and cutover rules.
- Confirm whether temporary IDs are truly still needed.

Exit condition:
there is one written protocol contract and one default path.

### Step 2. Move Bootstrap And Snapshot Ownership To Go

- Extend `internal/wsapi` and `internal/realtime` with Python/share listener
  bootstrap handling.
- Add Go project-name/default-project resolution.
- Add a Go listener snapshot builder with listener-specific metadata.

Exit condition:
Python/share listeners can bootstrap entirely against the Go listener route.

### Step 3. Thin The Python Listener Runtime

- Keep `backend/setta/api/listener.py` on the Go listener websocket route and
  remove the remaining Python runtime-state ownership layered on top of it.
- Remove local dependency-graph/codegen/runtime-state ownership.
- Rebuild the Python-side state helpers on top of Go-provided metadata and
  authoritative cached dependency values.
- Keep metadata-backed fallback state access fail-closed for unresolved known
  dependencies instead of synthesizing heuristic values.
- Require Go-provided snapshot dependency values for metadata-backed cache
  rebuild and replay instead of keeping local snapshot-value fallback.
- Prefer Go-provided dependency metadata for no-runtime direct realtime delta
  hydration instead of retaining a local graph fallback.
- Prefer Go-provided dependency edges for no-runtime composite cache
  recomputation after child deltas, and fail closed for unsupported computed
  deltas instead of mutating a retained Python graph in the live path.
- Prefer Go-provided snapshot dependency values plus dependency edges for
  no-runtime cache rebuild/replay, and fail closed when those authoritative Go
  snapshot values are absent instead of rebuilding cache state from a local
  graph.
- If a current listener-visible value is missing from the Go payload, treat
  that as a Go rewrite blocker rather than preserving a Python fallback.
- Keep the realtime cache coherent with the metadata-backed callback state so
  cached composite reads do not mask fresher child deltas.
- Prefer Go-owned password-secret reads when building listener snapshot values
  so password-backed dependencies do not fall back to Python helper-call
  expressions in the metadata-backed no-runtime path.

Exit condition:
listener tests pass without Python owning dependency graph or runtime state.

Current stop point:

- Active caller-backed listener transport, bootstrap, mutation authority, and
  metadata-backed state/container behavior now run on the Go listener
  protocol.
- Share listener entrypoints remain the retained Python authoring boundary.
- Current code no longer falls back to a local generated runtime for listener
  values, but it still rebuilds dependency metadata/cache state locally in the
  retained Python client; that duplicate ownership is still rewrite debt.
- Current repo listener tests/callers do not show a concrete callable-section
  listener-state dependency that justifies preserving any broader Python
  listener-state runtime.

### Step 4. Finish Active Endpoint Authority Without Recreating Dormant Surface

- Keep built-in and plugin listener endpoint invocation on one Go-owned
  boundary for the active supported listener endpoint surface.
- Extend the current Go-owned built-in listener endpoint dispatch beyond the
  existing manifest-backed `GoHTTPRoutes` plus chat/chat-section surface only
  if a concrete current listener workflow proves it still needs more.
- Replace any remaining local heuristic mutation patching with authoritative Go
  patch/refresh results.

Exit condition:
active built-in listener router calls no longer require Python backend
dispatch or local heuristic updates, and dormant broader inventory is not
treated as an active parity requirement without a caller.

### Step 5. Move Listener Endpoint Binding Ownership To Go

- Keep active listener/chat-toolkit callers on the narrow retained
  `listener_endpoint_client.py` boundary instead of the broad generated Python
  route inventory.
- Replace the remaining Python-owned contract-generation path only when a
  fuller Go-to-Python endpoint DTO/spec pipeline exists.

Exit condition:
active listener endpoint callers do not depend on Python route-introspection
generation, and any remaining broader contract generation path is explicit
cleanup tail.

### Step 6. Keep Retained Share Entry Points On The Go Listener Protocol

- Keep `backend/setta/share/listener_runtime.py` as a retained Python loader
  boundary that instantiates `SettaListener` on the Go listener websocket
  route with `shareSessionId` scope.
- Keep `/pythonScript/{id}` out of supported listener workflows.
- Keep superseded Python listener backend files in-tree until the overall
  rewrite is complete if that makes merges from `main` easier. They should no
  longer be treated as active ownership once the listener workflows are cut
  over.

Exit condition:
direct Python listener usage and share listener flows continue using the
same Go-owned listener transport, with the share entrypoint remaining only as
an explicit retained Python authoring boundary.

## Verification

Go coverage to add or extend:

- listener bootstrap success/failure for project ID, project name, default
  project, and share session scope
- listener snapshot generation and refresh behavior
- built-in listener endpoint dispatch
- authoritative patch/refresh result handling
- `emit_to_frontend` update application
- sequence reset and force-refresh behavior

Python coverage to preserve or adapt:

- `tests/api/test_listener_realtime.py`
- `tests/api/test_listener_router_endpoint_calls.py`
- `tests/api/test_listener_dependency_translation.py`
- `tests/api/test_listener_hot_reload.py`
- `tests/api/test_listener_websocket_endpoint.py`
- `tests/share/test_listener_runtime.py`
- `tests/llm/test_chat_toolkit_listener_clients.py`

Tests that should disappear when the transport leaves Python:

- `tests/websockets/test_python_script_receiver.py`
- `tests/websockets/test_python_script_receiver_app_mode.py`
- `tests/websockets/test_python_script_receiver_share_mode.py`

## Closeout Condition

This slice is done when all of the following are true:

- the public Python listener SDK still works for supported workflows
- Go owns listener websocket/bootstrap/runtime authority
- Go owns built-in listener endpoint dispatch for active supported workflows
- authoritative Go mutation effects replaced Python local heuristics
- share listener entrypoints use the same Go-owned listener protocol
- the current source-of-truth docs no longer list built-in listener endpoint
  parity as partial for active listener-backed workflows
