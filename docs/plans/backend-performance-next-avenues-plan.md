# Backend Performance Plan: Next Avenues (Post-Current Branch Optimizations)

## Intent

- Target backend optimizations with the highest remaining impact-per-complexity.
- Focus on avenues that are different from work already completed on this branch.
- Keep behavior deterministic and correctness-preserving.

## Already Completed (Excluded From This Plan)

These areas were already optimized on this branch and are not the focus here:

- UI-only fast paths that skip full update/codegen flows.
- Value-edit watcher refresh skips and code-file watcher single-config fast path.
- Incremental codegen fast path for `set_param_entered_value`.
- Read-path helper optimization for dependency graph/name validation.
- `validate_name_rules` and shown-param filtering optimizations.
- Websocket broadcast pre-serialization.

## Investigation Summary

### Method

- Code-path audit of:
  - `backend/setta/project_state/base_project_manager.py`
  - `backend/setta/types/project_state.py`
  - `backend/setta/types/helpers_lvl3.py`
  - `backend/setta/project_state/history.py`
  - `backend/setta/project_state/session_project_manager.py`
  - `backend/setta/mcp/server.py`
- Targeted local measurements with Python env active (`source activate.sh`) using synthetic callable project states (`build_callable_project_state`).

### Current Baselines (Local, Median)

- Update/write-path:
  - `update(validate_name_rules=False, updateFileWatcher=False)`: `150.5 ms` (1000 params)
  - `update(validate_name_rules=False, updateFileWatcher=True)`: `174.1 ms`
  - `_refresh_codegen_state`: `69.7 ms`
  - `validate_for_update(validate_name_rules=False)`: `30.0 ms`
  - `_merge_project_state_backend(updateFileWatcher=True)`: `16.4 ms`
- Read-path:
  - `get_latest_project_state_summary` (current route path): `57.8 ms`
  - `build_project_state_summary(single-config state)`: `14.1 ms`
  - `convert_backend_to_single_config`: `46.5 ms` (1000), `92.8 ms` (2000)
  - `get_single_config_state` cache hit: `~0.00025 ms`
- Queue contention:
  - `get_latest_project_state_summary` while serialized queue is blocked: `402.2 ms`
  - `get_latest_project_state` while serialized queue is blocked: `393.0 ms`
  - `get_latest_lsp_diagnostics` (already non-serialized) under same blocker: `0.107 ms`
- State copy/persistence:
  - `history.add_current_copy`: `40.5 ms` (1000), `79.5 ms` (2000)
  - `ProjectStateBackend.model_copy(deep=True)`: `39.8 ms` (1000), `80.4 ms` (2000)
  - `_save_project_state`: `58.0 ms` (1000), `115.2 ms` (2000)

## Root Causes (Priority Order)

1. Read endpoints with tiny intrinsic work are still serialized behind write operations.
2. Summary/read paths still pay full backend-to-single-config conversion in key call sites.
3. Every non-coalesced history entry deep-copies full backend state.
4. Update validation still recomputes several full-state derived structures each write.
5. Save path runs synchronous deep-copy + serialization on the manager thread.

## Plan

### Phase 1: Remove Head-of-Line Blocking From Read Endpoints

Goal: eliminate unnecessary queue wait on reads.

1. Convert these manager methods to non-serialized enqueue mode:
   - `get_latest_project_state`
   - `get_latest_project_state_summary`
2. Add explicit read-lock coverage inside those methods.
3. Keep write paths serialized as-is.

Expected impact:
- `~350-400 ms` queue-wait elimination under active write load for these reads.

Verification:
- Add concurrency tests mirroring `test_completion_queue_concurrency` style for the two read endpoints.
- Assert read responses are available while serialized writes are queued.

### Phase 2: Standardize Cache-Aware Summary/Single-Config Reads

Goal: avoid repeated `convert_backend_to_single_config(...)` for read-heavy flows.

1. Change `get_latest_project_state_summary` to source from `get_single_config_state(...)`.
2. Add revision-keyed summary cache (`project_config_id + history.revision`).
3. In MCP server scoped-state retrieval, prefer manager cache-aware single-config access over direct backend conversion where safe.
4. Replace obvious direct conversion callsites in hot read paths with cache-aware helpers.

Expected impact:
- `get_latest_project_state_summary` from `~58 ms` toward `~14 ms` steady-state.
- Lower repeated read CPU in MCP-heavy flows.

Verification:
- Add tests for cache invalidation across history revision changes (including undo/redo).
- Micro-benchmark before/after for summary route and MCP scoped tool path.

### Phase 3: Reduce Full-State Validation Work On Writes

Goal: cut recurring write overhead without changing semantics.

1. Introduce mutation impact metadata (which sections/variants are structurally touched).
2. Incrementalize derived validations now recomputed globally on each write:
   - `shownParamIds`
   - `parentSectionMap`
   - `requiredDecodedImages`
   - `singletonSections`
3. Keep full validation fallback for uncertain/complex mutations.

Expected impact:
- `~15-30 ms` reduction on common write paths at 1000 params.

Verification:
- Parity tests comparing incremental validation outputs vs forced full recompute.
- Existing route behavior tests remain green.

### Phase 4: Cut Deep-Copy Cost In History + Save

Goal: address remaining large O(state-size) copy costs.

1. History:
   - Replace full-backend deepcopy-per-entry with structural-sharing strategy (config-scoped copy or patch entry model).
   - Preserve strict undo/redo behavior.
2. Save:
   - Avoid redundant deep copies between `_save_project_state` and readable export.
   - Move save serialization/write off the main async execution path (thread offload).

Expected impact:
- History entry cost from `~40-80 ms` toward low single-digit ms on common mutations.
- Save stalls significantly reduced (`~58-115 ms` baseline today).

Verification:
- Undo/redo parity tests on mixed mutation sequences.
- Save/autosave queue tests (ordering, durability, failure propagation).

## Success Criteria

- Read endpoints are no longer blocked by serialized writes (target: sub-20ms under queue contention for read-only handlers).
- `get_latest_project_state_summary` steady-state median reduced by at least 60%.
- Non-name-validation `update(..., updateFileWatcher=True)` median reduced by at least 20% from current baseline.
- History copy and save-path medians reduced substantially on 1000+ param states.

## Non-Goals

- No heuristic invalidation.
- No protocol redesign for incremental websocket diffs in this pass.
- No behavior changes to undo/redo, validation semantics, or share-mode policy guarantees.
