# Backend Performance: High-Impact Next Avenues Plan

## Objective

Target backend performance wins with the highest impact-per-effort that are **different** from the optimization work already completed on this branch.

## Already Optimized In This Branch (Out of Scope)

These were already addressed and are intentionally excluded from this plan:

- UI-only mutation fast paths that skip full update/codegen work.
- Watcher refresh skips for value-edit and formatting routes.
- Incremental codegen fast path for `set_param_entered_value`.
- Read-helper fast paths for dependency graph and name validation.
- `validate_name_rules` and `shownParamIds` optimization.
- Websocket broadcast pre-serialization.
- Read-route queue de-blocking (`get_latest_project_state`, `get_latest_project_state_summary` now non-serialized).

## Investigation Summary

### Method

- Audited hot paths in:
  - `backend/setta/project_state/base_project_manager.py`
  - `backend/setta/project_state/session_project_manager.py`
  - `backend/setta/project_state/history.py`
  - `backend/setta/types/helpers_lvl3.py`
  - `backend/setta/plugins/manager.py`
  - `backend/setta/mcp/server.py`
- Ran fresh local micro-benchmarks in this worktree using:
  - `source activate.sh && python ...`
  - `build_callable_project_state(1000)` synthetic state
  - `real_settings_manager()` test fixture

### Current Baselines (Median, Local)

- Read/slicing:
  - `convert_backend_to_single_config`: `46.435 ms`
  - `build_project_state_summary(single-config state)`: `12.786 ms`
  - `get_latest_project_state_summary` route path: `56.51 ms`
  - `get_single_config_state` cache hit: `0.00025 ms`
- Write/update:
  - `validate_for_update(validate_name_rules=False)`: `29.955 ms`
  - `_refresh_codegen_state`: `69.565 ms`
  - `_merge_project_state_backend(updateFileWatcher=True)`: `16.143 ms`
  - `update(updateFileWatcher=True, validate_name_rules=False)`: `115.294 ms`
  - `update(updateFileWatcher=True, validate_name_rules=True)`: `121.595 ms`
- Copy/save:
  - `history.add_current_copy`: `37.72 ms`
  - `ProjectStateBackend.model_copy(deep=True)`: `39.042 ms`
  - `_save_settings_project`: `104.776 ms`

## Highest Bang-for-Buck Opportunities

### 1) Cache-Aware Summary and Read Views (Highest Priority)

Why now:

- Summary route still pays full backend-to-single-config conversion every call.
- Measured route cost (`56.51 ms`) is dominated by conversion (`46.435 ms`), while summary build itself is much smaller (`12.786 ms`).

Plan:

1. Change `get_latest_project_state_summary` to use `get_single_config_state(...)` instead of direct `convert_backend_to_single_config(...)`.
2. Add revision-keyed summary cache:
   - key: `(project_config_id, history_revision, optional_allowed_section_scope)`
   - invalidate on history revision change (same strategy as existing single-config cache invalidation).
3. Add a shared cache-aware helper for read callers that currently convert directly in hot paths:
   - `backend/setta/plugins/manager.py` (`host.read_project_state`)
   - MCP server read flows where repeated same-revision reads are common.

Expected impact:

- Summary route should move from ~`56 ms` toward low-to-mid teens (roughly the current summary-build baseline).
- Lower CPU churn across repeated read-heavy agent/plugin workflows.

Complexity/Risk:

- Low to medium.
- Main risk is stale cache invalidation; mitigated via history revision keying.

Verification:

- Add tests proving cache invalidates on `history.revision` changes (including undo/redo).
- Add tests proving same-revision repeat reads avoid repeated conversion.

### 2) Save Path Decoupling and Copy Deduplication (High Priority)

Why now:

- Save remains expensive (`~105 ms` in local benchmark), and save work includes deep-copy + serialization + filesystem writes.
- This work currently runs synchronously on the manager execution path.

Plan:

1. Introduce a save worker/offload path (thread executor) with explicit revision capture.
2. Queue/coalesce saves by revision:
   - keep latest requested revision
   - avoid redundant in-flight writes of older revisions.
3. Remove duplicate deep-copy work in save/export pipeline:
   - share one sanitized snapshot for DB write + readable export where semantics allow.
4. Keep manual-save durability semantics explicit:
   - manual save awaits completion and surfaces failures immediately.

Expected impact:

- Reduced operation stalls around autosave/manual save.
- Better tail latency under write-heavy sessions.

Complexity/Risk:

- Medium.
- Risks are ordering/durability regressions; requires strong tests.

Verification:

- Add tests for save ordering, coalescing correctness, and failure propagation.
- Add tests that exported readable payload remains behavior-identical.

### 3) History Deep-Copy Cost Reduction (High Impact, Medium-High Complexity)

Why now:

- `history.add_current_copy` is still ~`38 ms` and is paid repeatedly across many mutation routes.
- Cost is essentially full backend deepcopy (`~39 ms`), which scales with state size.

Plan:

1. Introduce structural-sharing history entries for common single-config mutations:
   - store immutable base backend + changed config payload, or
   - store patch entry plus deterministic replay for undo/redo.
2. Keep full-copy fallback for complex global mutations initially.
3. Roll out behind explicit entry type boundaries with parity checks.

Expected impact:

- Significant reduction to per-mutation overhead on common write routes.
- Biggest gains on large states and high-frequency edits.

Complexity/Risk:

- Medium-high.
- Undo/redo correctness is the core risk.

Verification:

- Add parity tests comparing old vs new history behavior on mixed mutation sequences.
- Add stress tests for long undo/redo chains and coalesced history entries.

### 4) Incremental `validate_for_update` Derived-State Recompute (Medium Priority)

Why now:

- `validate_for_update` is now a meaningful residual cost (~`30 ms`) after prior optimizations.
- It recomputes full derived structures (`parentSectionMap`, `shownParamIds`, `requiredDecodedImages`, `singletonSections`, view-mode cleanup) each update.

Plan:

1. Add mutation impact metadata to write handlers (which sections/variants were touched).
2. Incrementalize derived-state recompute for affected subsets.
3. Keep deterministic full-recompute fallback for unknown mutation categories.

Expected impact:

- Moderate but broad write-path reduction, especially for localized edits.

Complexity/Risk:

- Medium.
- Risk is partial invalidation bugs; avoid heuristics, use explicit touched-id metadata.

Verification:

- Add parity tests: incremental path output must equal full-recompute output for representative mutation classes.

## Delivery Order

1. Cache-aware summary/read views.
2. Save path offload + copy dedupe.
3. History deep-copy reduction.
4. Incremental validation recompute.

Rationale:

- Phase 1 is fast to ship and immediately removes large repeat-read waste.
- Phases 2 and 3 target large fixed costs still paid in write-heavy workflows.
- Phase 4 is valuable but follows once copy/save and read hot paths are addressed.

## Success Criteria

- `get_latest_project_state_summary` median reduced by at least 60%.
- Save path no longer blocks critical manager flow for the full serialization/write duration in autosave scenarios.
- History entry creation cost reduced substantially for common single-config mutations.
- `update(..., validate_name_rules=False)` median reduced further without changing route behavior.

## Non-Goals

- No heuristic cache invalidation.
- No protocol redesign for frontend incremental project-state diffs in this pass.
- No behavior changes to undo/redo semantics or save durability guarantees.
