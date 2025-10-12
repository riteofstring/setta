# Settings Autosave Investigation

- **Bug report**: After changing a setting (e.g., `gui.gridPattern`) and navigating away, returning to `/settings` showed the previous value. UI briefly displayed the new selection before reverting.
- **Root cause**: Backend project state for settings was not persisted immediately when the `UpdateSettings` websocket broadcast fired. This allowed stale disk state to be reloaded and sent back to the frontend, overwriting recent changes.
- **Current mitigation**: `SettingsProjectManager.update_and_broadcast_project_state` now saves the settings project and rebroadcasts the freshly reloaded settings after each frontend-driven change. This removes the multi-navigation repro where the value permanently reverted.
- **Open issue**: The UI still flashes the old value momentarily when returning to `/settings` (likely due to pending websocket/project state updates). Needs further debugging to eliminate the brief revert before the correct value settles.
