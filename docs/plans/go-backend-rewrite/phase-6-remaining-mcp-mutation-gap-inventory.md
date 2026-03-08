# Phase 6 Remaining MCP Mutation Gap Inventory

## Purpose

This doc tracks the remaining Phase 6 MCP mutation surface after the completed
section-filter and MetaControl-title slice.

The non-app-definition mutation backlog is now complete on the Go-owned MCP
boundary, so the next slice should be chosen from the remaining document-level
app-definition work instead of from section-local payload writes.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity is still the active phase
- Go MCP now exposes 52 tools total
- 49 current Go tool names overlap with Python
  `BaseProjectManager.@project_state_tool` names
- 47 of those overlaps are mutation or structural tools
- Python still has 2 mutation or structural project-state MCP tools that do
  not yet have Go MCP parity

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-section-filter-and-meta-control-title-tools-parity.md`
- `docs/plans/go-backend-rewrite/phase-6-app-definition-validation-and-store-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-app-definition-mutation-tool-parity.md`
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_app_definition.py`
- `tests/app/test_spec_store.py`
- `internal/mcpx/server.go`
- `internal/projectstate/frontend_source.go`
- `internal/projectstate/document.go`
- `internal/deployments/runtime.go`
- `internal/httpapi/deployment_routes.go`

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
  - `set_project_config_codegen_targets`
  - `set_show_param_display_names`
  - `set_watch_code_enabled`
  - `set_watch_code_inputs`
  - `compare_and_set_show_param_display_names`
  - `compare_and_set_watch_code_enabled`
  - `compare_and_set_watch_code_folders`
  - `compare_and_set_watch_code_files`
  - `set_code_section_attached_terminal`
  - `set_section_sizes`
  - `set_group_overflow_mode`
  - `toggle_group_orientation`
  - `toggle_position_locks`
  - `toggle_minimized`
- writes:
  - `set_section_name`
  - `set_section_tag_color`
  - `set_section_style_color`
  - `set_section_param_filter`
  - `set_meta_control_show_section_title`
  - `set_gen_code_prefix`
  - `set_gen_code_suffix`
  - `format_code`
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
  - `set_section_variant`
  - `set_default_section_variant`
  - `set_section_variant_sort_order`

## Remaining Mutation Gaps

### 1. Highest-Leverage Next Slice

- app-definition mutation parity:
  - `set_app_definition`
  - `update_app_definition`

Why this is next:

1. the completed section-filter slice cleared the non-app-definition mutation
   backlog, so the only mutation gap left is the deferred app-definition pair.
2. the prerequisite validation/store boundary is now complete in
   `internal/appspec`, and the document-level mutation owner is now complete in
   `internal/projectstate`.
3. the remaining gap is transport parity for the mutation pair on the MCP,
   HTTP tool route, and authenticated SSE boundaries.
4. the next slice is scoped in:
   `phase-6-app-definition-mutation-tool-parity.md`

### 2. After The App-Definition Mutation Slice

- close the remaining app-definition read gap:
  - `get_app_definition`
  - `validate_app_definition`
- keep those reads separate unless the mutation owner makes it trivial to land
  them together

### 3. Gaps That Still Need More Go Runtime Work First

These should not be turned into MCP work until the new document-level mutation
owner lands:

- `set_app_definition`
- `update_app_definition`
- `get_app_definition`
- `validate_app_definition`

### 4. Non-Mutation Read Gaps

These are still Python-owned MCP tools, but they are not the next mutation
priority:

- `get_app_definition`
- `validate_app_definition`

## Recommended Next Step

- use `phase-6-app-definition-mutation-tool-parity.md` as the next bounded
  Phase 6 slice
- add MCP transport parity over the completed document-level mutation owner

## Open Questions

