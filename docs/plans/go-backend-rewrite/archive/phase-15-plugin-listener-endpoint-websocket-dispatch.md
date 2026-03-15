# Phase 15 Plugin Listener Endpoint Websocket Dispatch

## Purpose

This doc scopes the next bounded Phase 15 follow-on: letting the Go-owned
listener websocket route dispatch plugin-registered listener endpoints over the
existing Go backend worker runtime.

The goal is to close the remaining plugin listener gap without widening into
built-in listener-router endpoint ownership, Python websocket compatibility
work, or mutation-time backend runtime refresh.

## Status

Landed on 2026-03-09.

## Scope

This slice covers:

- plugin listener-endpoint invocation from the existing Go listener websocket
  route at `/ws/listeners/{listenerID}`
- dispatch through the live Go `internal/plugins.BackendRouteRuntime`
- thin websocket result transport for:
  - successful plugin endpoint calls
  - unknown endpoint failures
  - registration / project mismatch failures
- focused Go tests in:
  - `internal/wsapi`
  - `internal/app`

## Non-Goals

- built-in listener-router endpoint dispatch
- Python `/pythonScript/{id}` websocket compatibility
- `ListenerInit` bootstrap handshake support on the Go route
- listener temporary-id negotiation / remapping
- built-in listener endpoint name conflict validation
- mutation-time plugin backend runtime refresh

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-15-plugin-read-project-state-and-listener-registration-runtime.md`
- `backend/setta/websockets/msg_handlers/python_script_receiver.py`
- `backend/setta/plugins/manager.py`
- `tests/websockets/test_python_script_receiver.py`
- `tests/fixtures/plugins/backend/backend/entrypoint.py`
- `internal/wsapi/routes.go`
- `internal/realtime/listener_messages.go`
- `internal/plugins/backend_route_runtime.go`

## Working Decisions

- keep the transport thin
  - websocket parsing/validation stays in `internal/wsapi`
  - plugin endpoint execution stays in `internal/plugins`
- treat the current Go listener route bootstrap as the source of truth
  - the route already requires `projectId` in the websocket URL
  - plugin endpoint payloads inherit that canonical project id when the payload
    omits `projectConfigId`
  - payloads that provide a different `projectConfigId` fail explicitly with
    `project_config_mismatch`
- dispatch only plugin-owned listener endpoints in this slice
  - if the Go backend runtime does not own the endpoint name, return
    `listener_call_failed` with `unknown listener endpoint: <name>`
- do not invent temporary-id behavior without a real caller
  - the Go listener route has no current init/temporary-id negotiation surface
  - this slice keeps canonical project ids only

## Implementation

### Slice 1: Plugin Runtime Invocation Surface

Completed:

- add a typed plugin listener-endpoint invocation method to
  `internal/plugins.BackendRouteRuntime`
- route endpoint names through the existing captured listener-endpoint
  registrations
- execute the registered backend route through the existing worker session
  boundary

- unknown endpoint names fail from the runtime with a deterministic
  `unknown listener endpoint: <name>` error
- live plugin worker route calls still require a running worker session
- non-2xx plugin route responses fail as listener call errors instead of being
  passed through as success payloads

### Slice 2: Listener Websocket Dispatch

Completed:

- add listener router endpoint call/result message types in `internal/realtime`
- extend `internal/wsapi` listener decoding and dispatch
- send websocket results for:
  - success
  - `listener_not_registered`
  - `project_config_mismatch`
  - `listener_call_invalid_operation`
  - generic `listener_call_failed`

- listener endpoint calls require prior `ListenerRegister`
- successful plugin endpoint calls return `ListenerRouterEndpointResult`
- plugin payloads inherit the websocket project id when omitted
- mismatched payload project ids fail before plugin execution

### Slice 3: App Wiring And Tests

Completed:

- wire the app’s plugin backend runtime into `internal/wsapi`
- add wsapi route tests for:
  - plugin endpoint success
  - unknown plugin endpoint failure
  - project id injection / mismatch handling
- add an app websocket test using the real backend fixture plugin

- the real IDE app can call a plugin listener endpoint over the Go listener
  websocket and observe the result payload
- plugin-emitted dependency events from that listener endpoint still flow
  through the existing Go listener producer path

## Decisions

- kept the Go listener route bootstrap as the only source of truth for project
  scope in this slice
  - `projectId` from the existing websocket route remains canonical
  - plugin payloads inherit that id only when they omit `projectConfigId`
- kept plugin listener endpoint execution in the backend runtime instead of
  re-encoding it in the websocket transport
- kept unknown plugin listener endpoints on the generic
  `listener_call_failed` websocket error surface with an explicit
  `unknown listener endpoint: <name>` detail message
  - this matches the current plugin-only failure boundary without inventing a
    broader built-in endpoint registry first

## Verification

- `./scripts/go.sh test ./internal/plugins -run 'TestBackendRouteRuntime(InvokesFixtureListenerEndpoints|SupportsProjectStateReadsAndListenerRegistrations)' -count=1`
- `./scripts/go.sh test ./internal/wsapi -run 'TestRegisterRoutesListener(EndpointCall(RequiresRegistration|DispatchesPluginEndpointAndInjectsProjectID|RejectsPayloadProjectMismatch|ReturnsUnknownPluginEndpointError)|RegistersCallbacksAndReceivesRealtimeMessages)' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestApp(ListenerWebsocketDispatchesPluginListenerEndpoint|ServesListenerCoverageRoute|ServesPluginBackendProjectStateAndListenerRoutes)' -count=1`

## Deferred

- built-in listener-router endpoint dispatch
- listener temporary-id remapping
- Python listener websocket route convergence
- the plugin runtime refresh follow-on that this slice deferred landed later
  in:
  - `phase-15-plugin-backend-runtime-refresh-after-mutations.md`

## Next Recommended Step

Do not widen listener websocket work speculatively.

The next concrete follow-on should only start when a caller requires one of:

- built-in listener-router endpoint dispatch with a Go-owned source of truth
- listener temporary-id negotiation on the Go websocket route
- any remaining share/app-mode plugin backend-host ownership that cannot stay
  deferred
