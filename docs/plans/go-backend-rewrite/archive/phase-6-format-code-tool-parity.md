# Phase 6 Format Code Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`set_gen_code_suffix` MCP work.

`format_code` is the next highest-leverage remaining mutation gap, but it is
materially larger than the prefix/suffix writes. It needs a real Go owner for:

- Ruff process execution
- Python code-section validation
- generated Python prefix/suffix formatting
- read-only binding rejection
- Watch Code and LSP-sensitive follow-on behavior for bound Python code edits

The slice should create that owner first, then expose it through both the
existing IDE `/formatCode` route and the Phase 6 MCP boundary.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity is still the active phase
- this slice is complete
- Go now owns `format_code` through a shared formatting owner plus thin IDE
  route and MCP transport
- the Go MCP boundary now exposes 39 tools total
- the existing `/formatCode` frontend endpoint now delegates to the Go-owned
  formatter instead of falling back to Python
- the current Go rewrite reuses the adjacent authoritative boundaries:
  - inline code edits plus Watch Code / LSP-sensitive apply ordering:
    `internal/app/code_updates.go`
  - code-section validation and read-only binding policy:
    `internal/projectstate/code_updates.go`
  - Python codegen target persistence and generated binding reconciliation:
    `internal/projectstate/python_codegen.go`
    `internal/projectstate/python_codegen_writes.go`
  - authoritative generated Python materialization after project saves:
    `internal/codegen`
    `internal/app`

## Scope

This focused slice covers:

- a Go formatting owner for Python code sections and the generated Python
  singleton section
- Ruff execution via an explicit Go OS-integration boundary
- IDE `/formatCode` route parity over that owner
- Go MCP `format_code` parity over that same owner
- reuse of the existing Watch Code / LSP-aware code-update path for formatted
  inline Python code sections
- reuse of the existing Python codegen target and generated-file materializer
  path for generated Python prefix/suffix formatting
- focused tests for:
  - Python code section formatting success
  - generated Python prefix/suffix formatting success
  - rejection of non-Python or non-code targets
  - rejection of read-only bound code sections
  - explicit formatting errors for invalid Python input
  - Watch Code registry refresh for formatted bound sections
  - authenticated IDE route, MCP tool route, and IDE app SSE coverage
  - temporary-id translation on the MCP path

## Non-Goals

- changing how Ruff formats code
- formatting non-Python languages
- code completion transport
- deployment/share-mode transport expansion
- app-definition MCP work
- layout/variant mutation work

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `docs/plans/go-backend-rewrite/archive/phase-6-set-code-tool-parity.md`
- `docs/plans/go-backend-rewrite/archive/phase-6-set-gen-code-prefix-tool-parity.md`
- `docs/plans/go-backend-rewrite/archive/phase-6-set-gen-code-suffix-tool-parity.md`
- `docs/reference/mcp-system-overview.md`
- `docs/reference/watch-code.md`
- `docs/reference/share-policy-flags.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/utils/format_code.py`
- `tests/project_state/test_format_code.py`
- `tests/project_state/test_set_code_access_mode.py`
- `tests/project_state/test_codegen_targets.py`
- `tests/utils/test_format_code.py`
- `internal/app/code_updates.go`
- `internal/projectstate/code_updates.go`
- `internal/projectstate/python_codegen.go`
- `internal/projectstate/python_codegen_writes.go`
- `internal/httpapi/project_routes.go`
- `internal/mcpx/server.go`

## Current Python Behavior

Python `BaseProjectManager.format_code(...)`:

1. resolves the single-config state and effective section impl
2. accepts only:
   - Python `Code` sections
   - the generated Python singleton section
3. rejects read-only code bindings for real code sections
4. for Python `Code` sections:
   - runs Ruff import sorting and formatting
   - rejects invalid code with a sanitized error string
   - persists the formatted inline code
   - reuses the Watch Code and LSP sync/update path
5. for generated Python:
   - formats `genCodePrefix`
   - formats `genCodeSuffix`
   - rejects either one with explicit `Gen code prefix:` /
     `Gen code suffix:` error text
   - persists both on the Python codegen target
6. broadcasts the refreshed project state

The Python implementation shells out to Ruff directly and strips ANSI codes
from failures.

## Working Decisions

- create a real Go formatting owner instead of embedding Ruff calls in
  transports
  - MCP and `/formatCode` should both delegate to the same owner
- keep the formatting owner next to the existing Go code-update service
  - formatted inline Python edits should reuse the completed
    LSP-before-Watch-Code path instead of reimplementing it
- keep Ruff as the formatter source of truth
  - use the backend process environment PATH and fail explicitly when Ruff is
    unavailable
  - do not invent heuristic formatter fallbacks
