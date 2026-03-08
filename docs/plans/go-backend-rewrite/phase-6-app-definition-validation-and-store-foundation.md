# Phase 6 App Definition Validation And Store Foundation

## Purpose

This doc scopes the prerequisite slice that now sits in front of
`phase-6-app-definition-mutation-tool-parity.md`.

The remaining Python MCP mutation gaps are still:

- `set_app_definition`
- `update_app_definition`

But repo inspection shows those writes are not transport-blocked. They are
blocked on missing Go ownership for the app-spec validation and app-spec store
boundaries that Python already enforces before persisting anything.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- the non-app-definition mutation backlog is complete
- Go preserves document-level `AppDefinition` metadata
- Go deployment reads can load a stored app spec from `appDefinition.appSpecPath`
- Go does not yet own:
  - app-spec path normalization and write helpers on the IDE runtime path
  - app catalog/component validation
  - action-definition validation
  - theme validation
  - document-level app-spec validation for persisted writes

## Scope

This prerequisite slice should cover:

- a Go-owned app-spec store helper for:
  - default path resolution
  - `app_specs/`-root normalization
  - read/write helpers for JSON payloads
- a Go-owned validation package for:
  - catalog id validation
  - component type validation
  - bounded action-definition validation
  - bounded theme validation needed by persisted writes
- focused tests proving the Go validator rejects the same high-value invalid
  cases already covered by the current Python tests
- enough validation/store coverage that the later runtime owner for
  `set_app_definition` and `update_app_definition` can delegate to it directly

## Non-Goals

- MCP transport for `set_app_definition` or `update_app_definition`
- `get_app_definition`
- `validate_app_definition`
- app-preview live draft validation
- recreating Python’s full diagnostics and capability-reporting surface in the
  same slice unless the persisted-write boundary requires it

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-app-definition-mutation-tool-parity.md`
- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/app/spec_store.py`
- `backend/setta/app/spec_validation.py`
- `backend/setta/app/definition_diagnostics.py`
- `backend/setta/app/catalog.py`
- `tests/project_state/test_app_definition.py`
- `tests/app/test_spec_store.py`
- `internal/projectstate/frontend_source.go`
- `internal/projectstate/document.go`
- `internal/deployments/runtime.go`
- `frontend/src/components/App/appRegistry.tsx`

## Findings From Repo Inspection

Python persists app-definition mutations only after four product-semantic
checks:

1. app-spec path normalization into the `app_specs/` store root
2. theme validation
3. action-definition validation
4. full app-spec validation against the catalog and payload rules

Current Go code only covers:

- document-level `AppDefinition` normalization for stored metadata
- deployment-time reading of a stored app spec by path

Current Go code does not contain any validator or catalog owner for app specs.
There is also no existing Go route or MCP handler for app-definition mutation.

That makes the next choice architectural, not mechanical:

- either weaken the write semantics relative to current product behavior
- or build the missing Go validation/store owner first

Given the rewrite rules, weakening semantics is the wrong option.

## Recommended Architecture Option

- add a dedicated Go `internal/appspec` package as the product-semantic owner
  for app catalog metadata, validation, and store-path normalization

Rationale:

- it keeps transport thin and avoids pushing product semantics into
  `internal/httpapi`, `internal/mcpx`, or `internal/projectstate`
- it gives both IDE runtime writes and deployment/runtime reads the same source
  of truth
- it avoids proxying validation back through Python or React code
- it keeps the later `get_app_definition` and `validate_app_definition` work on
  the same deterministic path instead of creating a second validation owner

## Implementation Outline

1. Add the store helper.
   - default app-spec path
   - normalize relative and absolute paths into the deployment/project root
   - reject writes outside `app_specs/`
   - read/write JSON payloads through deterministic helpers

2. Add the validation package.
   - port the minimal catalog/component data needed for persisted writes
   - validate catalog ids
   - validate known component types
   - validate action definitions
   - validate the bounded theme fields already enforced by Python write paths

3. Add focused tests.
   - default path matches `app_specs/app.json`
   - absolute paths normalize back to relative `app_specs/...`
   - writes outside `app_specs/` fail
   - unknown component fails
   - unsupported action type fails
   - invalid theme motion mode fails

4. Re-enter the mutation slice.
   - update `phase-6-app-definition-mutation-tool-parity.md`
   - add the document-level runtime owner over the completed validation/store
     foundation

## Open Questions

- do we need the full Python diagnostics/warnings surface before persisted
  writes?
  - recommended answer: no
  - persisted writes only need deterministic rejection of invalid payloads;
    the richer diagnostics surface can stay scoped to the later
    `validate_app_definition` read/write-adjacent slice

## Verification

When implementation starts, run:

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/appspec -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'Test(Runtime(SetAppDefinition|UpdateAppDefinition)|Document.*AppDefinition)' -count=1 -timeout 300s`

## Next Recommended Step

- implement the Go app-spec validation and store foundation before landing
  `set_app_definition` or `update_app_definition`

## Progress Notes

- 2026-03-08: doc created after direct repo inspection confirmed that Go has
  no app-spec validation/catalog owner yet, so the app-definition mutation
  slice is blocked on a real prerequisite instead of on MCP transport work.
