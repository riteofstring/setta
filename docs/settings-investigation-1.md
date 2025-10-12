# Settings Sync Bug Findings

## Reproduction
- Launch the app and navigate to `/settings`.
- Change `gridPattern` from `dots` to `lines`; the UI shows the new value and the backend persists it.
- Navigate to any project config, make no edits, then return to `/settings`.
- Attempt to change `gridPattern` back to `dots`. The select briefly shows `dots` before reverting to `lines` once the next backend payload arrives.

## Observations
- The regression still occurs after memoizing `useLoadSettings`; the frontend now calls `/loadSettings` only once per session, so the reversion is not coming from an extra REST fetch.
- When `gridPattern` is toggled, the frontend issues `route_set_param_entered_value` with a `frontendOpId`, so the optimistic helper is in play. The reversion happens when the websocket pushes `UpdateSettings`, implying the backend believes the value is still `lines`.
- Inspecting `setta_files/setta-settings.json` shows the value stuck at `"lines"`, so the backend never committed the second change before broadcasting.
- The settings project uses JSON source-backed params. `SettingsProjectManager.update_and_broadcast_project_state` calls `load_json_sources_into_data_structures`, and JSON files are rewritten via `save_json_source_data`. The dataset for `gridPattern` lives in `setta-settings.json`; without a companion write, later reloads keep serving the outdated `"lines"` entry.

## Hypothesis
- Switching away from `/settings` hands control back to the normal project manager, so follow-up JSON-source writes for the settings project may be skipped. When you return and edit again, the backend rebuilds the single-config state from disk (`setta-settings.json`) which still holds `"lines"`, overwriting the optimistic change.
- Alternatively, the settings project manager might not be invoked at all for the second interaction: once the default config ID switches to the real project ID, the dispatcher may route `route_set_param_entered_value` to `ProjectManager` instead of `SettingsProjectManager`, so the change updates the in-memory state but never reaches the settings JSON store.

## Next Steps
1. Instrument `ProjectManagerSwitcher.get` to confirm which manager handles the `/settings` param updates after navigating to another project.
2. If calls are reaching the main manager, adjust the switcher (or route generation) so settings edits always target `SettingsProjectManager`.
3. If calls are hitting the settings manager, ensure `save_json_source_data` runs for those updates—e.g. compare the autosave path to see whether `settings_file.save_settings` should fire after `set_param_entered_value`.
