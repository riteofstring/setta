# Phase 6 Set Gen Code Prefix Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`set_project_config_codegen_targets` MCP work.

The next highest-leverage remaining MCP mutation gap with a now-bounded Go
owner is `set_gen_code_prefix`.

Go already owns the Python codegen target payload fields, canonical generated
binding reconciliation, Python generated-section materialization path, and the
scoped MCP singleton-targeting boundary. The remaining gap is a narrow Go
runtime mutation helper plus MCP parity over that existing owner.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity is still the active phase
- `set_project_config_codegen_targets` MCP parity is complete
- `set_gen_code_prefix` MCP parity is complete
- Go already owns the relevant Python codegen target and generated-section
  boundaries in:
  - `internal/projectstate/python_codegen.go`
  - `internal/projectstate/codegen_targets.go`
  - `internal/codegen`
  - `internal/app`
- Python tags `set_gen_code_prefix` as a write tool with
  `default_target_singleton_section="GenPythonCode"`
- the remaining Go gap is a narrow persisted mutation helper for the Python
  target field plus MCP write-tool parity over the existing singleton-target
  scope boundary

## Scope

This focused slice covers:

- a Go MCP `set_gen_code_prefix` write tool
- reuse of the existing Go Python codegen target source-of-truth field
- reuse of the existing Go generated binding reconciliation and Python
  materialization path
- scoped write invocation over the existing MCP singleton-section target
  boundary for `GenPythonCode`
- focused runtime, MCP server, authenticated HTTP bridge, and IDE-mode app
  coverage for:
  - write rejection when scoped chat context cannot write the generated Python
    singleton section
  - write success in unscoped project context
  - temporary-id translation for `projectConfigId`
  - failure when Python codegen is not enabled
  - persistence of `genCodePrefix` on the Python target
  - authoritative generated-code materialization in the app runtime

## Non-Goals

- `set_gen_code_suffix`
- broad codegen-target transport redesign
- broad generated Python runtime changes
- format-code runtime work
- app-definition MCP work

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `docs/plans/go-backend-rewrite/phase-6-set-project-config-codegen-targets-tool-parity.md`
- `docs/reference/mcp-system-overview.md`
- `docs/reference/codegen-targets.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `tests/project_state/test_format_code.py`
- `internal/projectstate/python_codegen.go`
- `internal/projectstate/codegen_targets.go`
- `internal/projectstate/python_codegen_writes.go`
- `internal/projectstate/python_codegen_test.go`
- `internal/mcpx/server.go`
- `internal/mcpx/target_resolution.go`
- `internal/app/app.go`

## Current Python Behavior

Python `BaseProjectManager.set_gen_code_prefix(...)`:

1. resolves the single-config project state
2. requires the Python codegen target to exist
3. updates `projectConfig.codegenTargets[].genCodePrefix`
4. tags the tool as `access_type="write"` with
   `default_target_singleton_section="GenPythonCode"`
5. persists and broadcasts through the standard project-state update path

The generated Python section body stays generated-only; the prefix is stored on
the Python codegen target and folded into the materialized generated file.

## Working Decisions

- keep MCP transport thin
  - the tool should validate argument shapes, enforce scoped write access, and
    delegate to the Go runtime owner
- keep this tool a scoped write
  - Python already treats it as a write mutation rather than a structural tool
- target the generated Python singleton through metadata
  - reuse `defaultTargetSingletonSection="GenPythonCode"` instead of inventing
    an explicit `sectionId` argument
- store the prefix on the Python target only
  - do not duplicate prefix text onto generated-section payloads
- preserve raw prefix text
  - decode `genCodePrefix` with the raw-string MCP path so trailing newlines
    and empty-string clears survive transport unchanged
- fail explicitly when Python codegen is not enabled
  - do not invent heuristic fallback targets or auto-enable behavior
- keep the output simple
  - return `{ status: "ok" }`

## Implementation Outline

1. Add the narrow Go runtime mutation.
   - read the current Python codegen target
   - update `genCodePrefix`
   - persist through `MutateAndSave(...)`
   - reconcile generated bindings through the existing project helper

2. Register the `set_gen_code_prefix` MCP tool.
   - `accessType: write`
   - `defaultTargetSingletonSection: GenPythonCode`
   - input: `projectConfigId`, `genCodePrefix`
   - output: `status`

3. Add focused tests.
   - runtime persistence and missing-python-target coverage
   - MCP server metadata and scoped write behavior
   - temporary-id translation for `projectConfigId`
   - authenticated `__setta__/tools/call` coverage
   - IDE app coverage proving generated Python materialization updates

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'TestRuntimeSetGenCodePrefixPersistsPythonTargetField|TestRuntimeSetGenCodePrefixRequiresPythonTarget' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRouteSupportsSetGenCodePrefix|TestMCPToolCallRouteSetGenCodePrefixAcceptsTemporaryIDs' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsAuthenticatedSSECalls|TestAppIDEMCPServerSupportsSetGenCodePrefixOverAuthenticatedSSE|TestAppIDEMCPServerSupportsTemporaryIDsForSetGenCodePrefixOverAuthenticatedSSE|TestAppIDEMCPToolCallRouteSupportsSetGenCodePrefix|TestAppIDEMCPRuntimeStatusRouteReportsConnectedSelfClient' -count=1 -timeout 420s`

## Open Questions

- none after implementation

## Next Recommended Step

- move next to `set_gen_code_suffix`
- it reuses the same Python target owner and singleton-target scope boundary
- it should stay another narrow Phase 6 codegen-target write slice

## Progress Notes

- 2026-03-07: doc created after reranking the remaining mutation inventory
  against the actual Go-owned runtime surface.
- 2026-03-07: Go runtime now persists `genCodePrefix` through the Python target
  owner and reuses canonical generated-binding reconciliation.
- 2026-03-07: Go MCP now exposes `set_gen_code_prefix` as a scoped write tool
  targeting `GenPythonCode`.
- 2026-03-07: MCP argument decoding was switched to the raw-string path so
  trailing newlines and empty-string clears are preserved instead of being
  trimmed by transport.
- 2026-03-07: coverage landed in `internal/projectstate`, `internal/mcpx`,
  `internal/httpapi`, and `internal/app`, including authenticated SSE and tool
  route flows.
