# Task-board watcher-refresh skip on patch ACK path

Date: 2026-03-03  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce hot-path latency for `set_task_board_section_state` by skipping file-watcher
refresh work that is unrelated to task-board state mutations.

Why this route matters:

- Frontend sends `route_set_task_board_section_state(...)` from task-board mutation
  flows in `frontend/src/components/Section/Layouts/TaskBoardArea.tsx`.
- During active task-board edits (including drag/reorder), this route is invoked
  repeatedly.

## Change

Backend (`base_project_manager.py`):

- `set_task_board_section_state(...)` now calls
  `_merge_and_broadcast_section_impl_patch_with_deferred_codegen_refresh(...)`
  with:
  - `updateFileWatcher=False`

This keeps existing behavior for:

- section-impl patch ACK transport,
- deferred codegen refresh scheduling,
- no synchronous codegen refresh on ACK path.

It only removes unnecessary watcher refresh calls (`watch_json_source_files`,
`watch_artifact_files`, `watch_code_files`, watch-code sync) from this specific
route.

Tests:

- Extended `tests/project_state/test_task_board_deferred_refresh.py` to assert
  task-board ACK path does not invoke watcher refresh hooks.
- Extended `tests/project_state/test_patch_transport_additional_routes.py` to
  assert additional section-scoped patch-transport routes do not emit
  name-validation broadcasts.

## Validation

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_task_board_deferred_refresh.py tests/project_state/test_patch_transport_additional_routes.py`
- `source activate.sh && ruff format --check backend/setta/project_state/base_project_manager.py tests/project_state/test_task_board_deferred_refresh.py tests/project_state/test_patch_transport_additional_routes.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_patch_transport_additional_routes.py tests/project_state/test_task_board_deferred_refresh.py tests/project_state/test_chat_section_chat_id.py -q`

Result:

- Ruff check: passed
- Ruff format check: passed
- Backend tests: `8 passed`

## Benchmark scenario

Environment:

- Local dev machine
- Python env via `source activate.sh`
- Autosave disabled

State shape:

- `build_callable_project_state(1000)`
- Added one task-board section

Method:

1. Two modes:
   - `legacy_forced_watcher_refresh` (emulated):
     - monkeypatch `_merge_and_broadcast_section_impl_patch_with_deferred_codegen_refresh`
       to force `updateFileWatcher=True`.
   - `patched_task_board_watcher_skip`: native behavior (`updateFileWatcher=False`
     for this route).
2. Per mode: `3` warmup + `12` measured iterations.
3. Route under test:
   - `set_task_board_section_state(...)`
4. Metrics:
   - route latency (`route(...)` + `finish_pending_operations(...)`)
   - watcher-refresh hook calls during measured iterations
     (`watch_json_source_files`, `watch_artifact_files`, `watch_code_files`,
     watch-code sync)

## Results (local)

| Mode | Median | p95 | Watcher refresh calls (12 iters) |
| --- | ---: | ---: | ---: |
| `legacy_forced_watcher_refresh` | 99.25 ms | 184.72 ms | 60 |
| `patched_task_board_watcher_skip` | 73.59 ms | 176.76 ms | 0 |

Derived deltas:

- Median latency: `25.86%` faster
- p95 latency: `4.31%` faster
- Watcher refresh calls: `60 -> 0` (`-100%`)

## Notes

- This route does not modify code/json-source/artifact watcher inputs, so
  skipping watcher refresh is behaviorally safe and removes repeated overhead
  from edit-heavy task-board interactions.
- Deferred refresh and patch transport behavior remains unchanged.
