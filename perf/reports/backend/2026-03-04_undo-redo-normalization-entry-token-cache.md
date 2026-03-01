# undo/redo normalization entry-token cache

Date: 2026-03-04  
Area: backend  
Branch/Commit: backend-performance @ working tree

## Goal

Reduce repeated undo/redo overhead under held-key bursts by avoiding redundant
full-graph normalization scans for history entries that were already normalized.

## Change

`History` now tracks stable per-entry tokens:

- `get_current_entry_token()`
- `get_entry_tokens()`

`BaseProjectManager` now tracks normalized history entries by token:

- Added `_normalized_history_entry_tokens`.
- `_normalize_backend_after_history_navigation(...)` now:
  - returns immediately when the current entry token is already normalized.
  - marks token normalized after no-op scan or successful normalization update.
- Token cache invalidation:
  - `project_state_backend` setter discards current token.
  - `_mark_current_backend_revision_dirty()` discards current token.
  - `add_new_history_entry(...)` discards current token and prunes stale tokens.

This keeps normalization correctness while eliminating repeated scans for the
same undo/redo entries.

## Verification

- `pytest tests/project_state/test_history_coalescing.py tests/project_state/test_undo_redo_state_normalization.py tests/project_state/test_set_callable_undo_redo_stress.py -q`
- `pytest tests/project_state/test_structural_patch_transport.py tests/project_state/test_single_config_state_cache.py tests/project_state/test_code_obj_scoped_history_copy.py -q`
- `pytest tests/project_state -q`

## Benchmark Scenario

### A) Undo/redo burst benchmark

Method:

1. Use `real_settings_manager()` with autosave disabled.
2. Build synthetic callable state (`build_callable_project_state`) with 1000/2000 params.
3. Seed history with 24 viewport edits.
4. Warm up 5 undo/redo pairs.
5. Measure 30 pairs (1000-param run) / 20 pairs (2000-param run).
6. Compare:
   - baseline emulation: clear `_normalized_history_entry_tokens` before each
     normalization call (equivalent to old always-scan behavior)
   - optimized: entry-token cache enabled

### B) Normalization microbenchmark

Method:

1. Same fixture and 1000-param state.
2. Warm up by navigating undo/redo once to populate cache.
3. Measure `_normalize_backend_after_history_navigation()` for 60 iterations:
   - baseline emulation: clear token cache before each call
   - optimized: keep token cache

## Results (local)

Undo/redo burst (1000 params):

- combined undo+redo median:
  - baseline: `359.146 ms`
  - optimized: `332.971 ms`
  - improvement: `~7.29%`
- combined undo+redo p95:
  - baseline: `448.306 ms`
  - optimized: `422.802 ms`
  - improvement: `~5.69%`

Undo/redo burst (2000 params):

- combined undo+redo median:
  - baseline: `460.861 ms`
  - optimized: `417.464 ms`
  - improvement: `~9.42%`
- combined undo+redo p95:
  - baseline: `555.660 ms`
  - optimized: `513.841 ms`
  - improvement: `~7.53%`

Normalization microbenchmark (1000 params):

- `_normalize_backend_after_history_navigation` median:
  - baseline: `28.755 ms`
  - optimized: `0.000 ms`
- `_normalize_backend_after_history_navigation` p95:
  - baseline: `30.319 ms`
  - optimized: `0.000 ms`

## Notes

- Route-level undo/redo latency remains dominated by broadcast/patch work, so
  end-to-end gains are smaller than microbenchmark gains.
- The optimization removes repeated normalization scans for already-visited
  history entries, which directly addresses held-key undo/redo bursts.
