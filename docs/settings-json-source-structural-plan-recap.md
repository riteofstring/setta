## Context Recap

- Earlier investigations tied the reversion to stale setta-settings.json writes and confirmed both the REST call and websocket replay pulled the old "lines" value from disk (docs/settings-investigation-1.md:10-
  17).
- Autosave mitigation forced an immediate save/reload on every edit, which stabilized the final value but left a visible flicker when returning to /settings (docs/settings-investigation-2.md:3-6).
- Instrumentation later showed the flicker came from watcher-driven reloads replaying the cached disk snapshot; introducing \_refresh_and_load_json_sources to reread from disk before broadcasting stopped that
  flash (docs/settings-investigation-3.md:3-13).
- The structural plan aims to promote the in-memory JSON cache to the source of truth, defer disk flushes to autosave, and have SettingsFile.load_settings serve dirty data from the cache instead of rereading
  JSON immediately (docs/settings-json-source-structural-plan.md:6-27).

## Latest Logs

- After switching from the settings page to a real project, the main ProjectManager purges setta-settings.json from the shared cache (sync_json_source_cache removing stale file…, docs/
  backend_logs_with_structural_fix.txt:62).
- Navigating back to /settings leaves the frontend without a populated value (gridPattern globalValue: empty in ParamInput.tsx, docs/frontend_logs_with_structural_fix.txt:72-75) until a new optimistic update
  lands.
- When the user selects "dots", the backend routes the change through SettingsProjectManager and applies it in memory (docs/backend_logs_with_structural_fix.txt:66-72; docs/
  frontend_logs_with_structural_fix.txt:77-92).
- Immediately afterward, SettingsFile.load_and_broadcast_settings still reports BackgroundVariant.lines, and \_refresh_and_load_json_sources reloads "lines" into the cache without marking the file dirty (docs/
  backend_logs_with_structural_fix.txt:74-96), which drives the websocket reversion (UpdateSettings {gridPattern: 'lines'}, docs/frontend_logs_with_structural_fix.txt:95-110).

## Hypotheses

- Cache invalidation: allowing the regular ProjectManager to drop setta-settings.json means the settings manager rehydrates from disk for the next visit, so any unsaved changes vanish before the cache is rebuilt
  (docs/backend_logs_with_structural_fix.txt:62).
- Dirty tracking: JSONSource.set_cached_json and sync_json_source_cache never flip mark_dirty to true for the "dots" update (docs/backend_logs_with_structural_fix.txt:69-72), so autosave never flushes, and the
  subsequent reload goes back to disk.
- Consumer bypass: SettingsFile.load_and_broadcast_settings still seems to fetch from disk instead of pulling dirty data from the cache, counter to the structural plan (docs/
  backend_logs_with_structural_fix.txt:74).

## Next Steps

- Audit the shared JSON cache lifecycle so the main project manager cannot evict setta-settings.json, or segregate caches per manager to keep settings data resident between navigations.
- Fix the dirty-flag logic in sync_from_backend/sync_json_source_cache so edits actually mark the file dirty and autosave writes "dots" before any watcher-triggered reload.
- Update SettingsFile.load_settings (and related callers) to consult the cache when a file is dirty, ensuring broadcasts mirror the in-memory state even before autosave fires.
