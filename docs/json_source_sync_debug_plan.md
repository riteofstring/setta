# JSON Source Sync Debug Plan

## Reproduction Recap
- Start from `/settings`, edit the target codeObj from `X` to `Y`, navigate through `/home` to create a new project config, enter it, return to `/home`, revisit `/settings`, and flip the same codeObj back to `X`.
- After a short delay, the UI reverts the value to `Y`, implying that a backend push or file watcher reload overwrites the local change.

## Working Hypotheses
- The JSON source file keeps `Y` on disk, and an async reload pushes that snapshot back through the websocket broadcast.
- `JSONSource.json_sources` may cache an out-of-date snapshot that is reused when watchers re-register (e.g., after creating a project config).
- `remove_json_source_values` might be clearing the edited value before the save finishes, leading the next reload to fall back to the stale payload.
- Creating a project config could trigger an implicit settings reload that publishes the stale state.

## Debug Strategy

1. **Establish Baseline**
   - Identify the JSON file backing the affected codeObj by inspecting the section’s `variant.name` and `jsonSourceKeys` in `frontend` devtools (via `useProjectStore`) or by logging `load_json_sources_into_data_structures` inputs.
   - Inspect the file in `setta_files/` before touching the UI to confirm the initial `X`/`Y` values and timestamps.

2. **Instrument Backend Saves**
   - Add temporary debug logs inside `save_json_source_data` (`backend/setta/project_state/jsonSource/save.py:21`) to print the target filename, key path, and the serialized value being written.
   - Log immediately after `remove_json_source_values` (`backend/setta/project_state/jsonSource/save.py:76`) to confirm the in-memory project state drops only scalar values.
   - Wrap `SettingsProjectManager.save` (`backend/setta/project_state/settings_project_manager.py:17`) with debug statements to track every save trigger and correlate them with UI actions.

3. **Trace JSON Source Reloads**
   - Instrument `JSONSource.watch_json_source_files` and its watcher callback (`backend/setta/project_state/jsonSource/jsonSource.py:40-123`) to log:
     - When watchers are re-registered (especially after creating a project config).
     - Which `ProcessedJSONInfo` snapshot is reused when `load_json_sources_into_data_structures` is called.
   - Inside `load_json_sources_into_data_structures` (`backend/setta/project_state/jsonSource/load.py:86`) log the incoming `processedJson` payload, the replacements computed, and any deletions scheduled for the section.

4. **Observe Frontend Traffic**
   - Run the app in dev mode and capture websocket traffic in the browser devtools; note which message (project state or notification) precedes the revert.
   - Optionally add a temporary `console.info` in `frontend/src/stores/projectStateStore.ts` (or the derived selector used on `/settings`) to print every backend-driven state update for that codeObj, confirming whether the revert comes from the backend or local state logic.

5. **Isolation Experiments**
   - Repeat the edit without creating a project config to confirm the revert requires that intermediate action.
   - Create a project config without touching the parameter to see if any settings reload occurs (logs from step 2/3 should surface this).
   - Toggle autosave/manual save paths (if available) to see whether explicit saves behave differently.

6. **Synthesize Findings**
   - Correlate filesystem writes, watcher reloads, and websocket broadcasts using timestamps from the logs.
   - If the disk never receives `X`, focus on the save path; if the disk has `X` but the revert still occurs, inspect cached `json_sources` state or merge logic.
   - Document whether the bug lives in backend persistence, watcher cache invalidation, or frontend consumption to guide the fix.

## Progress
- Added DEBUG-level instrumentation in `jsonSource.save`, `jsonSource.load`, and `SettingsProjectManager.save` that reports section names, leaf counts, and merge summaries without dumping raw payloads.
- Introduced environment filters so `SETTA_DEBUG_MODULE_FILTER` scopes logs to jsonSource/settings managers, `SETTA_DEBUG_SECTION_FILTER` narrows output to a specific section (e.g., `gui`), and `SETTA_SUPPRESS_PRINTS` mutes residual `print` calls.
- Expanded the debug module filter to include `jsonSource.jsonSource` and added cache snapshot logging; after switching the probe to inspect the effective impl we now see the cache reporting `gridPattern='dots'` on the initial read and `gridPattern='lines'` after the save, matching the file contents and proving the cache is not reverting.
- Added `SETTA_LOGGER_LEVEL_OVERRIDES` handling plus `UVICORN_LOG_LEVEL` wiring so uvicorn/httpx/MCP/websocket noise no longer pollutes debug sessions; `frontend/backendStart.sh` now exports the override list by default.
- Enabled Tailwind’s nesting plugin in PostCSS to silence the recurring frontend warning that spammed each log capture.
- Hardened the language-server startup path so watcher callbacks no longer crash when `self.server` is accessed before subprocess startup completes; requests now skip gracefully until the process is ready.
- Instrumented `helpers_lvl2.set_param_entered_value` to log UUID-resolved section/param names and captured a run showing the value flips to `"dots"` before the watcher reload; the subsequent autosave still writes `"lines"`, so the remaining regression likely sits in how the reload/merge output is applied to the project state or consumed on the frontend rather than in the cache itself.

### Findings (2025-10-16)
- Changing `gridPattern` from `"dots"` to `"lines"` updates the in-memory state immediately (`helpers_lvl2` log), then the debounced autosave fires ~2s later to write `"lines"` to disk; the watcher reload reports `gridPattern='lines'`, proving the cache mirrors disk at this point.
- Flipping the value back to `"dots"` updates only the in-memory state. Before the autosave fires again, `watch_json_source_files` re-registers the settings variants and calls `load_json_sources_fn`, which reads from the existing cache snapshot.
- The cache still contains `"lines"` because no save has occurred yet, so the reload merges `"lines"` back into the project state, wiping out the unsaved `"dots"` change. The subsequent autosave runs against this reverted state and persists `"lines"` again, which surfaces as the UI “undoing” the user edit.
- Root cause: the reload path races the debounced autosave, reapplying cached disk data over pending UI edits. Next steps should focus on deferring/bypassing that reload until the new value is persisted or applying the in-memory hierarchy during that window.
- Added instrumentation in `BaseProjectManager.watch_json_source_files`; during the second edit the watcher is invoked from `update_and_broadcast_project_state` after `set_param_entered_value`. At that moment `json_source_to_section_variant` has been reset to `{}`, so the diff treats all 30 settings variants as new and immediately schedules a reload with the cached `"lines"` snapshot. The reset appears to coincide with loading a fresh `ProjectStateCore` during the update cycle.

## Notes
- Keep the temporary logging guarded by a verbose flag or `if logger.isEnabledFor(logging.DEBUG)` so production behavior is unaffected.
- Once the root cause is understood, remove instrumentation and consider adding a regression test under `tests/project_state/jsonSource/` to capture the discovered edge case.
- `ProjectStateCore.sections`, `codeObjs`, and their variants are keyed by UUIDs; names live on each `Core.name`, so instrumentation must resolve section/code object IDs before logging human-friendly labels (`backend/setta/types/project_state.py`, `backend/setta/types/core.py`).
- Frontend mutations hit `BaseProjectManager.set_param_entered_value`, which delegates to `helpers_lvl2.set_param_entered_value`; that helper locates the current code object via UUID (`helpers_lvl1.get_curr_code_obj_variant`) before calling `set_effective_impl_value`, so logs should hook there to capture the authoritative value right after the update.
- `save_json_source_data` builds the disk payload from `traverse_hierarchy(...).nested_dict` with `impl.jsonSourceKeys` as the prefix, so any logging of outbound values should inspect that nested structure rather than attempting `sections["gui"]`.
