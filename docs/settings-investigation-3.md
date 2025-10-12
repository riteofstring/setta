# Settings Flicker Findings

- Prior mitigations still ensure the final settings value is correct: edits route through `SettingsProjectManager`, the change is saved immediately, and the websocket rebroadcast eventually aligns the UI with disk.
- Backend instrumentation confirms every `/settings` param edit continues to hit the settings manager—even after navigating away and back—so the earlier “wrong manager” theory is ruled out (`docs/backend_logs.txt:1`, `docs/backend_logs.txt:20`).
- When switching from lines back to dots, the server saves and rebroadcasts the new value (`docs/backend_logs.txt:22-24`), and the frontend receives the matching op-completed update (`docs/frontend_logs.txt:98-102`).
- Seconds later the backend emits an `update_and_broadcast_project_state` carrying the stale `"lines"` value with empty pending/completed op lists (`docs/backend_logs.txt:25`), which matches the transient `UpdateFrontendProjectState` that flips the UI back to lines (`docs/frontend_logs.txt:104-107`); a subsequent settings broadcast restores `dots` (`docs/frontend_logs.txt:115-123`).
- That orphaned stale broadcast is the likely source of the flicker. Next step is to instrument all callers of `BaseProjectManager.update_and_broadcast_project_state` to capture stacks/metadata when both op lists are empty so we can identify which code path emits the stale payload.
