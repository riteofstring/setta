# Value-edit route name-validation broadcast gating

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Remove unnecessary name-validation broadcast work from high-frequency value-edit
routes that cannot change project/section/param names.

Targeted routes:

- `set_prompt_template`
- `set_prompt_inputs`
- `set_prompt_format`
- `set_text_block_text` (only skip when `headingAsSectionName=False`)

## Change

Backend (`base_project_manager.py`):

- `set_prompt_template(...)`, `set_prompt_inputs(...)`, `set_prompt_format(...)`
  now call `_update_and_broadcast_section_impl_patches(...)` with:
  - `broadcast_name_validation_errors=False`
- `set_text_block_text(...)` now gates name-validation broadcast by section mode:
  - reads `TextBlockSectionImpl.headingAsSectionName`
  - only broadcasts name-validation errors when heading-as-name is enabled

Tests (`tests/project_state/test_value_edit_watcher_ux.py`):

- Updated route broadcast-shape expectations:
  - prompt/text value-edit routes default to `0` name-validation broadcasts.
- Added explicit heading-as-name coverage:
  - `test_set_text_block_text_broadcasts_name_validation_with_heading_name`

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_value_edit_watcher_ux.py`
- `source activate.sh && ruff format --check backend/setta/project_state/base_project_manager.py tests/project_state/test_value_edit_watcher_ux.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_value_edit_watcher_ux.py -q`

Result:

- Ruff check: passed
- Ruff format check: passed
- Backend tests: `16 passed`

## Benchmark scenario

Environment:

- Local dev machine
- Python env via `source activate.sh`
- Autosave disabled

State shape:

- `build_callable_project_state(1000)`
- Added one text-block section + one prompt section

Method:

1. Two modes:
   - `legacy_forced_name_validation_broadcast` (emulated):
     - force section-impl patch helper to always pass
       `broadcast_name_validation_errors=True`
     - force `_broadcast_name_validation_errors(...)` to disable unchanged-payload
       suppression (`suppress_unchanged_broadcast=False`)
   - `patched_route_level_name_validation_gating`: native behavior.
2. Per route/mode: `3` warmup + `12` measured iterations.
3. Metrics:
   - route ACK latency (`route(...)` + `finish_pending_operations(...)`)
   - name-validation websocket broadcast calls during measured iterations

## Results (local)

| Route | Metric | Legacy Forced | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_text_block_text` (`headingAsSectionName=False`) | latency median | 145.32 ms | 151.74 ms | -4.42% |
| `set_text_block_text` (`headingAsSectionName=False`) | latency p95 | 250.48 ms | 239.89 ms | +4.23% faster |
| `set_text_block_text` (`headingAsSectionName=False`) | name-validation broadcasts (12 iters) | 12 | 0 | -100.00% |
| `set_prompt_template` | latency median | 159.98 ms | 155.28 ms | +2.94% faster |
| `set_prompt_template` | latency p95 | 253.85 ms | 251.12 ms | +1.07% faster |
| `set_prompt_template` | name-validation broadcasts (12 iters) | 12 | 0 | -100.00% |
| `set_prompt_inputs` | latency median | 158.12 ms | 150.96 ms | +4.53% faster |
| `set_prompt_inputs` | latency p95 | 253.44 ms | 261.24 ms | -3.08% |
| `set_prompt_inputs` | name-validation broadcasts (12 iters) | 12 | 0 | -100.00% |
| `set_prompt_format` | latency median | 160.80 ms | 153.18 ms | +4.74% faster |
| `set_prompt_format` | latency p95 | 259.24 ms | 261.86 ms | -1.01% |
| `set_prompt_format` | name-validation broadcasts (12 iters) | 12 | 0 | -100.00% |

## Notes

- Primary deterministic outcome is removal of redundant name-validation fanout on
  these value-edit routes (`12 -> 0` broadcasts in measured runs).
- Latency impact is modest and somewhat noisy in this local sample; median trend
  improved for prompt routes while text/p95 results were mixed.
- The heading-as-name text-block path remains covered and still emits
  name-validation updates when heading-derived naming can actually change
  validation state.
