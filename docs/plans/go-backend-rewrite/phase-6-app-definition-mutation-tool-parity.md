# Phase 6 App Definition Mutation Tool Parity

## Purpose

This doc scopes the app-definition mutation parity slice that follows the
validation/store prerequisite in
`phase-6-app-definition-validation-and-store-foundation.md`.

The remaining mutation gaps on the Python MCP surface are now:

- `set_app_definition`
- `update_app_definition`

These are not another thin section-payload transport slice. They cross the
document-level app-definition metadata boundary and the stored app-spec file
boundary, so the next step needs an explicit Go runtime owner first.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active phase
- the non-app-definition mutation backlog is now complete
- Go currently preserves `Document.AppDefinition` and can read a stored app
  spec through the deployment runtime
- Go does not yet own app-definition mutation on the IDE/MCP write path
- direct repo inspection confirmed Go also does not yet own the prerequisite
  app-spec validation/catalog boundary
- this slice should not start until the validation/store prerequisite lands

## Scope

Once the prerequisite lands, this focused slice should cover:

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

- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `docs/plans/go-backend-rewrite/phase-6-app-definition-validation-and-store-foundation.md`
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_app_definition.py`
- `tests/app/test_spec_store.py`
- `docs/plans/go-backend-rewrite/phase-4-deployment-state-routes-and-projectstate-transport.md`
- `internal/projectstate/frontend_source.go`
- `internal/projectstate/document.go`
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

This slice is blocked on the prerequisite documented in
`phase-6-app-definition-validation-and-store-foundation.md`.

Reason:

- Python persisted writes validate theme, actions, and the app spec before any
  file write
- Go currently has no app-spec validator or catalog owner at all
- landing this slice first would either weaken product semantics or re-route
  validation through Python, which the rewrite should not do

## Implementation Outline

1. Land the prerequisite validation/store foundation.
   - `phase-6-app-definition-validation-and-store-foundation.md`

2. Add the Go owner.
   - document/runtime mutation entry points
   - JSON merge patch application

3. Add focused owner tests.
   - set persists spec + metadata
   - update reads, patches, and rewrites existing spec
   - missing configured spec path or missing stored spec fails cleanly

4. Add MCP parity for the mutation pair.
   - structural/project-scoped tool definitions
   - thin handlers
   - HTTP tool-call route and authenticated SSE coverage

## Open Questions

- none after the prerequisite decision

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'Test(Runtime(SetAppDefinition|UpdateAppDefinition)|Document.*AppDefinition)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|SetAppDefinition|UpdateAppDefinition)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsSetAppDefinition|SupportsUpdateAppDefinition)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupportsSetAppDefinition|ServerSupportsUpdateAppDefinition|ToolCallRouteSupportsSetAppDefinition|ToolCallRouteSupportsUpdateAppDefinition|SupportsAuthenticatedSSECalls)' -count=1 -timeout 420s`

## Next Recommended Step

- implement
  `phase-6-app-definition-validation-and-store-foundation.md` first
- only start this slice after the validation/store boundary exists in Go

## Progress Notes

- 2026-03-07: doc created after the completed section-filter and MetaControl
  title slice cleared the remaining non-app-definition mutation gaps.
- 2026-03-08: repo inspection confirmed the slice is blocked on a missing Go
  app-spec validation/catalog owner, so the new prerequisite doc now sits in
  front of this plan.
