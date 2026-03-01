# app-definition scoped history copy

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Remove full-backend deep-copy overhead from app-definition write routes while
keeping undo/redo semantics unchanged.

## Change

Backend:

- Added `app_definition_only` mode to
  `BaseProjectManager.add_new_history_entry(...)`.
- Added `_copy_backend_for_app_definition_history_entry(...)` that deep-copies
  only `appDefinition` and reuses all non-app-definition backend graph objects.
- Switched app-definition write routes to use scoped history copy:
  - `set_app_definition`
  - `update_app_definition`
  - `compare_and_set_app_definition_spec_version`
  - `compare_and_set_app_definition_spec_path`
  - `compare_and_set_app_definition_theme_mode`
  - `compare_and_set_app_definition_catalog_id`

Tests:

- Added scoped-copy coverage for `app_definition_only` mode in
  `tests/project_state/test_scoped_history_copy.py`.
- Added route-level regression coverage in
  `tests/project_state/test_app_definition.py` to ensure `set_app_definition`
  does not deep-copy project config graph entries.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_app_definition.py tests/project_state/test_scoped_history_copy.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_app_definition.py tests/project_state/test_scoped_history_copy.py -q`

Result:

- Ruff: passed
- Backend tests: `29 passed`

## Benchmark scenario A: direct history entry copy cost

Environment:

- Local dev machine, Python env via `source activate.sh`.
- Synthetic callable state with `1000` params.
- Autosave disabled.

Method:

1. Build callable state and attach an app definition.
2. Measure `add_new_history_entry(...)` only:
   - `legacy`: full copy (`add_new_history_entry(trigger_autosave=False)`)
   - `scoped`: app-definition copy
     (`add_new_history_entry(trigger_autosave=False, app_definition_only=True)`)
3. `5` warmup + `30` measured iterations.

### Results (local)

| Mode | Median | p95 |
| --- | ---: | ---: |
| Legacy full copy | 67.10 ms | 312.62 ms |
| Scoped app-definition only | 1.46 ms | 2.23 ms |

## Benchmark scenario B: app-definition write routes

Environment:

- Local dev machine, Python env via `source activate.sh`.
- Synthetic callable state with `1000` params.
- Autosave disabled.

Method:

1. Two benchmark modes:
   - `legacy`: monkeypatch `add_new_history_entry` to ignore
     `app_definition_only` and force pre-change full copy behavior.
   - `scoped`: current behavior.
2. Seed app definition once, then benchmark:
   - `set_app_definition`
   - `compare_and_set_app_definition_spec_version`
   - `compare_and_set_app_definition_spec_path`
   - `compare_and_set_app_definition_theme_mode`
3. Per route: `5` warmup + `30` measured iterations.

### Results (local)

| Route | Metric | Legacy | Scoped | Delta |
| --- | --- | ---: | ---: | ---: |
| `set_app_definition` | median | 109.56 ms | 42.07 ms | +61.60% faster |
| `set_app_definition` | p95 | 116.57 ms | 46.79 ms | +59.86% faster |
| `compare_and_set_app_definition_spec_version` | median | 110.33 ms | 42.45 ms | +61.52% faster |
| `compare_and_set_app_definition_spec_version` | p95 | 899.30 ms | 49.35 ms | +94.51% faster |
| `compare_and_set_app_definition_spec_path` | median | 110.49 ms | 42.25 ms | +61.77% faster |
| `compare_and_set_app_definition_spec_path` | p95 | 121.27 ms | 46.88 ms | +61.34% faster |
| `compare_and_set_app_definition_theme_mode` | median | 110.56 ms | 42.43 ms | +61.62% faster |
| `compare_and_set_app_definition_theme_mode` | p95 | 372.22 ms | 47.63 ms | +87.20% faster |

## Notes

- Median route latency improvements are consistently ~61-62% across all measured
  app-definition write routes.
- Tail behavior in legacy mode shows intermittent filesystem/GC outliers; scoped
  mode has a tighter distribution.
- Transport-size improvements are unchanged from the prior app-definition patch
  transport work; this change primarily removes history-copy CPU overhead.
