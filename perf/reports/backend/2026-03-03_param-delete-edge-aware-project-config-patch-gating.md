# Param delete edge-aware project-config patch gating

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Avoid project-config patch/history transport for `delete_kwarg` and
`delete_selected_params` when removed params do not affect section
`edgeInputParams`.

## Change

`backend/setta/project_state/base_project_manager.py`:

- `delete_kwarg`:
  - Added backend helper signal for whether the deleted kwarg is an edge input.
  - Uses `_add_section_and_code_obj_scoped_history_entry(...)` when no edge-input
    impact.
  - Uses `broadcast_project_config_patch=False` when no edge-input impact.
- `delete_selected_params`:
  - Added backend helper
    `_get_delete_selected_params_history_targets_for_backend(...)` returning:
    - parent code-obj ids for scoped history/patches
    - whether selected deletions touch edge inputs
  - Uses section/code-obj scoped history when edge inputs are unaffected.
  - Broadcasts project-config patch only when edge-input deletions occur.

`tests/project_state/test_param_structure_patch_transport.py`:

- Updated delete-route patch transport assertions for no-edge-input paths:
  - expect no project-config patch.
- Added explicit edge-input deletion coverage:
  - `test_delete_kwarg_includes_project_config_patch_when_deleting_edge_input`
  - `test_delete_selected_params_includes_project_config_patch_when_deleting_edge_inputs`
- Kept existing code-obj + section patch assertions for all paths.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_param_structure_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_code_obj_scoped_history_copy.py tests/project_state/test_param_structure_patch_transport.py tests/project_state/test_edge_patch_transport.py -q`

Result:

- `21 passed`.

## Benchmark scenario

Compared before/after on identical local harness.

Method:

1. `real_settings_manager()` with autosave disabled.
2. Synthetic callable state:
   - `1000` params for `delete_kwarg`.
   - `300` params for `delete_selected_params` (`param-1`, `param-2` selected).
3. Two scenarios per route:
   - no edge-input overlap
   - deletion overlaps edge inputs
4. Metric measured as `route(...) + finish_pending_operations(...)`.
5. Warmup/measured: `2` warmup + `8` measured samples.
6. Reset between samples with `undo(steps=1)`.
7. Captured project-config patch calls per operation.

Baseline:

- Code before this change in the same branch/worktree.

After:

- Current edge-aware gating logic.

## Results (local)

| Route/Scenario | Metric | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| `delete_kwarg` (no edge input) | project-config patch calls/op | 1 | 0 | -100% |
| `delete_kwarg` (no edge input) | latency median | 258.6135 ms | 257.8395 ms | +0.30% faster |
| `delete_kwarg` (no edge input) | latency p95 | 341.1939 ms | 349.2813 ms | -2.37% |
| `delete_kwarg` (with edge input) | project-config patch calls/op | 1 | 1 | 0% |
| `delete_kwarg` (with edge input) | latency median | 302.4410 ms | 318.6843 ms | -5.37% |
| `delete_kwarg` (with edge input) | latency p95 | 363.7361 ms | 371.1692 ms | -2.04% |
| `delete_selected_params` (no edge input) | project-config patch calls/op | 1 | 0 | -100% |
| `delete_selected_params` (no edge input) | latency median | 1640.3928 ms | 1653.4485 ms | -0.80% |
| `delete_selected_params` (no edge input) | latency p95 | 1740.8948 ms | 1748.5162 ms | -0.44% |
| `delete_selected_params` (with edge input) | project-config patch calls/op | 1 | 1 | 0% |
| `delete_selected_params` (with edge input) | latency median | 1645.1207 ms | 1657.5858 ms | -0.76% |
| `delete_selected_params` (with edge input) | latency p95 | 1744.8208 ms | 1667.8413 ms | +4.41% faster |

## Notes

- Primary objective is achieved: project-config patches are eliminated on
  non-edge deletions for both routes.
- Edge-affecting deletions still send project-config patches as required.
- Latency movement is small and noisy in this sample size; the deterministic win
  is reduced patch transport volume in high-frequency non-edge delete flows.
