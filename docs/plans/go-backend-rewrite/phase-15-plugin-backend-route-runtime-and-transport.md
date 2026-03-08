# Phase 15 Plugin Backend Route Runtime And Transport

## Purpose

This doc scopes the next higher-level plugin backend-runtime slice after the
completed Go plugin runtime/config/lifecycle transport work and the completed
backend registration-visibility slices.

Go now owns plugin discovery, status/runtime payloads, config/lifecycle
transport, and worker-backed registration loading for backend language servers,
external-agent adapters, and codegen targets.

What Go still does not own is live backend HTTP route serving for active
plugins that call `register_router(...)`.

The active frontend caller is:

- `frontend/tests/e2e/overview/plugins/plugin-backend-route-payload.spec.ts`

## Current Status

As of 2026-03-09:

- Go worker-host dispatch now normalizes `register_router` payloads during
  backend-registration snapshots so mixed route + language-server plugins do
  not lose their language-server registration visibility
- Go still does not start a live backend plugin worker runtime for route
  serving
- Go still does not serve `/api/plugins/{pluginId}/...` backend plugin routes
- the Python reference implementation already:
  - loads active backend plugins into the live app runtime
  - mounts plugin route prefixes under `/api/plugins/{pluginId}`
  - proxies request/response payloads through `plugin.invoke_route`
  - preserves FastAPI-style scalar/list query coercion semantics through the
    worker request contract

## Scope

This slice should cover only:

- a Go-owned live backend route runtime for active backend plugins in IDE mode
- startup-time worker registration for plugins that request `registerRouter`
- normalized route prefix ownership under:
  - `/api/plugins/{pluginId}`
  - optional plugin-provided sub-prefixes
- thin HTTP proxying from incoming requests to `plugin.invoke_route`
- request translation for:
  - repeated query params
  - JSON request bodies
  - text bodies
  - raw-body passthrough when the worker marks `needsRawBody`
- response translation for:
  - status code
  - headers
  - media type
  - JSON/text/base64 bodies
- focused Go app/runtime/route tests and the existing Playwright route-payload
  caller

## Non-Goals

- plugin static-dir serving
- plugin listener-endpoint runtime ownership
- plugin MCP tool runtime ownership
- `host.read_project_state` or `host.emit_listener_dependency_event` runtime
  ownership for general backend plugins
- hot-reloading backend plugin routes after `link` or lifecycle mutations
  without restart
- share/app-mode widening unless a real caller appears

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-runtime-read-and-asset-transport.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-backend-language-server-and-external-agent-registration-runtime.md`
- `backend/setta/plugins/manager.py`
- `backend/setta/plugins/worker.py`
- `tests/plugins/test_plugin_worker.py`
- `tests/routers/test_plugin_routes.py`
- `frontend/tests/e2e/overview/plugins/plugin-backend-route-payload.spec.ts`
- `internal/plugins/backend_routes.go`
- `internal/plugins/worker_host.go`
- `internal/plugins/worker_session.go`
- `internal/plugins/worker_launcher.go`
- `internal/httpapi/httpapi.go`
- `internal/httpapi/plugin_routes.go`
- `internal/app/app.go`

## Dependency Findings

The active gap is not just one more thin route.

To serve plugin backend routes in Go, one source-of-truth runtime boundary is
still missing:

1. a live worker runtime that owns active backend plugin sessions for the app
2. route registration persistence across app lifetime
3. request/response proxy translation over the existing worker RPC contract

Important contract findings from the Python reference:

- route prefixes live under `/api/plugins/{pluginId}` plus a normalized plugin
  sub-prefix
- repeated query params preserve arrival order and map to scalar-or-list worker
  payloads
- non-GET requests may need both parsed JSON/text and raw body bytes
- worker route responses can return:
  - JSON objects/arrays/scalars
  - text or binary bodies
  - explicit media types
  - explicit headers
  - non-200 status codes

## Working Decisions

- keep backend route transport thin
  - HTTP decoding/encoding belongs at the edge
  - plugin route/runtime semantics belong under `internal/plugins`
- keep live backend worker lifetime explicit
  - no framework magic or hidden singleton startup
- keep this slice IDE-only unless a real share/app caller appears
- reuse the existing worker RPC contract
  - do not invent a second backend route protocol
- do not bundle static-dir or other backend host surfaces into this first route
  runtime slice

## Recommended Option

Implement this in two bounded slices.

### Slice A

- add a live backend route runtime in `internal/plugins`
- start active route-owning backend plugins at app startup
- register route descriptors into a Go route registry
- expose thin proxy handlers for `/api/plugins/{pluginId}/...`
- cover the active Playwright payload caller end to end

This is the highest-leverage executable slice because it closes the active
frontend caller without broadening into unrelated plugin backend host methods.

### Slice B

- consider static-dir runtime ownership only if a real caller depends on it
- consider broader backend host methods only when those product surfaces move
  into active work

## Proposed Go Boundaries

### `internal/plugins`

Own:

- live backend worker process/session ownership for route-serving plugins
- registered plugin route metadata and lookup
- worker `plugin.invoke_route` request/response normalization helpers

Do not own:

- auth middleware
- generic HTTP request decoding outside the worker route contract

### `internal/httpapi`

Own:

- route binding under `/api/plugins/{pluginId}/...`
- auth/mode-policy integration
- HTTP error/status/header writing

Do not own:

- backend worker lifecycle
- plugin discovery semantics

### `internal/app`

Own:

- wiring the live backend route runtime into the real app
- keeping startup-time ownership explicit
- reusing existing plugin discovery/runtime foundations instead of introducing
  a second source of truth

## Test Strategy

- add focused `internal/plugins` tests for:
  - route registration normalization
  - worker route proxy request payload shaping
  - worker route response decoding
- add focused `internal/httpapi` tests for:
  - `/api/plugins/{pluginId}/...` route proxying
  - repeated query params
  - JSON body passthrough
  - status/header/media-type preservation
- add app-level tests for:
  - active backend plugin route serving on real app startup
  - mixed route + language-server plugins staying active
- run:
  - `frontend/tests/e2e/overview/plugins/plugin-backend-route-payload.spec.ts`

## Exit Criteria

This doc is complete when all of the following are true:

- active backend plugins that register routes are started by the Go app at
  runtime startup
- `/api/plugins/{pluginId}/...` proxies to `plugin.invoke_route`
- query, body, status, header, and media-type behavior matches the current
  worker contract for the active frontend caller
- focused Go tests plus
  `frontend/tests/e2e/overview/plugins/plugin-backend-route-payload.spec.ts`
  pass
