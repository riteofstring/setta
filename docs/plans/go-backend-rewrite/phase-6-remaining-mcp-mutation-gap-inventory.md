# Phase 6 Remaining MCP Mutation Gap Inventory

## Purpose

This doc closes the post-`delete_kwarg` planning step for Phase 6.

The param-structure cluster is now complete on the Go-owned MCP boundary, so
the next slice should be chosen from the actual remaining Python-owned MCP
mutation surface instead of continuing by local intuition.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity is still the active phase
- Go MCP now exposes 31 tools total
- 28 current Go tool names overlap with Python
  `BaseProjectManager.@project_state_tool` names
- 26 of those overlaps are mutation or structural tools
- Python still has 23 mutation or structural project-state MCP tools that do
  not yet have Go MCP parity

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-delete-kwarg-tool-parity.md`
- `docs/plans/go-backend-rewrite/phase-5-watch-code-inline-edit-and-bound-code-file-reuse.md`
- `docs/reference/mcp-system-overview.md`
- `docs/reference/watch-code.md`
- `backend/setta/mcp/system_prompt.md`
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_set_code_access_mode.py`
- `tests/project_state/test_format_code.py`
- `frontend/src/utils/generatedEndpoints.ts`
- `internal/mcpx/server.go`
- `internal/projectstate/code_updates.go`
- `internal/projectstate/view_modes.go`
- `internal/projectstate/auto_layout.go`
- `internal/projectstate/layout_presentation.go`
- `internal/projectstate/watch_code.go`
- `internal/httpapi/project_routes.go`
- `internal/app/code_updates.go`

## What Is Complete

Go already owns the following Python project-state MCP tools through the new
MCP server:

- read/filter:
  - `get_latest_project_state_summary`
  - `get_latest_lsp_diagnostics`
- structural:
  - `create_top_level_section`
  - `create_child_sections`
  - `create_child_sections_via_incrementer`
  - `delete_sections`
  - `delete_child_sections_via_decrementer`
  - `create_new_section_variant`
  - `auto_layout_top_level_sections`
  - `set_show_param_display_names`
  - `toggle_position_locks`
  - `toggle_minimized`
- writes:
  - `set_section_name`
  - `set_callable`
  - `set_code`
  - `set_top_level_section_layout`
  - `add_kwarg`
  - `delete_kwarg`
  - `delete_selected_params`
  - `set_param_entered_value`
  - `set_param_name_and_value`
  - `change_param_impl`
  - `update_param_impl_config`
  - `set_type_error_ignore`
  - `set_code_obj_name`
  - `set_code_obj_display_name`
  - `set_code_section_diagnostics_mute`
  - `set_code_section_diagnostic_code_suppression`

## Remaining Mutation Gaps

### 1. Highest-Leverage Next Slice

- `set_section_tag_color`

Why this is next:

1. Go already owns the authoritative runtime and IDE HTTP route in:
   - `internal/projectstate/layout_presentation.go`
   - `internal/httpapi/project_routes.go`
2. It reuses the completed scoped structural-tool boundary plus the existing
   section-id invocation-edge translation already exercised by the two previous
   section-targeted presentation slices.
3. It is the next bounded section-targeted presentation mutation after the
   now-completed `toggle_minimized` slice.

### 2. Good Follow-Ons After `set_section_tag_color`

These already have Go runtime owners and existing IDE HTTP route transport, so
their main remaining gap is MCP registration and scoped test coverage:

- `set_section_style_color`
- `set_watch_code_enabled`
- `set_watch_code_inputs`

### 3. Gaps That Still Need More Go Runtime Work First

These should not be turned into MCP work until their authoritative Go mutation
owner is clearer:

- `set_gen_code_prefix`
- `set_gen_code_suffix`
- `format_code`
- `set_project_config_codegen_targets`
- `set_section_sizes`
- `toggle_group_orientation`
- `set_group_overflow_mode`
- `set_section_param_filter`
- `set_section_variant`
- `set_default_section_variant`
- `set_section_variant_sort_order`
- `set_meta_control_show_section_title`
- `set_code_section_attached_terminal`
- `compare_and_set_show_param_display_names`
- `compare_and_set_watch_code_enabled`
- `compare_and_set_watch_code_folders`
- `compare_and_set_watch_code_files`
- `set_app_definition`
- `update_app_definition`

### 4. Non-Mutation Read Gaps

These are still Python-owned MCP tools, but they are not the next mutation
priority:

- `get_app_definition`
- `validate_app_definition`

## Recommended Next Step

- use `set_section_tag_color` as the next bounded MCP slice
- keep `set_section_style_color` as the follow-on section-targeted presentation
  mutation after that
- defer app-definition MCP work until the frontend-source subsystem is ready
  for its own bounded Phase 6 slice

## Open Questions

- none after inventory

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRouteSupportsToggleMinimized|TestMCPToolCallRouteToggleMinimizedAcceptsTemporaryIDs' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsAuthenticatedSSECalls|TestAppIDEMCPServerSupportsToggleMinimizedOverAuthenticatedSSE|TestAppIDEMCPServerSupportsTemporaryIDsForToggleMinimizedOverAuthenticatedSSE|TestAppIDEMCPToolCallRouteSupportsToggleMinimized' -count=1 -timeout 420s`

## Progress Notes

- 2026-03-07: inventory completed after the `delete_kwarg` slice.
- 2026-03-07: focused `set_code` slice doc created immediately after the
  inventory so the next implementation step is already scoped.
- 2026-03-07: next bounded implementation step identified as `set_code`
  because it has the highest MCP leverage and can reuse an already-landed Go
  code-update owner.
- 2026-03-07: `set_code` MCP parity completed; the next bounded slice moved to
  `set_top_level_section_layout`.
- 2026-03-07: `set_top_level_section_layout` MCP parity completed as a scoped
  write tool over the existing Go layout owner.
- 2026-03-07: generic MCP dict-key id translation now rewrites keyed layout
  maps at invocation time, not just during scope extraction.
- 2026-03-07: the next bounded slice moved to
  `auto_layout_top_level_sections`.
- 2026-03-07: `auto_layout_top_level_sections` MCP parity completed as an
  unscoped structural tool over the existing Go auto-layout owner.
- 2026-03-07: the next bounded slice moved to
  `set_show_param_display_names`.
- 2026-03-07: `set_show_param_display_names` MCP parity completed as an
  unscoped structural tool over the existing Go layout-presentation owner.
- 2026-03-07: the next bounded slice moved to
  `toggle_position_locks`.
- 2026-03-07: `toggle_position_locks` MCP parity completed as an unscoped
  structural tool over the existing Go layout-presentation owner.
- 2026-03-07: the next bounded slice moved to
  `toggle_minimized`.
- 2026-03-07: `toggle_minimized` MCP parity completed as an unscoped
  structural tool over the existing Go layout-presentation owner.
- 2026-03-07: the next bounded slice moved to
  `set_section_tag_color`.
