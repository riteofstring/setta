# Phase 6 CodeObj Write Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed `codeObj`
target-mapping and singleton-fallback work.

Go now owns:

- scoped MCP invocation with metadata-driven target extraction
- invocation-edge temporary/canonical id translation
- effective `codeObj -> section` target mapping from the project view
- scoped diagnostics-ignore write tools

What Go still does not own is the first non-diagnostics code-object write
cluster that exercises that targeting boundary against real project-state
mutation owners.

## Status

This slice is now complete.

Current repo status as of 2026-03-07:

- `internal/mcpx` can already scope tools that target:
  - `sectionId`
  - `codeObjId`
  - `paramInfoId`
- `internal/projectstate` now exposes Go runtime owners for:
  - parameter value mutation through document/runtime save boundaries
  - section-level `ignoreTypeErrors` mutation
  - code-object display-name mutation
- Go MCP now exposes the next code-object write tools:
  - `set_param_entered_value`
  - `set_type_error_ignore`
  - `set_code_obj_display_name`
- unsupported password/dropzone param value semantics now fail explicitly in Go
  rather than falling through to incorrect generic mutation behavior

## Scope

This focused slice covers:

- Go-owned project-state mutation owners for:
  - parameter entered values
  - section `ignoreTypeErrors`
  - code-object display names
- Go MCP registration for:
  - `set_param_entered_value`
  - `set_type_error_ignore`
  - `set_code_obj_display_name`
- focused scope, temp-id, HTTP-tool-route, and IDE-mode app coverage for those
  tools

## Non-Goals

- `set_code_obj_name`
  - rename validation and rename-refactor behavior are a separate boundary
- password-secret or dropzone-specific parity if Go runtime does not yet own
  those semantics
