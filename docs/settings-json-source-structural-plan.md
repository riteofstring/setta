# Settings JSON Source Structural Plan

## Findings
- Manual saves in `SettingsProjectManager.update_and_broadcast_project_state` were masking `loadSettings` reversion by forcing disk writes on every change, but this introduced heavy I/O during rapid edits.
- `_refresh_and_load_json_sources` stopped stale watcher broadcasts by rereading disk before each reload, yet it only worked because we still treated the filesystem as the source of truth between updates.
- Regular projects never showed the flicker because they rely on in-memory state until the debounced autosave fires; only settings short-circuited back to disk via `SettingsFile.load_settings`.

## Structural Fix
- Promote the JSON-source cache (`self.json_sources`) to the single source of truth for both project managers.
  - Each backend update refreshes the cache entry for the touched `sectionId`/`variantId` and flags the underlying file as dirty.
  - `load_json_sources_fn` always consumes the cache directly; no pre-emptive disk reads are required.
- Defer persistence to the existing debounced autosave path.
  - When the debouncer triggers `save_json_source_data`, flush only dirty cache entries to disk and clear their dirty flags afterwards.
- Change `SettingsFile.load_settings` (and similar consumers) to serve dirty files from the cache instead of immediately rereading JSON.
  - If a file is uncached or clean, fall back to `dbe.read_json` to cover restarts and external edits.
- Keep file-watcher hydration, but scope it to cache misses or external modifications so `_refresh_and_load_json_sources` becomes unnecessary.
  - Watcher events replace the cache entry from disk, then call `load_json_sources_fn` to rebroadcast, keeping both settings and regular projects in sync.

This approach restores parity with the main project flow, removes the per-change save override, avoids redundant disk churn, and guarantees that UI reads never regress to stale JSON while autosave is pending.
