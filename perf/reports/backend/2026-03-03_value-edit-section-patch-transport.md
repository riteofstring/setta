# Backend Perf Report: Value-Edit Routes on Section Patch Transport

Date: 2026-03-03

## Summary
- Converted value-edit routes from full project-state snapshot transport to section-impl patch transport.
- Updated routes:
- `set_code`
- `set_text_block_text`
- `set_prompt_template`
- `set_prompt_inputs`
- `set_prompt_format`
- Patch scope now includes the edited section plus active generated-code singleton sections (`GenPythonCode` / `GenPythonMetadata`) when present, to preserve frontend consistency after synchronous codegen refresh.

## Validation
- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_value_edit_watcher_ux.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_value_edit_watcher_ux.py tests/project_state/test_patch_transport_additional_routes.py tests/project_state/test_set_param_entered_value_ux.py tests/project_state/test_param_name_value_ux.py tests/project_state/test_task_board_deferred_refresh.py tests/project_state/test_ui_only_fast_path.py`
- Result: 46 passed.

## Benchmark Method
- Python env via `source activate.sh`.
- Synthetic state: `build_callable_project_state(1000)`.
- Created extra Code/TextBlock/Prompt sections for route invocation.
- For each route, measured two modes over 5 warmups + 25 measured iterations:
- `legacy_snapshot`: monkeypatched `_update_and_broadcast_section_impl_patches` to call `update_and_broadcast_project_state(...)` (full snapshot baseline behavior).
- `patched`: current section-impl patch transport behavior.
- Captured per-op ACK latency and websocket payload bytes (project-state snapshot + section-patch messages).

## Results

| Route | Metric | Legacy Snapshot | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_code` | latency median | 145.2855 ms | 142.7395 ms | +1.75% faster |
| `set_code` | latency p95 | 257.4010 ms | 259.3629 ms | -0.76% |
| `set_code` | payload median | 764084 B | 640 B | -99.92% |
| `set_code` | payload p95 | 764084 B | 640 B | -99.92% |
| `set_text_block_text` | latency median | 168.5462 ms | 164.7255 ms | +2.27% faster |
| `set_text_block_text` | latency p95 | 282.5849 ms | 287.9256 ms | -1.89% |
| `set_text_block_text` | payload median | 764099 B | 645 B | -99.92% |
| `set_text_block_text` | payload p95 | 764099 B | 645 B | -99.92% |
| `set_prompt_inputs` | latency median | 174.0080 ms | 170.8212 ms | +1.83% faster |
| `set_prompt_inputs` | latency p95 | 294.6038 ms | 286.9483 ms | +2.60% faster |
| `set_prompt_inputs` | payload median | 763952 B | 638 B | -99.92% |
| `set_prompt_inputs` | payload p95 | 763952 B | 638 B | -99.92% |

## Notes
- The dominant win in this tranche is transport cost (message size), which drops from ~764 KB full snapshots to ~640 B patch payloads per edit in this synthetic setup.
- ACK latency impact is modest because synchronous codegen/validation work still dominates these routes; this aligns with the roadmap item to split commit from heavy refresh.
