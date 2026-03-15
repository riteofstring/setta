# Phase 6 Create Top-Level Section Structural Tool

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`set_section_name` MCP parity work.

Go now owns:

- scoped MCP invocation with explicit access metadata
- temp/canonical id translation at the MCP invocation edge
- section/code-object write-tool parity for the current bounded MCP surface

What Go still does not own is the first structural MCP tool that changes the
project shape itself.

`create_top_level_section` is the best first structural anchor because it is:

- already central to the current Python MCP/product workflow
- structurally meaningful without opening the entire move/delete cluster
- the first missing tool that forces Go to own real section construction
  semantics instead of only mutating existing sections

## Status

Current repo status as of 2026-03-07:

- this slice is complete
- Go MCP now exposes `create_top_level_section`
- Go now has a bounded project-state owner for top-level section creation in
  `internal/projectstate/top_level_section_creation.go`
- Go HTTP transport still does not own `createTopLevelSection`
- the earlier Phase 4 route docs remain accurate: structural create/delete/move
  HTTP transport stays deferred, and this slice landed MCP-first

## Scope

This focused slice covers:

- a Go-owned project-state mutation owner for creating one top-level section
- a Go MCP `create_top_level_section` tool over that owner
- scoped structural access through the existing MCP invocation boundary
- result temp-id translation for created ids
- focused tests through:
  - `internal/projectstate`
  - `internal/mcpx`
  - `internal/httpapi` MCP tool bridge
  - `internal/app` authenticated SSE MCP path

## Non-Goals

- `create_child_sections`
- delete/move/group structural tools
- broad section-type creation parity if Go does not yet own honest defaults for
  those types
- IDE HTTP route migration for `createTopLevelSection` in the same slice unless
  it becomes a direct dependency of the new owner
- viewport-aware reveal/pan heuristics that are not backed by a current Go
  source of truth
