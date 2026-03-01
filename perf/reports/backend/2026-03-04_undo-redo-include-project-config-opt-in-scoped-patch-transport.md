# undo/redo include-project-config scoped transport with explicit opt-in

Date: 2026-03-04  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Keep the payload win for safe `include_project_config` undo/redo history entries,
without regressing structural undo/redo correctness.

## Change

`BaseProjectManager` now treats `include_project_config` undo/redo scoped transport
as an explicit opt-in instead of an implicit default.

- Added history-entry flag:
  - `include_project_config_targeted_patch_transport`
- `add_new_history_entry(...)` now accepts that flag and validates it:
  - cannot be set unless `include_project_config=True`.
- `_build_history_entry_undo_redo_patch_scope(...)` behavior for
  `include_project_config` entries:
  - default (`False`) => returns `None` and preserves legacy full fallback transport.
  - opt-in (`True`) => returns targeted scope (`project config + scoped section/code-obj`).
- `_add_project_config_and_scoped_history_entry(...)` now takes/pass-through
  `include_project_config_targeted_patch_transport`.
- `set_type_error_ignore(...)` explicitly opts in, because its history scope is
  non-structural and safely transportable as project-config + section-impl patch.

This keeps scope transport metadata explicit and route-owned, not heuristic.

## Regression Coverage

Updated `tests/project_state/test_structural_patch_transport.py`:

- `test_undo_redo_include_project_config_history_uses_targeted_patch_transport`
  (safe opt-in path remains targeted)
- `test_undo_redo_structural_include_project_config_history_uses_full_patch_transport`
  (structural include-project-config route remains full fallback)
- `test_undo_redo_unknown_scope_still_uses_full_patch_transport`
  (fallback path unchanged)

## Verification

- `source activate.sh && ruff check backend/setta/project_state/base_project_manager.py tests/project_state/test_structural_patch_transport.py`
- `source activate.sh && pytest tests/project_state/test_structural_patch_transport.py -q`
- `source activate.sh && pytest tests/project_state -q`
- `pnpm -C frontend exec vitest run src/state/actions/undo.test.ts src/utils/workspaceHistory.test.ts src/utils/workspaceHistoryHandoff.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-undo-redo.spec.ts`

## Benchmark Scenario

Environment:

- local dev machine
- python env via `source activate.sh`
- one connected in-memory frontend websocket (payload serialization included)
- synthetic state: `build_callable_project_state(1000)`

Method:

1. Seed one `set_type_error_ignore(...)` history entry.
2. Run repeated undo/redo pair toggles.
3. Compare two modes:
   - `legacy_full_transport` emulation:
     `_resolve_undo_redo_patch_scope_for_navigation_tokens(...) -> None`
   - `optimized_scoped_transport`:
     native behavior with opt-in scoped include-project-config transport.
4. Per mode: `3` warmup pairs + `12` measured pairs.
5. Record:
   - pair latency (median, p95)
   - websocket payload/transport bytes
   - transport message shape counts

## Results (local)

- Pair median latency:
  - legacy: `3714.497 ms`
  - optimized: `3740.406 ms`
  - delta: `-0.70%` (local-noise, essentially flat)
- Pair p95 latency:
  - legacy: `3737.871 ms`
  - optimized: `3787.032 ms`
  - delta: `-1.32%` (local-noise sample)
- Transport bytes:
  - legacy: `17,318,244`
  - optimized: `110,760`
  - improvement: `~99.36%`

Transport shape per `24` navigation calls:

- legacy: `24 code-obj patches + 24 structural patches`
- optimized: `24 project-config patches + 24 section-impl patches`

## Notes

- The architectural change here is correctness-first routing:
  include-project-config scoped undo/redo transport must be explicitly declared
  safe by route scope owner.
- This avoids broad, unsafe assumptions for structural routes while keeping very
  large payload reductions for opted-in non-structural routes.
