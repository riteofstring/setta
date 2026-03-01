# Phase 4 backend perf: broadcast serialization + single-config slice cache

Date: 2026-03-01
Area: backend
Branch/Commit: backend-performance @ 3bc3f6cc (+ working tree)
Related PR: n/a

## Goal

Reduce avoidable CPU overhead in two hot paths:
- websocket fanout broadcasts (`model_dump_json` repeated per target)
- repeated backend-to-single-config slicing in read-heavy manager flows

Touched code paths:
- `backend/setta/websockets/websocket_manager.py`
- `backend/setta/project_state/base_project_manager.py`
- `tests/websockets/test_websocket_manager_sessions.py`
- `tests/project_state/test_single_config_state_cache.py`

## Scenario

- Entry points:
  - `WebsocketManager.broadcast` / `broadcast_to_session`
  - `BaseProjectManager.get_single_config_state`
- Steps to reproduce:
  1. For websocket fanout, connect 20 frontend sockets and broadcast one notification.
  2. For config slicing, build a 500-param callable state and repeatedly resolve one config slice.
- Data set / project used:
  - synthetic websocket fanout set (20 sockets)
  - `build_callable_project_state(500)`
- Browser + OS: n/a (backend-only), macOS.
- Notes:
  - Python environment activated with `source activate.sh`.
  - For slice-cache baseline, direct `convert_backend_to_single_config(...)` calls are used to represent pre-cache behavior.

## Before (baseline)

- Websocket broadcast serialization:
  - Prior implementation serialized per target send (`model_dump_json` once per socket).
  - For 20 targets: expected 20 serializations.
- Single-config slicing:
  - Repeated direct conversion median: `35.0774 ms/call` (500 params, 200 iterations).
  - This aligns with earlier investigation magnitude for this operation.

## After

- Websocket broadcast serialization:
  - `broadcast` now serializes once per target set.
  - Measured with 20 frontend targets:
    - `broadcast model_dump_json_calls = 1`
    - equivalent per-target send loop remains `20` calls.
- Single-config slicing:
  - First cached miss after revision bump: `36.6025 ms`
  - Steady-state cache hit median: `0.0003 ms/call`
  - Direct conversion baseline median remains `35.0774 ms/call`

## Conclusion

- What improved:
  - Broadcast fanout now avoids repeated JSON serialization work as socket count grows.
  - Repeated same-revision single-config reads now avoid repeated slicing work.
- What regressed (if any) + why it is acceptable:
  - No behavior regressions observed in targeted websocket/project-state tests.
- Follow-ups:
  1. Continue monitoring read-heavy code paths for direct `convert_backend_to_single_config(...)` calls that can safely route through cached manager access.
  2. Re-run full backend benchmark suite when Phase 4 work is merged with other pending perf changes.

## Raw Artifacts (local-only)

- No trace artifacts were recorded for this backend-only change.

## Automated Perf Tests

- Playwright spec(s): n/a
- Vitest test(s) / bench(es): n/a
- Guardrails added:
  - `tests/websockets/test_websocket_manager_sessions.py::test_broadcast_serializes_payload_once_for_all_targets`
  - `tests/websockets/test_websocket_manager_sessions.py::test_broadcast_to_session_serializes_payload_once_for_targets`
  - `tests/project_state/test_single_config_state_cache.py::test_get_single_config_state_reuses_slice_within_same_revision`
  - `tests/project_state/test_single_config_state_cache.py::test_get_single_config_state_cache_invalidates_on_history_revision`
