# Phase 15 Plugin Read Project State And Listener Registration Runtime

## Purpose

This doc scopes the next bounded plugin backend-host slice after the landed
backend static-dir runtime.

The goal is to let backend plugins complete `plugin.register(...)` when they
call:

- `plugin.read_project_state(...)`
- `plugin.register_listener_endpoint(...)`

without widening into listener-router websocket dispatch or mutation-time
runtime refresh.

## Current Status

As of 2026-03-09:

- Go already owns:
  - backend plugin route runtime and `/api/plugins/{pluginId}/...` transport
  - backend plugin MCP tool runtime
  - backend plugin static-dir serving
  - backend worker host support for:
    - `host.register_router`
    - `host.register_static_dir`
    - `host.register_mcp_tool`
    - `host.emit_listener_dependency_event`
- Go does not yet own:
  - `host.read_project_state`
  - `host.register_listener_endpoint`
- this blocks the shared Python backend fixture from registering cleanly in Go,
  because that fixture currently:
  - registers a router
  - registers a listener endpoint
  - exposes a route that reads project state
  - exposes an MCP tool that reads project state
- current concrete Python reference material for this gap lives in:
  - `backend/setta/plugins/worker.py`
  - `backend/setta/plugins/manager.py`
  - `tests/plugins/test_plugin_worker.py`
  - `tests/plugins/test_plugin_manager.py`
  - `tests/server_state/test_ide_state_plugins.py`
  - `tests/fixtures/plugins/backend/`

## Scope

This slice should cover only:

- worker-host support for `host.read_project_state`
- worker-host support for `host.register_listener_endpoint`
- typed backend runtime capture for listener-endpoint registrations
- project-state reads for live backend workers during startup, route calls, and
  MCP tool calls
- focused tests proving:
  - register-time project-state reads succeed
  - backend fixture routes can read project state
  - backend fixture MCP tools can read project state
  - listener-endpoint registrations are captured during startup

## Non-Goals

- listener-router websocket dispatch for plugin-owned endpoints
- plugin listener endpoint invocation from Go transports
- plugin runtime refresh/hot-reload after install/link/rescan/update flows
- widening backend runtime ownership into share/app transport

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-backend-route-runtime-and-transport.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-backend-mcp-tool-runtime.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-static-dir-runtime.md`
- `backend/setta/plugins/worker.py`
- `backend/setta/plugins/manager.py`
- `tests/plugins/test_plugin_worker.py`
- `tests/plugins/test_plugin_manager.py`
- `tests/server_state/test_ide_state_plugins.py`
- `tests/fixtures/plugins/backend/`
- `internal/plugins/worker_host.go`
- `internal/plugins/backend_route_runtime.go`
- `internal/projectview/single_config.go`
- `internal/mcpx/project_summary.go`
- `internal/app/app.go`

## Working Decisions

- keep listener-endpoint work split into registration and dispatch
  - this slice captures plugin listener-endpoint registrations so startup can
    succeed
  - actual listener-router websocket dispatch remains a later follow-on
- prefer the existing Go project-state source of truth
  - use `projectstate.Runtime` / `deployments.Runtime` snapshots and
    `projectview` transforms instead of heuristics or Python-shaped shims
- support the real backend fixture directly
  - do not fork the fixture or bypass listener registration just to make
    project-state reads work
- keep transport boundaries thin
  - worker-host dispatch should validate inputs and delegate to typed readers /
    registries

## Recommended Design

1. Add worker-host support for `host.register_listener_endpoint`.
   - normalize endpoint name / route id
   - validate that the referenced route id belongs to the same plugin
   - capture registrations in a typed registry for later dispatch work

2. Add worker-host support for `host.read_project_state`.
   - validate project id, view, and share session inputs
   - read from the current Go project-state runtime snapshot
   - return either summary or full project-state payloads

3. Extend backend runtime startup to include listener-endpoint registrations.
   - route/tool/static/listener registrations should still share one startup
     pass
   - this slice only needs registration capture, not runtime dispatch

4. Wire the real app runtime into the worker host.
   - IDE mode should provide the live main project-state runtime
   - deployment-aware shape can remain bounded to the existing typed interface

## Test Strategy

- `internal/plugins`
  - worker-host listener registration validation
  - worker-host read-project-state validation and payload shape
  - backend runtime startup captures listener registrations
  - backend fixture route and MCP tool can read project state
- `internal/app`
  - real app serves the backend fixture route that reads project state
  - real app MCP server can invoke the backend fixture tool that reads project
    state

## Next Recommended Step

Implement this slice in a bounded way:

1. listener-endpoint registration capture
2. `host.read_project_state`
3. backend runtime/app wiring
4. focused plugin/app verification