- keep the Ruff OS boundary in a small shared package
  - `internal/codeformat` now owns the subprocess integration
  - the app code-update owner stays responsible for product semantics
- preserve raw Ruff error text after ANSI stripping
  - invalid formatting input should surface actionable messages, not generic
    transport errors
- add a combined generated Python target write for prefix/suffix formatting
  - avoid double-save sequencing and intermediate generated-file materialization
- keep transport thin
  - route + MCP handlers validate top-level arguments, enforce scope where
    applicable, and delegate
- map unsupported target errors explicitly
  - `format_code` should reject non-Python and non-code targets as product
    errors, not internal errors
- keep deployment behavior unchanged
  - this slice only covers IDE-owned transport

## Implementation Outline

1. Add the Go Ruff execution helper.
   - shell out to Ruff with UTF-8 stdin/stdout
   - mirror Python’s import-sort + format sequence
   - strip ANSI from errors
   - fail explicitly when Ruff is unavailable

2. Add the Go formatting owner.
   - extend the existing app code-update service with `FormatCode(...)`
   - for Python code sections:
     - validate target kind/language
     - reject read-only bindings
     - format code
     - reuse the existing `SetCode(...)` path for Watch Code + LSP behavior
   - for generated Python:
     - read current Python target prefix/suffix
     - format both independently
     - persist both through one runtime mutation

3. Add route parity for `/formatCode`.
   - register the route in IDE mode
   - reuse the code-update/formatting service
   - map unsupported target, read-only, and formatting errors explicitly

4. Add MCP parity for `format_code`.
   - register tool metadata as a scoped write
   - `idPathsByType.section = ["sectionId"]`
   - delegate to the shared formatting owner
   - cover temp-id translation and scoped denial

5. Add focused tests.
   - Ruff helper UTF-8 + error handling
   - service/runtime tests for code and generated Python formatting
   - HTTP `/formatCode` route tests
   - MCP server, authenticated tool route, and IDE app SSE tests

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/codeformat -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestCodeUpdateServiceFormatCode|TestCodeUpdateServiceReloadBoundCodeFileSyncsLSPBeforeWatchCodeApply' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'TestRuntimeSetGenCode(Suffix|Prefix)(PersistsPythonTargetField|RequiresPythonTarget)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestRegisterProjectRoutes(SetCode|FormatCode)|TestMCPToolCallRoute(SupportsFormatCode|FormatCodeAcceptsTemporaryIDs|RejectsReadOnlyFormatCode|RejectsReadOnlySetCode)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServerListsToolsAndScopesToolCalls|TestServer(SetCodeRespectsScopedWriteTargets|FormatCodeRespectsScopedWriteTargets|SetCodeRejectsReadOnlyCodeSections|FormatCodeRejectsReadOnlyCodeSections|SetCodeTranslatesTemporaryIDs|FormatCodeTranslatesTemporaryIDs)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestApp(SetCodeRouteAppliesWatchCodeBoundSectionUpdate|FormatCodeRouteAppliesWatchCodeBoundSectionUpdate)|TestAppIDEMCPServer(SupportsAuthenticatedSSECalls|RejectsReadOnlySetCodeOverAuthenticatedSSE|SupportsSetCodeOverAuthenticatedSSE|SupportsTemporaryIDsForSetCodeOverAuthenticatedSSE|SupportsFormatCodeOverAuthenticatedSSE|SupportsTemporaryIDsForFormatCodeOverAuthenticatedSSE|SupportsGeneratedFormatCodeOverAuthenticatedSSE)|TestAppIDEMCPToolCallRouteSupports(SetCode|FormatCode)' -count=1 -timeout 420s`

## Open Questions

- none after implementation

## Next Recommended Step

- use `phase-6-compare-and-set-ui-setting-tools-parity.md` for the next
  bounded Phase 6 slice
- keep the compare-and-set UI-setting/watch-code cluster separate from the
  section-variant and app-definition work so Phase 6 does not broaden too early

## Progress Notes

- 2026-03-07: doc created after the completed `set_gen_code_suffix` slice moved
  the next bounded Phase 6 step to `format_code`.
- 2026-03-07: the Go rewrite now owns Ruff subprocess integration in
  `internal/codeformat`, `format_code` mutation semantics in the app code-update
  owner, the IDE `/formatCode` route, and the scoped MCP `format_code` tool.
- 2026-03-07: authenticated route, MCP HTTP bridge, authenticated SSE, temp-id,
  generated Python prefix/suffix, Watch Code refresh, and read-only rejection
  coverage all passed.
- 2026-03-07: Ruff import sorting remains the source of truth; combined imports
  are split exactly as Ruff emits them instead of being post-processed.
- 2026-03-07: the next bounded slice moved to the compare-and-set UI-setting
  and Watch Code tools cluster.
