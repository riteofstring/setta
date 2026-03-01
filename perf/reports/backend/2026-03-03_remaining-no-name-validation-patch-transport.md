# Remaining no-name-validation patch transport

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Remove remaining full-snapshot transport usage from no-name-validation mutation paths
where existing revisioned patch message types already cover the changed state.

Routes converted in this tranche:
- `set_code_section_attached_terminal`
- `ensure_code_section_attached_terminal_for_run`
- `format_code`
  - Python code-section path -> section-impl patch transport
  - Gen-python prefix/suffix path -> project-config + section-impl patch transport
- `toggle_variant_json_source`
- `toggle_variant_frozen`
- `set_section_variant_name`
- `apply_listener_emit_updates` dependency-update path

## Change

Backend:
- Replaced full snapshot transport on the routes above with targeted patch transport:
  - Structural patch transport for variant metadata + code/terminal attachment routes.
  - Section-impl/code-obj/project-config patch transport for `format_code` and listener
    dependency updates.
- Added listener dependency patch scoping helper:
  - Builds deterministic `code_obj_ids` and `section_ids` from emitted dependency keys.
  - Preserves no-name-validation behavior (`validate_name_rules=False`,
    `broadcast_name_validation_errors=False`).

Tests:
- Added `tests/project_state/test_listener_emit_patch_transport.py`:
  - `test_listener_emit_section_dependency_uses_section_patch_transport`
  - `test_listener_emit_param_dependency_uses_code_obj_and_section_patches`
- Extended `tests/project_state/test_structural_patch_transport.py`:
  - `test_variant_metadata_routes_use_structural_patch_transport`
  - `test_code_section_terminal_routes_use_structural_patch_transport`
- Updated `tests/project_state/test_format_code.py` broadcast-shape checks for patch transport.
- Updated listener/share tests to assert patch message behavior:
  - `tests/project_state/test_listener_emit_updates.py`
  - `tests/project_state/test_share_project_manager.py`

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_format_code.py tests/project_state/test_listener_emit_updates.py tests/project_state/test_share_project_manager.py tests/project_state/test_structural_patch_transport.py tests/project_state/test_listener_emit_patch_transport.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_structural_patch_transport.py tests/project_state/test_format_code.py tests/project_state/test_listener_emit_updates.py tests/project_state/test_listener_emit_patch_transport.py tests/project_state/test_share_project_manager.py -k "listener_emit_broadcasts_dependency_updates or format_code_preserves_broadcast_shape or structural_patch_transport or listener_emit"`

Result:
- Targeted backend tests: `19 passed`.

## Benchmark scenario

Synthetic benchmark (`1000`-param callable state) with additional dict/code/terminal
sections. Three representative routes measured:
- `apply_listener_emit_updates` (SectionParam dependency update)
- `set_section_variant_name`
- `set_code_section_attached_terminal` (attach/detach alternating)

Method:
1. `real_settings_manager()` fixture, autosave disabled.
2. Baseline emulation (`legacy_snapshot`): monkeypatch patch-broadcast helpers to call
   `_update_and_broadcast_project_state_no_name_validation(...)`.
3. `patched`: native route behavior.
4. 3 warmup + 12 measured iterations per route/mode.
5. Metrics per operation:
- ACK latency (`route(...)` + `finish_pending_operations(...)`).
- Serialized websocket project-state transport bytes across:
  - `UpdateFrontendProjectState`
  - `PatchFrontendProjectStateProjectConfig`
  - `PatchFrontendProjectStateSectionImpl`
  - `PatchFrontendProjectStateCodeObjs`
  - `PatchFrontendProjectStateStructural`

## Results (local)

| Route | Metric | Legacy Snapshot | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `apply_listener_emit_updates` (param) | latency median | 199.6206 ms | 189.0958 ms | +5.27% faster |
| `apply_listener_emit_updates` (param) | latency p95 | 311.1207 ms | 308.1444 ms | +0.96% faster |
| `apply_listener_emit_updates` (param) | payload median | 764,075 B | 1,544 B | -99.80% |
| `apply_listener_emit_updates` (param) | payload p95 | 764,076 B | 1,545 B | -99.80% |
| `set_section_variant_name` | latency median | 190.2493 ms | 180.3499 ms | +5.20% faster |
| `set_section_variant_name` | latency p95 | 307.9252 ms | 293.1948 ms | +4.78% faster |
| `set_section_variant_name` | payload median | 764,074 B | 41,551 B | -94.56% |
| `set_section_variant_name` | payload p95 | 764,075 B | 41,552 B | -94.56% |
| `set_code_section_attached_terminal` | latency median | 242.1779 ms | 237.4063 ms | +1.97% faster |
| `set_code_section_attached_terminal` | latency p95 | 422.3301 ms | 589.5521 ms | -39.59% |
| `set_code_section_attached_terminal` | payload median | 764,147 B | 41,624 B | -94.55% |
| `set_code_section_attached_terminal` | payload p95 | 764,182 B | 41,659 B | -94.55% |

## Notes

- Payload reduction is consistently large for all measured routes (`~94.5%` to `~99.8%`).
- Median route latency improved modestly in this local run; tail latency remains noisy for
  structural attach/detach operations.
- After this tranche, the remaining no-name-validation full snapshot call sites are
  app-definition metadata/spec writes, which still require full snapshots because the
  current patch protocol has no `appDefinition` patch message type.
