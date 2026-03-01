# gen-code prefix/suffix deferred refresh

Date: 2026-03-02  
Area: backend  
Branch/Commit: backend-performance @ 972297e5 (baseline) -> working tree

## Goal

Reduce high-frequency typing latency for `set_gen_code_prefix` and
`set_gen_code_suffix` by removing synchronous codegen refresh + full project-state
snapshot from the edit hot path.

## Change

Backend changes:
- `set_gen_code_prefix` / `set_gen_code_suffix` now:
  - coalesce history entries with `genCodePrefixSuffix:<projectConfigId>`
  - apply UI-only `projectConfig` patch transport immediately
  - schedule deferred codegen refresh via per-project async debouncer
- Added deferred refresh state:
  - `_gen_code_prefix_suffix_refresh_debouncer_by_project_config`
  - `_pending_gen_code_prefix_suffix_refresh_revision_by_project_config`
- Added pending refresh flush on `create_run_command(...)` to guarantee run-code
  uses up-to-date generated code.
- Added shutdown cleanup for per-project deferred refresh debouncers.

Behavioral guardrails:
- Added `tests/project_state/test_gen_code_prefix_suffix_deferred_refresh.py`:
  - `test_set_gen_code_prefix_uses_project_config_patch_and_defers_refresh`
  - `test_create_run_command_flushes_pending_gen_code_prefix_refresh`

## Benchmark scenario

Representative route benchmark: `set_gen_code_prefix`

Method:
1. Use `real_settings_manager()` with autosave disabled.
2. Build synthetic callable project state with 1000 params.
3. Attach one connected in-memory frontend websocket.
4. Benchmark 40 measured iterations (5 warmup), changing prefix each iteration.
5. Measure per iteration:
   - route latency (`set_gen_code_prefix` + `finish_pending_operations`)
   - websocket message type
   - websocket payload bytes
6. Baseline emulation uses pre-change behavior:
   - mutate target prefix
   - call `_update_and_broadcast_project_state_no_name_validation(...)`

## Results (local)

`set_gen_code_prefix` on 1000-param synthetic state:

- Message type:
  - baseline: `UpdateFrontendProjectState`
  - after: `PatchFrontendProjectStateProjectConfig`

- Websocket payload bytes:
  - baseline median: `759,440`
  - after median: `3,874`
  - reduction: `99.49%` (`~196.04x` smaller)

- Route latency:
  - baseline median: `231.5302 ms`
  - after median: `47.3957 ms`
  - median improvement: `~79.53%`

- Tail latency:
  - baseline p95: `509.2588 ms`
  - after p95: `145.8123 ms`
  - p95 improvement: `~71.37%`

Notes:
- Deferred codegen refresh moves heavy work off the keypress path; refresh is
  still guaranteed before run execution via `create_run_command(...)` flush.

## Coverage

Backend:
- `tests/project_state/test_gen_code_prefix_suffix_deferred_refresh.py`
- `tests/project_state/test_format_code.py -k "gen_code_prefix or gen_code_suffix"`
- `tests/project_state/test_type_check.py -k "gen_code_prefix or gen_code_suffix"`
