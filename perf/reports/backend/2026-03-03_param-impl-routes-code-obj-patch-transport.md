# param impl routes code-obj patch transport

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Move remaining param-impl mutation routes off full `UpdateFrontendProjectState`
snapshots and onto revisioned code-obj patch transport to reduce websocket
payload size at high edit frequency.

Routes converted in this step:
- `change_param_impl`
- `update_param_impl_config`

## Change

Backend:
- `BaseProjectManager.change_param_impl(...)`
  - replaced `update_and_broadcast_project_state(...)`
  - now broadcasts via `_update_and_broadcast_code_obj_and_section_patches(...)`
  - scope: `code_obj_ids=[paramInfoId]` + codegen singleton section patch scope
- `BaseProjectManager.update_param_impl_config(...)`
  - same migration to `_update_and_broadcast_code_obj_and_section_patches(...)`
  - scope: `code_obj_ids=[paramInfoId]` + codegen singleton section patch scope

Tests:
- Added `tests/project_state/test_param_impl_patch_transport.py`
  - `test_update_param_impl_config_uses_code_obj_patch_transport`
  - `test_change_param_impl_uses_code_obj_patch_transport`

## Validation

- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_param_impl_patch_transport.py tests/project_state/test_patch_transport_additional_routes.py`
- `pnpm -C frontend gcf`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_param_impl_patch_transport.py tests/project_state/test_patch_transport_additional_routes.py`

Result:
- Backend targeted tests: `4 passed` (post-`gcf` rerun).

## Benchmark scenario

Method:
1. `real_settings_manager()` fixture, autosave disabled.
2. Synthetic callable state from `build_callable_project_state(1000)`.
3. Two transport modes:
- `legacy_snapshot`: monkeypatch `_update_and_broadcast_code_obj_and_section_patches` to use `update_and_broadcast_project_state`.
- `patched`: current code path.
4. For each route/mode: 5 warmup + 25 measured iterations.
5. Per-op metrics:
- ACK latency: route call + `finish_pending_operations(...)`.
- transport payload bytes: sum of serialized websocket project-state transport messages per op (`UpdateFrontendProjectState` and patch message types).

## Results (local)

| Route | Metric | Legacy Snapshot | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `update_param_impl_config` | latency median | 273.5704 ms | 288.1841 ms | -5.34% |
| `update_param_impl_config` | latency p95 | 558.1518 ms | 641.9177 ms | -15.01% |
| `update_param_impl_config` | payload median | 759268 B | 928 B | -99.88% |
| `update_param_impl_config` | payload p95 | 759269 B | 929 B | -99.88% |
| `change_param_impl` | latency median | 288.9455 ms | 282.8422 ms | +2.11% faster |
| `change_param_impl` | latency p95 | 592.2497 ms | 593.8487 ms | -0.27% |
| `change_param_impl` | payload median | 765368 B | 1799 B | -99.77% |
| `change_param_impl` | payload p95 | 768973 B | 2240 B | -99.71% |

## Notes

- Transport-size win is the dominant benefit in this tranche (`~425x` to `~818x`
  smaller payloads per op).
- ACK latency remains noisy and mostly dominated by compute/refresh work in these
  routes; this aligns with earlier findings that stage-B/deferred refresh work is
  the next major latency lever after transport reductions.
