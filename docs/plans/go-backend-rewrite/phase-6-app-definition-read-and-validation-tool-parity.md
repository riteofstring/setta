# Phase 6 App Definition Read And Validation Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
app-definition mutation transport work.

The remaining Python-owned app-definition MCP gaps are now:

- `get_app_definition`
- `validate_app_definition`

These are both read-only structural tools, but `validate_app_definition` is not
just a thin read. It still depends on Go owning the app-definition
diagnostics/capabilities builder that Python currently keeps in
`backend/setta/app/definition_diagnostics.py`.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active phase
- Go now owns the app-spec validation/catalog/store foundation in
  `internal/appspec`
- Go now owns the app-definition diagnostics/capabilities owner in
  `internal/appspec`
- Go now owns the document-level app-definition read/validation owner in
  `internal/projectstate`
- Go now owns MCP/HTTP/authenticated-SSE transport parity for
  `get_app_definition` and `validate_app_definition`
- the Python `BaseProjectManager.@project_state_tool` overlap is now complete

## Scope

This focused slice should cover:

- a Go owner for `get_app_definition`
- a Go diagnostics/capabilities owner for `validate_app_definition`
- MCP parity for both tools
- HTTP tool-call route and authenticated SSE coverage
- focused tests for:
  - empty read behavior
  - stored-spec read behavior
  - validation errors and warnings
  - capability payload shape

## Non-Goals

- app-definition persisted writes
- live app-spec patch streaming
- compare-and-set app-definition metadata UI settings
- frontend UI changes outside existing tool transport

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-app-definition-mutation-tool-parity.md`
- `docs/plans/go-backend-rewrite/phase-6-app-definition-validation-and-store-foundation.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/app/definition_diagnostics.py`
- `backend/setta/app/spec_validation.py`
- `tests/project_state/test_app_definition.py`
- `internal/appspec`
- `internal/projectstate/frontend_source.go`
- `internal/projectstate/document.go`

## Current Python Behavior

1. `get_app_definition`
   - returns the current document-level `appDefinition` metadata
   - reads the stored app spec from `appSpecPath` when configured
   - returns `appSpec=None` when no stored spec is configured

2. `validate_app_definition`
   - overlays optional metadata fields on the current app definition
   - validates app-spec structure, actions, and theme without persisting
   - returns structured `errors`, `warnings`, and `capabilities`

## Working Decisions

- keep `get_app_definition` as a document-level read over the stored app-spec
  path source of truth
- do not route validation back through Python
- keep the diagnostics/capabilities owner in `internal/appspec` so it can
  reuse catalog/spec helpers and stay below the transport layer
- keep the transport thin once that owner exists

## Dependency Status

The app-spec persisted-write foundation and the diagnostics/capabilities owner
used by `validate_app_definition` are now complete on the Go side.

## Completed Work

1. Added a bounded Go diagnostics/capabilities owner in `internal/appspec`.
   - capability payload builder
   - multi-issue spec/action validation collection
   - theme, asset, and run-button warning collection

2. Added document-level read/validation ownership in `internal/projectstate`.
   - metadata read from `Document.AppDefinition`
   - stored app-spec read from the configured path when present
   - non-persisting metadata overlay for validation

3. Added MCP/HTTP/authenticated-SSE parity for the read pair.

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/appspec -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'TestRuntime(GetAppDefinition|ValidateAppDefinition|SetAppDefinition|UpdateAppDefinition)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|GetAppDefinition|ValidateAppDefinition|SetAppDefinition|UpdateAppDefinition)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsGetAppDefinition|GetAppDefinitionAcceptsTemporaryIDs|SupportsValidateAppDefinition|ValidateAppDefinitionAcceptsTemporaryIDs|SupportsSetAppDefinition|SetAppDefinitionAcceptsTemporaryIDs|SupportsUpdateAppDefinition|UpdateAppDefinitionAcceptsTemporaryIDs)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupportsAuthenticatedSSECalls|ServerSupportsGetAppDefinitionOverAuthenticatedSSE|ServerSupportsTemporaryIDsForGetAppDefinitionOverAuthenticatedSSE|ServerSupportsValidateAppDefinitionOverAuthenticatedSSE|ServerSupportsTemporaryIDsForValidateAppDefinitionOverAuthenticatedSSE|ServerSupportsSetAppDefinitionOverAuthenticatedSSE|ServerSupportsTemporaryIDsForSetAppDefinitionOverAuthenticatedSSE|ServerSupportsUpdateAppDefinitionOverAuthenticatedSSE|ServerSupportsTemporaryIDsForUpdateAppDefinitionOverAuthenticatedSSE|ToolCallRouteSupportsGetAppDefinition|ToolCallRouteSupportsValidateAppDefinition|ToolCallRouteSupportsSetAppDefinition|ToolCallRouteSupportsUpdateAppDefinition)' -count=1 -timeout 420s`

## Open Questions

- none after landing the bounded diagnostics owner in `internal/appspec`

## Next Recommended Step

- the broader remaining Python-owned MCP surface outside
  `BaseProjectManager.@project_state_tool` is now tracked in
  `phase-6-post-project-state-mcp-surface-inventory.md`
- execute the next bounded utility/read tool cluster in
  `phase-6-general-mcp-utility-read-tools-parity.md`
