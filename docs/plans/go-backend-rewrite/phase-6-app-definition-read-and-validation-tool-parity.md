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
- Go now owns the document-level app-definition mutation owner in
  `internal/projectstate`
- Go now owns MCP/HTTP/authenticated-SSE transport parity for
  `set_app_definition` and `update_app_definition`
- the remaining app-definition gap is the read/validation pair

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
- build a Go-owned diagnostics/capabilities owner before transport wiring for
  `validate_app_definition`
- keep the transport thin once that owner exists

## Dependency Status

The app-spec persisted-write foundation is complete, but the diagnostics and
capabilities builder used by `validate_app_definition` is still Python-owned.

## Implementation Outline

1. Add a bounded Go diagnostics/capabilities owner.
   - capability payload builder
   - error/warning collection for theme, assets, and action wiring
   - reuse existing `internal/appspec` validation where it fits

2. Add document-level read ownership for `get_app_definition`.
   - metadata read from `Document.AppDefinition`
   - stored app-spec read from the configured path when present

3. Add MCP/HTTP/authenticated-SSE parity for the read pair.

## Open Questions

- whether the diagnostics builder should extend `internal/appspec` directly or
  live beside it as a separate app-definition diagnostics package

## Next Recommended Step

- start with the Go diagnostics/capabilities owner needed by
  `validate_app_definition`
- once that exists, land `get_app_definition` and `validate_app_definition`
  transport together as one bounded read-only slice
