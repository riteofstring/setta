# Phase 6 App Definition Mutation Tool Parity

## Purpose

This doc scopes the app-definition mutation parity slice that follows the
validation/store prerequisite in
`phase-6-app-definition-validation-and-store-foundation.md`.

This slice covered the last remaining Python-owned Phase 6 mutation gap on the
app-definition surface.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active phase
- the non-app-definition mutation backlog is now complete
- Go currently preserves `Document.AppDefinition` and can read a stored app
  spec through the deployment runtime
- Go now owns the prerequisite app-spec validation/catalog/store boundary in
  `internal/appspec`
- Go now owns the document-level app-definition mutation owner in
  `internal/projectstate`
- Go now owns transport parity for `set_app_definition` and
  `update_app_definition` on the MCP, HTTP tool route, and authenticated SSE
  boundaries
- the remaining Python-owned app-definition gaps are now the non-mutation
  reads:
  - `get_app_definition`
  - `validate_app_definition`

## Scope

This focused slice should cover:

- a Go runtime owner for `set_app_definition`
- a Go runtime owner for `update_app_definition`
- app-spec path normalization and persistence at the Go boundary
- explicit JSON merge-patch behavior for `update_app_definition`
- focused tests for:
  - app-spec persistence
  - metadata persistence
  - missing-spec rejection for patch updates
  - temp-id safe MCP transport where applicable

## Non-Goals

- `get_app_definition`
- `validate_app_definition`
- compare-and-set app-definition metadata UI settings
- frontend live-preview patch streaming beyond the persisted write boundary

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `docs/plans/go-backend-rewrite/archive/phase-6-app-definition-validation-and-store-foundation.md`
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_app_definition.py`
- `tests/app/test_spec_store.py`
- `docs/plans/go-backend-rewrite/archive/phase-4-deployment-state-routes-and-projectstate-transport.md`
- `internal/projectstate/frontend_source.go`
- `internal/projectstate/document.go`
- `internal/appspec`
- `internal/deployments/runtime.go`
- `internal/httpapi/deployment_routes.go`

## Current Python Behavior

Python keeps the two mutations document-scoped:

1. `set_app_definition`
   - chooses `appSpecPath` from the request, existing metadata, or the default
     `app_specs/app.json`
   - normalizes the path into the app-spec store root
   - validates theme, action definitions, and the full app spec before writing
   - persists both the stored app spec file and updated app-definition metadata

2. `update_app_definition`
   - requires an existing configured app-spec path and stored app spec
   - applies JSON merge patch semantics to the current stored app spec
   - validates the merged result before writing it back
   - leaves existing app-definition metadata in place

## Working Decisions

- treat app-definition writes as document-level runtime ownership
  - not project-section payload mutation
- keep the stored app-spec file path as the source of truth
  - no heuristic fallback to unrelated deployment files
- implement explicit JSON merge patch behavior for `update_app_definition`
  - do not invent partial-update semantics
- keep MCP transport thin
  - parse args, validate project scope if needed, delegate
- do not broaden this slice to app-definition reads unless a dependency makes
  it necessary

## Dependency Status

The prerequisite documented in
`phase-6-app-definition-validation-and-store-foundation.md` is now complete.

The document-level runtime owner is also now complete.

## Implementation Outline

1. Land transport parity for the mutation pair.
   - structural/project-scoped tool definitions
   - thin handlers
   - HTTP tool-call route and authenticated SSE coverage

2. Close the slice and hand off to the remaining read/validation work.
   - update Phase 6 inventory
   - add a dedicated follow-on plan doc for `get_app_definition` and
     `validate_app_definition`

## Open Questions

- none after the prerequisite decision

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'Test(Runtime(SetAppDefinition|UpdateAppDefinition)|Document.*AppDefinition)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|SetAppDefinition|UpdateAppDefinition)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsSetAppDefinition|SetAppDefinitionAcceptsTemporaryIDs|SupportsUpdateAppDefinition|UpdateAppDefinitionAcceptsTemporaryIDs)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupportsSetAppDefinitionOverAuthenticatedSSE|ServerSupportsTemporaryIDsForSetAppDefinitionOverAuthenticatedSSE|ServerSupportsUpdateAppDefinitionOverAuthenticatedSSE|ServerSupportsTemporaryIDsForUpdateAppDefinitionOverAuthenticatedSSE|ToolCallRouteSupportsSetAppDefinition|ToolCallRouteSupportsUpdateAppDefinition|SupportsAuthenticatedSSECalls)' -count=1 -timeout 420s`

## Next Recommended Step

- use `phase-6-app-definition-read-and-validation-tool-parity.md` as the next
  bounded Phase 6 slice
- keep `get_app_definition` and `validate_app_definition` separate from the now
  completed persisted-write boundary unless a new shared diagnostics owner
  makes the merge trivial

## Progress Notes

- 2026-03-07: doc created after the completed section-filter and MetaControl
  title slice cleared the remaining non-app-definition mutation gaps.
- 2026-03-08: repo inspection confirmed the slice is blocked on a missing Go
  app-spec validation/catalog owner, so the new prerequisite doc now sits in
  front of this plan.
- 2026-03-08: the prerequisite app-spec validation/store foundation landed in
  `internal/appspec`, so this slice is now the active next implementation step
  again.
- 2026-03-08: the document-level owner landed in
  `internal/projectstate/app_definition_writes.go` with shared store-root
  path normalization, persisted app-spec writes, explicit JSON merge patch
  semantics, and focused owner tests; the next remaining work is transport
  parity.
- 2026-03-08: MCP transport parity landed in `internal/mcpx`, plus HTTP
  tool-call route coverage in `internal/httpapi` and authenticated SSE/tool
  route coverage in `internal/app`; the mutation slice is now complete and the
  next remaining app-definition gaps are `get_app_definition` and
  `validate_app_definition`.
