# Phase 15 Plugin Read Project State And Listener Registration Runtime

## Purpose

This doc records the bounded Phase 15 slice that moved plugin worker-host
`host.read_project_state` plus `host.register_listener_endpoint` registration
capture into Go without widening into listener-router websocket dispatch or
mutation-time runtime refresh.

## Status

Landed on 2026-03-09.

The listener-endpoint websocket follow-on that this doc left deferred is now
tracked and landed separately in
`phase-15-plugin-listener-endpoint-websocket-dispatch.md`.

Go now owns:

- worker-host `host.read_project_state`
- worker-host `host.register_listener_endpoint`
- typed backend runtime capture for plugin listener-endpoint registrations
- live project-state reads for backend plugin route calls and MCP tool calls in
  IDE mode
- backend worker access to listener dependency-event emission through the Go
  listener producer

This closes the shared backend fixture gap that previously still depended on the
Python manager for:

- listener-endpoint registration during `plugin.register(...)`
- route-time `plugin.read_project_state(...)`
- MCP-tool `plugin.read_project_state(...)`

## Implementation

- added a typed `ProjectStateReader` in `internal/plugins`
  - reads from `projectstate.Runtime` / `deployments.Runtime`
  - builds `summary` payloads from a shared `internal/projectview`
    summary builder instead of duplicating a Python-shaped transform
- added a typed backend listener-endpoint registry in `internal/plugins`
  - validates that registered route ids belong to the same plugin router
  - stores normalized registrations for later dispatch work
- extended `WorkerHost` to handle:
  - `host.read_project_state`
  - `host.register_listener_endpoint`
- extended `BackendRouteRuntime` startup so one worker registration pass now
  captures:
  - routes
  - MCP tools
  - static dirs
  - listener endpoints
- wired the real IDE app runtime into backend workers
  - live main project-state runtime for reads
  - live listener producer for backend listener emits

## Decisions

- kept listener-endpoint work split into registration and dispatch
  - this slice captures registrations only
  - websocket invocation/dispatch remains deferred
- kept project-state reads on the Go source of truth
  - snapshots come from the live Go runtimes
  - summary payloads reuse the shared Go `projectview` builder
- wired listener emit support now because the shared backend fixture already
  exposes emit routes and those calls would otherwise still fail under Go-owned
  backend runtime

## Deferred

- mutation-time backend runtime refresh after plugin install/link/rescan/update
  flows
- built-in listener-endpoint-name conflict validation
  - Go does not yet have a listener-router endpoint source of truth equivalent
    to the later dispatch surface
  - this slice avoided inventing a heuristic placeholder list

## Verification

- `./scripts/go.sh test ./internal/plugins -run 'Test(WorkerHost(RegisterListenerEndpoint(NormalizesRegistration|RequiresCapability)|ReadProjectStateReturnsSummary)|BackendRouteRuntime(ProxiesFixtureRoutePayloads|InvokesToolOnlyFixtureMCPTools|SupportsMixedRouteAndMCPFixtures|ResolvesStaticOnlyFixtureAssets|SupportsMixedRouteAndStaticFixtures|SupportsProjectStateReadsAndListenerRegistrations))' -count=1`
- `./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|ProjectStateSummaryCanUsePerCallMeta)' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestApp(ServesPluginBackendRoutes|ServesPluginBackendStaticAssets|ServesPluginRuntimeWithBackendRegistrations|ServesPluginBackendProjectStateAndListenerRoutes|IDEMCPServerRegistersPluginBackendMCPTools|IDEMCPServerInvokesPluginBackendProjectStateTool)' -count=1`

## Next Recommended Step

Do not widen plugin backend-host work speculatively.

The next concrete follow-on should only start when a caller requires one of:

- backend runtime refresh after plugin mutation flows
- any remaining share/app-mode backend-host ownership that cannot stay deferred
