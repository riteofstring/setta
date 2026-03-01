# Move-sections name-validation gating

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce drag-path ACK latency for `move_sections` by removing name-rule validation and name-validation broadcasts from this layout-only structural route.

## Change

Backend (`base_project_manager.py`):

- Updated `move_sections(...)` to call `_update_and_broadcast_structural_patch(...)` with:
  - `validate_name_rules=False`
  - `broadcast_name_validation_errors=False`

Reasoning:

- `move_sections` updates section layout/parent placement only; it does not mutate section/param/project names.
- Recomputing and broadcasting full name-validation payloads on every move adds avoidable compute on a high-frequency drag route.

Tests:

- Updated `tests/project_state/test_structural_patch_transport.py`:
  - `test_move_sections_uses_structural_patch_transport`
  - now expects `0` name-validation broadcasts for `move_sections`.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_structural_patch_transport.py -k "move_sections_uses_structural_patch_transport or group_and_ungroup_use_structural_patch_transport" -q`

Result:

- Ruff: passed
- Targeted backend tests: `2 passed`

## Benchmark scenario

Environment:

- Local dev machine, Python env via `source activate.sh`
- Synthetic callable project state with `1000` params
- Autosave disabled

Method:

1. Route benchmark: `move_sections` top-level position toggles on `section-1`.
2. Two modes:
- `legacy`: monkeypatch `_update_and_broadcast_structural_patch(...)` to force
  `validate_name_rules=True` and `broadcast_name_validation_errors=True`.
- `patched`: native route behavior after this change.
3. Warmup/measured: `3` warmup + `12` measured iterations.
4. Metrics:
- ACK latency (`route(...)` + `finish_pending_operations(...)`)
- Name-validation broadcast call count during benchmark loop.

## Results (local)

| Route | Metric | Legacy | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `move_sections` | latency median | 207.36 ms | 177.00 ms | +14.64% faster |
| `move_sections` | latency p95 | 317.17 ms | 325.98 ms | -2.78% |
| `move_sections` | name-validation broadcasts | 15 | 0 | -100.00% |

## Notes

- Median ACK improved while removing all name-validation fanout on this drag path.
- p95 is noisy in local runs, but this change removes deterministic per-call validation work from a high-frequency route.
