# undo/redo include-project-config opt-in expansion for non-structural routes

Date: 2026-03-04  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Extend explicit include-project-config scoped undo/redo transport opt-ins to more
non-structural routes that only mutate project-config/code-obj/section-impl
payloads.

## Change

Expanded `include_project_config_targeted_patch_transport=True` usage to
additional non-structural routes in `BaseProjectManager`:

- code diagnostics/code-file:
  - `set_code_section_diagnostics_mute(...)`
  - `set_code_section_diagnostic_code_suppression(...)`
  - `set_code_file_binding(...)`
- edge routes:
  - `create_edge(...)`
  - `delete_edges(...)`
  - `reconnect_edge(...)`
  - `set_edges(...)`
- param-structure routes when edge-input project-config mutation is involved:
  - `delete_kwarg(...)` (edge-input branch)
  - `delete_selected_params(...)` (edge-input branch)

Structural routes remain on full fallback by default unless explicitly
opted in.

## Regression Coverage

Updated `tests/project_state/test_structural_patch_transport.py` with new
undo/redo transport assertions:

- `test_undo_redo_code_section_diagnostics_mute_include_project_config_uses_targeted_patch_transport`
- `test_undo_redo_create_edge_include_project_config_uses_targeted_patch_transport`

Existing guards retained:

- `test_undo_redo_structural_include_project_config_history_uses_full_patch_transport`
- `test_undo_redo_unknown_scope_still_uses_full_patch_transport`

## Verification

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && pytest tests/project_state/test_structural_patch_transport.py -q`
- `source activate.sh && pytest tests/project_state/test_edge_patch_transport.py tests/project_state/test_param_structure_patch_transport.py tests/project_state/test_patch_transport_additional_routes.py tests/project_state/test_undo_redo_matrix.py tests/project_state/test_set_callable_undo_redo_stress.py -q`
- `source activate.sh && pytest tests/project_state -q`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-undo-redo.spec.ts`

## Benchmark Scenario

Representative route: `create_edge(...)` undo/redo history navigation.

Environment:

- local dev machine
- python env via `source activate.sh`
- one connected in-memory frontend websocket (serialization included)
- synthetic edge state built from callable project state

Method:

1. Seed one `create_edge(...)` mutation.
2. Run repeated undo/redo pair toggles.
3. Compare two modes:
   - `legacy_full_transport` emulation:
     `_resolve_undo_redo_patch_scope_for_navigation_tokens(...) -> None`
   - `optimized_scoped_transport`:
     current behavior with opt-in route scope.
4. Per mode: `3` warmup pairs + `12` measured pairs.
5. Record pair latency, payload bytes, transport shape counts.

## Results (local)

- Pair median latency:
  - legacy: `6.334 ms`
  - optimized: `6.305 ms`
  - improvement: `+0.47%`
- Pair p95 latency:
  - legacy: `6.410 ms`
  - optimized: `6.385 ms`
  - improvement: `+0.38%`
- Transport bytes:
  - legacy: `615,684`
  - optimized: `144,612`
  - improvement: `~76.51%`

Transport shape per `24` navigation calls:

- legacy: `24 code-obj patches + 24 structural patches`
- optimized: `24 project-config patches + 24 code-obj patches`

## Notes

- This expands explicit route-level opt-in coverage while preserving the
  correctness default (structural routes stay on full fallback).
- Payload-size reduction is deterministic for these routes and directly reduces
  websocket transport load during undo/redo bursts.