- full LLM ai-follow runtime migration

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/archive/phase-6-section-name-tool-parity.md`
- `docs/plans/go-backend-rewrite/archive/phase-4-project-layout-and-presentation-mutation-transport.md`
- `docs/plans/go-backend-rewrite/archive/phase-4-project-view-mode-and-top-level-layout-mutation-transport.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/types/core.py`
- `tests/project_state/test_project_config_view_modes.py`
- `tests/llm/test_ai_follow_tool_result_updates.py`
- `tests/start/test_start_tools.py`
- `internal/projectstate/view_modes.go`
- `internal/projectstate/auto_layout.go`
- `internal/mcpx/server.go`

## Dependency Finding

This slice cannot be implemented as MCP registration alone.

Current inspection shows two real missing dependencies:

1. Go has no source-of-truth section-construction owner for top-level section
   creation.
2. Go MCP currently temp-id translates arguments plus a few filtered read
   result shapes, but not normal mutation results such as
   `{sectionId, metaControlParamId}`.

The high-leverage move is therefore:

- add the minimal project-state owner first
- add one explicit result-id metadata path for translation
- keep the transport surface bounded to MCP

## Working Decisions

- keep this slice MCP-first
  - do not broaden to the IDE HTTP route unless the owner naturally needs a
    shared transport contract
- keep section construction explicit and bounded
  - support only section types Go can create honestly in this slice
  - return explicit `invalid_arguments` errors for unsupported creation types
  - do not fake Python default payloads for types Go does not yet model well
- keep structural scope behavior unchanged
  - `create_top_level_section` remains a structural tool
  - scoped chats without structural permission should fail closed through the
    existing scope boundary
- add explicit result id paths to Setta metadata
  - use metadata rather than tool-name branches so result temp-id translation
    stays source-of-truth driven
- keep placement honest
  - explicit `position` wins
  - if Go cannot yet reproduce Python viewport-aware smart placement robustly,
    use a deterministic runtime-owned placement rule over current top-level
    layouts and sizing policy
  - do not invent keyword or viewport fallbacks without source-of-truth inputs
- keep `panTo` honest
  - only return it if the Go owner can derive it from real inputs in this
    slice
  - otherwise return `null`

## Proposed Go Boundaries

### `internal/projectstate`

Own:

- top-level section construction
- section/variant/impl insertion
- top-level layout/view-mode visibility bookkeeping for the new section
- optional meta-control param creation when supported
- deterministic placement derived from current runtime state

Do not own:

- MCP tool schemas
- agentic scope policy
- temp-id translation

### `internal/mcpx`

Own:

- tool registration and schema
- structural access enforcement reuse
- argument decoding
- result-id-path-based temp-id translation

Do not own:

- section construction rules
- view-mode bookkeeping

## Implementation Steps

1. Add result-id metadata support.
   - extend `internal/tools.Metadata` with explicit result id paths
   - expose them in Setta MCP `_meta`
   - use them for generic result temp-id translation

2. Add the project-state owner.
   - create one bounded mutation owner for top-level section creation
   - keep defaults explicit per supported type
   - update project/view-mode top-level layout + visibility state coherently
   - create meta-control param ids only when that path is fully owned

3. Register `create_top_level_section`.
   - `AccessTypeStructural`
   - result id paths for:
     - `sectionId`
     - `metaControlParamId` when present
   - hide Python-only/internal smart-placement carriers from the MCP schema

4. Cover the slice with focused tests.
   - project-state creation and layout/view-mode bookkeeping
   - MCP server registration and structural scope tests
   - temp-id translation for created result ids
   - authenticated HTTP bridge + IDE app SSE tests

## Acceptance

- Go MCP exposes `create_top_level_section`
- the tool reuses a Go-owned project-state owner instead of Python or route
  indirection
- structural scope remains explicit and fail-closed
- returned created ids are temp-id translated through metadata, not a
  tool-name branch
- hidden MCP schema fields stay omitted

## Open Questions

- whether the next structural slice should stay on the creation path with
  `create_child_sections` or switch to delete/move bookkeeping
- when viewport-aware reveal and pan semantics should move out of the deferred
  HTTP route boundary and become a Go-owned source-of-truth pathway

## Recommended Follow-On

- the next recommended step is `create_child_sections`
- rationale:
  - it stays on the same structural-construction boundary instead of switching
    immediately into delete/move semantics
  - it can reuse the new result-id metadata translation path and the same
    project-state construction helpers
  - it keeps the HTTP route migration deferred until a slice actually needs
    viewport/reveal-specific transport behavior

## Completed

- added explicit result-id metadata support to `internal/tools.Metadata`
  and MCP `_meta.setta`
- added generic result-id temp-id translation via
  `Metadata.ResultIDPathsByType` instead of a `create_top_level_section`
  special-case branch
- added a bounded project-state owner for top-level section creation with:
  - explicit per-type section construction
  - stale top-level/view-mode layout pruning
  - deterministic no-viewport placement
  - optional meta-control param creation
- registered `create_top_level_section` as a Go-owned structural MCP tool
- hid Python-only/internal placement carriers from the MCP schema:
  - `implOverrides`
  - `topLevelSections`
  - `viewportBounds`
- covered the slice through:
  - `internal/projectstate`
  - `internal/mcpx`
  - `internal/httpapi`
  - `internal/app`

## Decisions Made

- keep this slice MCP-first
  - do not add the IDE HTTP `createTopLevelSection` route in the same slice
- keep structural scope behavior unchanged
  - `create_top_level_section` remains `AccessTypeStructural`
  - scoped chats without `allowUnscoped` still fail closed
- support an honest bounded set of section implementations in Go:
  - `Chat`
  - `Code`
  - `Dict`
  - `Group`
  - `MetaControl`
  - `Terminal`
  - `TextBlock`
- keep placement deterministic and source-of-truth driven
  - explicit `position` wins
  - otherwise placement is derived from current top-level layouts plus the Go
    auto-layout sizing policy with a fixed 24px horizontal gap
- keep `panTo` honest
  - it currently remains `null`
- default `MetaControl` creation to `SliderParam` when
  `controlCodeObjType` is omitted

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/tools ./internal/projectstate -count=1 -timeout 240s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 360s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute|TestRegisterLSPRoutesMutesCodeSectionDiagnostics' -count=1 -timeout 360s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP' -count=1 -timeout 480s`