- structural/project-shape tools
- share-policy or non-MCP transport parity
- generic preview metadata parity

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-codeobj-target-mapping-singleton-fallback-and-suppression.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/types/helpers_lvl2.py`
- `tests/agentic/test_agentic_scope.py`
- `tests/agentic/test_agentic_scope_violation_tool_result.py`
- `tests/routers/test_share_policy_routes.py`
- `internal/projectstate/section_code_objects.go`
- `internal/projectstate/callable.go`
- `internal/mcpx/server.go`

## Dependency Finding

The next useful MCP slice should stay in code-object writes before moving to
structural parity.

The completed targeting boundary is most valuable when exercised by tools that:

1. target both section and code-object ids
2. mutate project state through real save/runtime owners
3. produce scope decisions from metadata rather than tool-local branches

`set_param_entered_value` and `set_type_error_ignore` are the best anchors
because they prove the `paramInfoId`/`codeObj` path on top of a section target.
`set_code_obj_display_name` is a good companion tool because it uses a
code-object-only target and is cheap once the runtime owner exists.

## Working Decisions

- add a small project-state owner first
  - MCP handlers should call Go runtime owners directly
  - do not write mutation logic inline in `internal/mcpx`
- keep this slice to code-object writes with simple semantics
  - include `set_param_entered_value`
  - include `set_type_error_ignore`
  - include `set_code_obj_display_name`
  - defer `set_code_obj_name`
- keep temp-id and scope behavior metadata-driven
  - use `IDPathsByType` for both section and code-object carriers
  - do not add tool-name-specific id translation branches
- stay explicit about missing product semantics
  - if password/dropzone-specific behavior is not yet represented in Go state,
    do not invent heuristic stand-ins in MCP

## Proposed Go Boundaries

### `internal/projectstate`

Own:

- parameter value mutation through document/runtime save boundaries
- section `ignoreTypeErrors` mutation shape and persistence
- code-object display-name mutation

Do not own:

- agentic scope decisions
- MCP argument translation

### `internal/mcpx`

Own:

- MCP tool registration and schemas
- scoped invocation and temp-id translation reuse
- direct calls into Go runtime owners

Do not own:

- project-state storage details
- route-local compatibility shims

## Implementation Steps

1. Add project-state owners.
   - expose document/runtime mutation helpers for:
     - section code-object value
     - section `ignoreTypeErrors`
     - code-object display name

2. Add MCP tools.
   - `set_param_entered_value`
     - `AccessTypeWrite`
     - `IDPathsByType[section] = ["sectionId"]`
     - `IDPathsByType[codeObj] = ["paramInfoId"]`
   - `set_type_error_ignore`
     - same target metadata as above
   - `set_code_obj_display_name`
     - `AccessTypeWrite`
     - `IDPathsByType[codeObj] = ["codeObjId"]`

3. Cover the slice with focused tests.
   - project-state mutation tests
   - MCP server tests for allowed/denied scoped writes
   - temporary-id translation tests for `paramInfoId`/`codeObjId`
   - HTTP/app integration tests for the expanded tool catalog and mutation
     effects

## Acceptance

- Go owns runtime save/mutation helpers for the selected code-object writes
- MCP temp-id translation rewrites `paramInfoId`/`codeObjId` through metadata
  paths
- scope checks enforce the new tools through the shared metadata-driven
  boundary
- `set_param_entered_value`, `set_type_error_ignore`, and
  `set_code_obj_display_name` are callable through Go MCP transports

## Completed

- added `internal/projectstate/code_object_writes.go`
  - document/runtime save owners for:
    - `SetSectionCodeObjectValue`
    - `SetTypeErrorIgnore`
    - `SetCodeObjectDisplayName`
  - source-of-truth section-level `ignoreTypeErrors` parsing and persistence
  - explicit unsupported errors for password/dropzone value mutation
- updated `internal/projectstate/section_code_objects.go`
  - direct value mutation now resolves the effective code-object payload first
  - mutation fails explicitly for:
    - password params
    - dropzone params
    - code objects without a mutable `value` field
- updated `internal/mcpx/server.go`
  - registered:
    - `set_param_entered_value`
    - `set_type_error_ignore`
    - `set_code_obj_display_name`
  - added raw-string argument reading for value/display-name mutations
  - normalized project-state mutation failures into structured MCP tool errors
- expanded focused coverage in:
  - `internal/projectstate/code_object_writes_test.go`
  - `internal/mcpx/server_test.go`
  - `internal/httpapi/mcp_tool_routes_test.go`
  - `internal/app/mcp_test.go`

## Decisions

- keep code-object write semantics owned by `internal/projectstate`
  - MCP handlers call runtime owners directly
  - no REST indirection or MCP-local mutation logic was added
- keep unsupported param types explicit
  - password/dropzone writes return Go-owned unsupported errors
  - no heuristic stand-ins or partial parity were added
- keep string write semantics raw
  - `value` and `displayName` are read without trim/coercion so intentional
    empty-string writes remain representable
- keep `ignoreTypeErrors` source-of-truth driven
  - the section must actually expose `codeObjVariantMap`
  - no keyword or section-kind heuristics were added

## Open Questions

- none at this slice boundary

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 240s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute|TestRegisterLSPRoutesMutesCodeSectionDiagnostics' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP' -count=1 -timeout 420s`

## Recommended Follow-On

- Slice 8 is complete.
- Slice 9 is now complete.
- Structural follow-on slices through `create_new_section_variant` are now
  complete.
- `set_code_obj_name` is now complete over the Go-owned rename-validation
  boundary.
- `set_param_name_and_value` is now complete over the Go-owned combined
  rename/value boundary.
- `set_callable` is now complete over the Go-owned callable/signature-help
  boundary.
- `add_kwarg` is now complete over the Go-owned param-creation boundary.
- The next recommended step is a focused `change_param_impl` slice so newly
  created params can switch control/value types on the completed creation plus
  combined rename/value boundaries.
- Leave broader structural create/delete/move tools deferred until a dedicated
  structural plan narrows them into a bounded owner.
