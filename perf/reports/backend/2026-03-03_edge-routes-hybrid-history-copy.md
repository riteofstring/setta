# edge routes hybrid history copy

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce deep-copy overhead still present in edge and agentic-edge write routes after
patch transport rollout.

## Change

Backend changes in `BaseProjectManager`:

- Extended `add_new_history_entry(...)` with `include_project_config` so
  project-config copy can be combined with scoped section/code-object copies.
- Added `_add_project_config_and_scoped_history_entry(...)` to compose:
  - project-config-only fallback when no mutable section/code scope is needed,
  - project-config + scoped code-object copy when edge value writes are expected,
  - optional codegen singleton section scope to isolate refresh writes.
- Routed edge routes:
  - `create_edge`, `delete_edges`, `reconnect_edge`, `set_edges`
  - now use project-config + scoped code-object history entries.
- Routed project-config-only routes:
  - `update_edge`, `create_agentic_edge`, `update_agentic_edge`,
    `delete_agentic_edges`, `set_agentic_edges`
  - now use `project_config_only=True`.

## Verification

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_code_obj_scoped_history_copy.py tests/project_state/test_edge_patch_transport.py tests/project_state/test_scoped_history_copy.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_code_obj_scoped_history_copy.py tests/project_state/test_edge_patch_transport.py tests/project_state/test_edge_output_reapply.py tests/project_state/test_scoped_history_copy.py`

Result:

- `14 passed`

## Benchmark scenario

Representative route benchmarks on synthetic callable state (`1000` params):

- `reconnect_edge` (hybrid project-config + code-object scope path)
- `set_agentic_edges` (project-config-only path)

Method:

1. Build state with one edge (two alternate targets) and one agentic edge.
2. Disable autosave and force non-coalesced history each iteration.
3. Measure ACK latency as route call + `finish_pending_operations(...)`.
4. Compare two modes:
   - `legacy`: monkeypatch to emulate pre-change full project-config history copy.
   - `patched`: native hybrid/project-config-only behavior.
5. 5 warmup + 24 measured iterations per route.

Secondary microbenchmark:

- direct `add_new_history_entry(...)` timings (5 warmup + 40 measured):
  - baseline full copy: `project_config_id=...`
  - hybrid: `include_project_config=True` + scoped code object (+ codegen singleton sections)
  - project-config-only: `project_config_only=True`

## Results (local)

Route ACK latency:

| Route | Metric | Legacy | Patched | Delta |
| --- | --- | ---: | ---: | ---: |
| `reconnect_edge` | median | 197.8032 ms | 153.8254 ms | +22.23% faster |
| `reconnect_edge` | p95 | 460.7475 ms | 308.6750 ms | +33.01% faster |
| `set_agentic_edges` | median | 234.0154 ms | 177.5031 ms | +24.15% faster |
| `set_agentic_edges` | p95 | 464.5308 ms | 321.1874 ms | +30.86% faster |

History-entry construction:

- Full copy (`project_config_id=...`):
  - median: `52.9275 ms`
  - p95: `316.4980 ms`
- Hybrid (`include_project_config=True` + scoped code obj):
  - median: `7.4848 ms` (`~85.86%` lower)
  - p95: `8.3853 ms` (`~97.35%` lower)
- Project-config-only (`project_config_only=True`):
  - median: `1.7931 ms` (`~96.61%` lower)
  - p95: `2.5333 ms` (`~99.20%` lower)

## Coverage

- `tests/project_state/test_code_obj_scoped_history_copy.py`
- `tests/project_state/test_edge_patch_transport.py`
- `tests/project_state/test_edge_output_reapply.py`
- `tests/project_state/test_scoped_history_copy.py`
