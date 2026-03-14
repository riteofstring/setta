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
  - listener coverage and force-refresh reads/writes
  - listener websocket DTOs in `internal/realtime`
- Python still owns:
  - local dependency-graph rebuilding and generated runtime state
  - remaining built-in listener endpoint dispatch outside the current
    manifest-backed `GoHTTPRoutes` subset
  - share listener runtime coupling through
    `backend/setta/share/listener_runtime.py`

That split is exactly the kind of duplicate backend ownership the rewrite is
trying to remove.

## Working Decision

- Keep the public Python listener SDK surface.
- Move listener websocket/bootstrap/endpoint/mutation authority to Go.
- Do not keep `/pythonScript/{id}` as a long-lived compatibility boundary.
- Do not add FFI, embedded Go, or subprocess RPC just so Python can call Go
  functions directly.
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

## Retained Python Surface

This slice keeps the authoring API, not the backend transport/runtime:

- `setta.api.SettaListener`
- `setta.api.ListenerHotReloader`
- `setta.api.chat_toolkit`
- share listener entrypoints that instantiate `SettaListener`

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
- Rebuild the Python-side state helpers on top of Go-provided metadata.

Exit condition:
listener tests pass without Python owning dependency graph or runtime state.

### Step 4. Move Built-In Endpoint Dispatch And Mutation Effects To Go

- Extend the current Go-owned built-in listener endpoint dispatch from the
  manifest-backed `GoHTTPRoutes` subset to the remaining required listener
  endpoint surface.
- Unify built-in and plugin listener endpoint invocation.
- Replace any remaining local heuristic mutation patching with authoritative Go
  patch/refresh results.

Exit condition:
built-in listener router calls no longer require Python backend dispatch or
local heuristic updates.

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

### Step 6. Cut Over Share Listener Runtime And Remove Python Transport

- Update `backend/setta/share/listener_runtime.py` to use the Go-owned
  listener protocol.
- Remove `/pythonScript/{id}` from supported listener workflows.
- Keep superseded Python listener backend files in-tree until the overall
  rewrite is complete if that makes merges from `main` easier. They should no
  longer be treated as active ownership once the listener workflows are cut
  over.

Exit condition:
direct Python listener usage and share listener flows no longer depend on
Python listener backend transport.

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
- Go owns built-in listener endpoint dispatch
- authoritative Go mutation effects replaced Python local heuristics
- share listener entrypoints use the same Go-owned listener protocol
- the current source-of-truth docs no longer list built-in listener endpoint
  parity as partial for active listener-backed workflows
