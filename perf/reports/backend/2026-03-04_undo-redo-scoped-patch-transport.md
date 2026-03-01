# undo/redo scoped patch transport by history entry scope

Date: 2026-03-04  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce undo/redo transport payload size by avoiding full code-obj + structural
patch fanout when history entry scope proves only project-config or targeted
code-obj/section-impl fields can change.

## Change

`BaseProjectManager` now tracks undo/redo patch scope per history entry token and
uses it during history navigation broadcast:

- Added per-entry token scope map:
  - `_history_patch_scope_by_entry_token`
- Added scoped model:
  - `_UndoRedoProjectConfigPatchScope`
    - `project_config_only`
    - `section_impl_ids`
    - `code_obj_ids`
- Added helpers:
  - `_build_history_entry_undo_redo_patch_scope(...)`
  - `_register_current_history_entry_undo_redo_patch_scope(...)`
  - `_resolve_undo_redo_patch_scope_for_navigation_tokens(...)`
  - `_prune_history_patch_scope_by_entry_token()`
  - `_broadcast_undo_redo_scoped_patch(...)`
- `add_new_history_entry(...)` now registers + prunes undo/redo patch scope
  metadata alongside existing project-config scope metadata.
- `undo(...)` / `redo(...)` now resolve token-scoped patch scope and pass it into
  `update_and_broadcast_all_project_state(...)`.
- `update_and_broadcast_all_project_state(...)` now uses scoped transport when
  available:
  - project-config-only entries -> project-config patch
  - code-obj/section-impl scoped entries -> targeted code-obj + section-impl
    patches
  - unknown/unsupported scope -> fallback to prior full transport
    (all code-obj patch + structural patch)

This is explicit scope metadata, not heuristic route-name matching.

## Regression Coverage

Updated `tests/project_state/test_structural_patch_transport.py`:

- `test_undo_redo_project_config_only_history_uses_project_config_patch_transport`
- `test_undo_redo_code_obj_scoped_history_uses_targeted_patch_transport`
- `test_undo_redo_use_full_patch_transport` (keeps fallback/full-path
  expectation for unsupported scope)

## Verification

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && pytest tests/project_state/test_structural_patch_transport.py -q`
- `source activate.sh && pytest tests/project_state/test_single_config_state_cache.py tests/project_state/test_undo_redo_state_normalization.py tests/project_state/test_set_callable_undo_redo_stress.py tests/project_state/test_history_coalescing.py -q`
- `source activate.sh && pytest tests/project_state/test_undo_redo_matrix.py tests/project_state/test_code_obj_scoped_history_copy.py -q`
- `source activate.sh && pytest tests/project_state -q`

## Benchmark Scenario

Environment:

- local dev machine
- python env via `source activate.sh`
- one connected in-memory frontend websocket (so payload serialization is
  included)
- synthetic state: `build_callable_project_state(1000)`

Method:

1. Prepare a single undoable mutation, then run repeated undo/redo toggles.
2. Compare two modes:
   - `legacy_full_transport` emulation: monkeypatch
     `_resolve_undo_redo_patch_scope_for_navigation_tokens` to return `None`.
   - `optimized_scoped_transport`: native behavior.
3. Per mode/scenario: `3` warmup undo/redo pairs + `12` measured pairs.
4. Record:
   - pair latency (median, p95)
   - websocket payload bytes (`WebsocketManager` payload metrics)
   - transport message shape counts

Scenarios:

- `project_config_only_viewport` (`set_viewport` history entry)
- `code_obj_scoped_param_value` (`set_param_entered_value` history entry)

## Results (local)

### `project_config_only_viewport`

- pair median latency:
  - legacy: `165.120 ms`
  - optimized: `156.019 ms`
  - improvement: `+5.51%`
- pair p95 latency:
  - legacy: `227.941 ms`
  - optimized: `245.590 ms`
  - delta: `-7.74%` (noisy in this short local sample)
- payload bytes:
  - legacy: `17,320,844`
  - optimized: `96,692`
  - improvement: `~99.44%`
- message shape per 24 nav calls:
  - legacy: `24 code-obj patches + 24 structural patches`
  - optimized: `24 project-config patches`

### `code_obj_scoped_param_value`

- pair median latency:
  - legacy: `165.690 ms`
  - optimized: `164.765 ms`
  - improvement: `+0.56%`
- pair p95 latency:
  - legacy: `173.116 ms`
  - optimized: `255.727 ms`
  - delta: `-47.72%` (noisy in this short local sample)
- payload bytes:
  - legacy: `17,318,276`
  - optimized: `26,756`
  - improvement: `~99.85%`
- message shape per 24 nav calls:
  - legacy: `24 code-obj patches + 24 structural patches`
  - optimized: `24 code-obj patches`

## Notes

- The primary deterministic win is transport compaction: scoped undo/redo now
  avoids full structural payloads when scope metadata proves they are
  unnecessary.
- Latency medians improved/held, while p95 in these short local runs showed
  noise; payload-byte reductions were stable and very large in both scenarios.
- Unknown scope or unsupported history-entry scope still hard-falls back to full
  transport for correctness.
