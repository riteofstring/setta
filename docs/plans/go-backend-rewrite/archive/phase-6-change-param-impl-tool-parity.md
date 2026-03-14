# Phase 6 Change Param Impl Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`add_kwarg` MCP parity work.

Go already owns:

- scoped MCP invocation with metadata-driven `section` and `codeObj` targeting
- Go-owned param rename/value writes through `set_param_name_and_value`
- Go-owned callable selection plus param refetch through `set_callable`
- Go-owned param creation through `add_kwarg`

The remaining gap in this cluster is switching an existing param or meta-control
between supported code-object implementation types without falling back to
Python-side orchestration.

## Status

Current repo status as of 2026-03-07:

- this slice is complete
- Go now owns `change_param_impl` through `internal/projectstate` and MCP
- the runtime now has a Go-owned password-secret store keyed by impl id
- `set_param_entered_value` now supports password values through that store

## Scope

This focused slice covers:

- a Go-owned project-state mutation owner for `change_param_impl`
- allowed-type gating by section kind:
  - `MetaControl` -> control types only
  - callable/dict param sections -> section-param types only
- switching by:
  - existing impl id when the selected id resolves to `codeObjImpls`
  - code-object type name when the selected id does not resolve to an existing
    impl
- preservation of param metadata when both old and new impls are param impls:
  - `coreNameEditable`
  - `coreNameType`
  - `passingStyle`
  - `typeAnnotation`
- value conversion during impl changes for childless param types
- runtime password-secret persistence and migration keyed by impl id so:
  - password -> non-password clears the old secret
  - non-password -> password moves the old value into the secret store
  - password -> password preserves/moves the secret between impl ids
  - `set_param_entered_value` can persist password values after a type switch
- keeping switched impls usable by extending the Go-owned value-write path for:
  - password params
  - dropzone stateful/stateless normalization
- a Go MCP `change_param_impl` write tool
- focused project-state, MCP server, authenticated HTTP bridge, and IDE-mode
  app coverage for:
  - callable/dict param type changes
  - meta-control type changes
  - param metadata preservation
  - password-secret migration and follow-on value writes
  - scoped allow/deny behavior
  - temp-id argument translation

## Non-Goals

- `update_param_impl_config`
- full legacy IDE HTTP route migration for `changeParamImpl`
- reimplementing Python user-default settings for every impl config field
- transport-local payload surgery or heuristics

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-6-add-kwarg-tool-parity.md`
- `docs/reference/meta-controls.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/types/helpers_lvl2.py`
- `tests/types/test_helpers_lvl2.py`
- `tests/types/test_password_param_secrets.py`
- `backend/setta/mcp/system_prompt.md`
- `internal/projectstate/code_object_writes.go`
- `internal/projectstate/callable.go`
- `internal/mcpx/server.go`

## Dependency Finding

This slice cannot be implemented correctly as a metadata-only MCP tool.

Python keeps the following semantics inside project-state helpers:

1. section-kind-based allowed type gating
2. creation or selection of the backing impl
3. metadata preservation across param-to-param impl changes
4. value conversion across impl types
5. password-secret migration keyed by impl id

The key bounded dependency is password-secret runtime ownership. Without it,
Go could switch a param to `PasswordParam` but the completed
`set_param_entered_value` path would still reject the new type, leaving the new
impl unusable. The highest-leverage move is therefore:

- add one explicit Go password-secret store boundary
- use it from project-state mutation owners
- land `change_param_impl` and password value persistence together

## Working Decisions

- keep impl switching authoritative in `internal/projectstate`
  - MCP should call one Go runtime owner directly
  - do not rewrite impl payloads in transport code
- support the real selection model from Python
  - existing impl id if present in `codeObjImpls`
  - otherwise treat `selectedId` as a code-object type name
- preserve param metadata only when both sides are param impls
  - keep this logic explicit instead of generic field copying
- support password-secret persistence through a runtime-root-backed store
  - key secrets by impl id
  - do not fall back to storing secrets in project state
- use the same secret-store boundary in IDE and deployment runtimes
  - IDE main/settings runtimes share the file-backed store
  - deployment base/overlay runtimes inherit the same attached store
- keep creation defaults explicit in Go
  - define the minimal payload defaults required for supported impl types
  - do not pull in Python-shaped settings/default machinery for this slice
- keep thin transport layers
  - MCP should validate arguments, enforce scope, and return structured results
  - project-state owns semantics

## Implementation Outline

1. Add the password-secret boundary.
   - create a Go runtime password store backed by
     `runtimeRoot/secrets/passwords.json`
   - wire it into project-state runtime options
   - expose project/document/runtime helpers needed by password writes and impl
     migration

2. Add the bounded project-state owner.
   - implement allowed-type gating by section kind
   - resolve selected impl id or create a new impl from explicit Go defaults
   - preserve param metadata when appropriate
   - convert/migrate values, including password secret movement

3. Extend the existing value-write owner.
   - support `PasswordParam` writes through the new password store
   - keep unsupported types explicit

4. Wire the MCP write tool.
   - register `change_param_impl`
   - use `sectionId` plus `paramInfoId` metadata targeting for scope and
     temp-id translation

5. Add focused tests.
   - project-state tests for allowed/blocked switches, metadata preservation,
     value conversion, and password-secret migration
   - MCP server tests for metadata, allowed/blocked writes, temp-id argument
     translation, and result behavior
   - authenticated HTTP/app tests for scoped invocation and password follow-on
     writes after type changes

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsAuthenticatedSSECalls|TestAppIDEMCPServerSupportsScopedWriteMutationOverAuthenticatedSSE|TestAppIDEMCPServerSupportsTemporaryIDsOverAuthenticatedSSE|TestAppIDEMCPToolCallRouteSupportsScopedWriteMutation' -count=1 -timeout 420s`

## Open Questions

- none after implementation

## Next Recommended Step

- `update_param_impl_config`, `delete_selected_params`, and `delete_kwarg` are
  now complete on the Go-owned MCP boundary
- the next bounded follow-on should be inventory work for the remaining
  Python-owned MCP mutation gaps while keeping any future param-structure
  semantics authoritative in `internal/projectstate`

## Progress Notes

- 2026-03-07: doc created to scope the slice before implementation.
- 2026-03-07: slice completed with a Go-owned `change_param_impl` owner,
  section-kind-based allowed type gating, explicit Go defaults for created impls,
  param metadata preservation, value conversion, a runtime-root-backed
  password-secret store, password/dropzone value-write support needed by the
  switched impls, MCP registration, and authenticated HTTP/app coverage.