- none after inventory

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/appspec -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/deployments -run 'TestRuntimeLoadAppSpecReadsDeploymentRelativePath' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/deployments -count=1 -timeout 300s`

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
- 2026-03-07: `set_section_tag_color` MCP parity completed as a scoped write
  tool over the existing Go layout-presentation owner.
- 2026-03-07: the next bounded slice moved to
  `set_section_style_color`.
- 2026-03-07: `set_section_style_color` MCP parity completed as a scoped
  write tool over the existing Go layout-presentation owner.
- 2026-03-07: the next bounded slice moved to
  `set_watch_code_enabled`.
- 2026-03-07: `set_watch_code_enabled` MCP parity completed as an unscoped
  structural tool over the existing Go Watch Code runtime owner.
- 2026-03-07: the next bounded slice moved to
  `set_watch_code_inputs`.
- 2026-03-07: `set_watch_code_inputs` MCP parity completed as an unscoped
  structural tool over the existing Go Watch Code runtime owner.
- 2026-03-07: the next bounded slice moved to
  `set_project_config_codegen_targets`.
- 2026-03-07: `set_project_config_codegen_targets` MCP parity completed as an
  unscoped structural tool over the existing Go codegen-target runtime owner,
  validator, and Python generated-section reconciler.
- 2026-03-07: reranking the remaining mutation gaps against the actual
  Go-owned runtime surface moved the next bounded slice to
  `set_gen_code_prefix`.
- 2026-03-07: `set_gen_code_prefix` MCP parity completed as a scoped write
  tool over the existing Go Python codegen target owner and `GenPythonCode`
  singleton-target scope boundary.
- 2026-03-07: the next bounded slice moved to `set_gen_code_suffix`.
- 2026-03-07: `set_gen_code_suffix` MCP parity completed as a scoped write
  tool over the existing Go Python codegen target owner and `GenPythonCode`
  singleton-target scope boundary.
- 2026-03-07: the next bounded slice moved to `format_code`.
- 2026-03-07: `format_code` is now complete across the Go owner, IDE
  route, and MCP boundaries.
- 2026-03-07: `set_code_section_attached_terminal` is now complete across the
  Go runtime owner, MCP server, HTTP tool-call route, and authenticated SSE
  transport.
- 2026-03-07: reranking after the attached-terminal slice moved the next
  bounded Phase 6 step to `set_section_sizes`, which now has its own
  implementation-plan doc.
- 2026-03-07: the compare-and-set UI-setting cluster is now complete across
  the Go owner, MCP server, MCP HTTP bridge, and authenticated SSE transport.
- 2026-03-07: reranking the remaining gaps moved the next bounded slice to
  `set_code_section_attached_terminal` because the Go run-graph runtime already
  owns most of the hard attached-terminal invariants.
- 2026-03-07: `set_section_sizes` is now complete across the Go runtime
  owner, MCP server, HTTP tool route, and authenticated SSE transport.
- 2026-03-07: reranking after the section-size slice moved the next bounded
  Phase 6 step to the Group layout toggle cluster in
  `phase-6-group-layout-toggle-tools-parity.md`.
- 2026-03-07: the Group layout toggle slice is now complete across the Go
  runtime owner, MCP server, HTTP tool route, and authenticated SSE transport.
- 2026-03-07: reranking after the Group layout toggle slice moved the next
  bounded Phase 6 step to the section-variant selection and ordering cluster in
  `phase-6-section-variant-selection-and-order-tools-parity.md`.
- 2026-03-07: the section-variant selection and ordering slice is now
  complete across the Go runtime owner, MCP server, HTTP tool route, and
  authenticated SSE transport.
- 2026-03-07: reranking after the section-variant slice moved the next bounded
  Phase 6 step to the section filter and MetaControl title cluster in
  `phase-6-section-filter-and-meta-control-title-tools-parity.md`.
- 2026-03-07: the section filter and MetaControl title slice is now complete
  across the Go runtime owner, MCP server, HTTP tool route, and authenticated
  SSE transport.
- 2026-03-07: completion of the section filter and MetaControl title slice
  moved the next bounded Phase 6 step to the app-definition mutation cluster in
  `phase-6-app-definition-mutation-tool-parity.md`.
- 2026-03-08: direct repo inspection showed the app-definition mutation cluster
  is blocked on missing Go app-spec validation/catalog ownership, so the next
  bounded step moved to
  `phase-6-app-definition-validation-and-store-foundation.md`.
- 2026-03-08: the app-definition validation/store prerequisite slice completed
  in `internal/appspec`, so the next bounded step moved back to the
  app-definition mutation cluster in
  `phase-6-app-definition-mutation-tool-parity.md`.
- 2026-03-08: the document-level app-definition mutation owner landed in
  `internal/projectstate`, so the remaining work in the active slice is MCP,
  HTTP tool-route, and authenticated SSE transport parity.
