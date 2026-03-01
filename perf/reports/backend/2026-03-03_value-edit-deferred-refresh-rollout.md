# Value-edit deferred refresh rollout

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Continue the value-edit optimization path by moving remaining section-impl patch routes
from synchronous stage-A codegen refresh to deferred stage-B refresh.

This targets high-frequency edit routes where transport is already patch-based, but
ACK latency is still dominated by synchronous `_refresh_codegen_state(...)` work.

Routes/paths migrated in this tranche:

- `set_code`
- `set_text_block_text` (when `headingAsSectionName=False`)
- `set_prompt_template`
- `set_prompt_inputs`
- `set_prompt_format`
- `format_code` (Python code-section branch)

## Change

`backend/setta/project_state/base_project_manager.py`:

- Switched the routes above from:
  - `_update_and_broadcast_section_impl_patches(...)`
- To:
  - `_merge_and_broadcast_code_obj_and_section_patches_with_deferred_codegen_refresh(...)`
- Kept `set_text_block_text` on the existing synchronous path only when
  `headingAsSectionName=True` so section/project name validation recompute behavior
  remains unchanged for heading-derived section names.

Result:

- Stage-A ACK now merges + broadcasts section patch payloads without immediate full
  codegen refresh.
- Deferred stage-B refresh is scheduled via
  `_schedule_deferred_codegen_refresh(project_config_id)`.
- Patch transport shape is preserved (no full snapshot fallback on the covered paths).

## Test coverage updates

- `tests/project_state/test_value_edit_watcher_ux.py`
  - Extended watcher-refresh assertions to distinguish synchronous refresh vs deferred
    scheduling.
  - Updated value-edit route expectations to require deferred refresh scheduling for
    the default route path.
- `tests/project_state/test_format_code.py`
  - Updated Python-section watcher-refresh assertion to require deferred scheduling
    (matching existing GenPython branch behavior).

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_value_edit_watcher_ux.py tests/project_state/test_format_code.py`
- `source activate.sh && ruff format --check backend/setta/project_state/base_project_manager.py tests/project_state/test_value_edit_watcher_ux.py tests/project_state/test_format_code.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_value_edit_watcher_ux.py tests/project_state/test_format_code.py -q`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_value_edit_watcher_ux.py tests/project_state/test_format_code.py tests/project_state/test_watch_code.py -k "set_code or syncs_lsp_before_watch_code_update" -q`

Result:

- Targeted backend tests: `35 passed` (`31` + `4`).

## Benchmark scenario

Synthetic callable state with `1000` params, autosave disabled.

Method:

1. Two modes:
   - `legacy_sync` (emulated): monkeypatch
     `_merge_and_broadcast_code_obj_and_section_patches_with_deferred_codegen_refresh(...)`
     to call `_update_and_broadcast_section_impl_patches(...)` for section-only calls.
   - `patched_deferred`: native deferred helper behavior.
2. For patched mode, deferred scheduling was captured by marking pending revision and
   flushing via `_flush_pending_deferred_codegen_refresh(...)` outside the timed
   window, so ACK timing isolates stage-A.
3. Warmup/measured: `3` warmup + `12` measured per route.
4. ACK latency metric:
   - route call + `finish_pending_operations(...)`.

## Results (local)

| Route/path | Metric | Legacy Sync | Patched Deferred | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_code` | latency median | 144.6153 ms | 76.9517 ms | +46.79% faster |
| `set_code` | latency p95 | 251.7438 ms | 122.2032 ms | +51.46% faster |
| `set_text_block_text` | latency median | 143.3431 ms | 75.6925 ms | +47.19% faster |
| `set_text_block_text` | latency p95 | 246.0405 ms | 177.3512 ms | +27.92% faster |
| `set_prompt_template` | latency median | 146.7186 ms | 78.9987 ms | +46.16% faster |
| `set_prompt_template` | latency p95 | 238.7780 ms | 184.2127 ms | +22.85% faster |
| `set_prompt_inputs` | latency median | 141.7087 ms | 76.8731 ms | +45.75% faster |
| `set_prompt_inputs` | latency p95 | 240.3575 ms | 83.0745 ms | +65.44% faster |
| `set_prompt_format` | latency median | 144.9101 ms | 76.0695 ms | +47.51% faster |
| `set_prompt_format` | latency p95 | 243.5580 ms | 81.0225 ms | +66.73% faster |
| `format_code` (Python section) | latency median | 164.4943 ms | 100.1524 ms | +39.11% faster |
| `format_code` (Python section) | latency p95 | 274.4396 ms | 213.3281 ms | +22.27% faster |

## Notes

- This tranche primarily reduces ACK latency by removing synchronous stage-A
  codegen refresh work from high-frequency edit routes.
- Transport is unchanged (still patch-based), so this is additive to prior payload
  reductions rather than a transport-size optimization.
- `set_text_block_text` retains synchronous behavior only when heading text is used as
  section name, preserving current name-validation recompute behavior.
