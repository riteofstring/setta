# Setta Listener Force Refresh Transition Plan

## Overview
- Remove `send_persisted_update` so Python listeners only hydrate through force refresh payloads.
- Ensure frontend-triggered refreshes grab the authoritative snapshot from the active project manager and relay it through the websocket sender.

## Proposed Changes
- Replace the bootstrap-time call to `send_persisted_update` with a targeted `send_force_refresh` that delivers the initial snapshot only to the connecting socket. (file: `backend/setta/websockets/msg_handlers/python_script_receiver.py`)
- Expand `send_force_refresh` so it can scope delivery to listeners registered for a specific project instead of broadcasting blindly. (file: `backend/setta/websockets/msg_handlers/python_script_sender.py`)
- Introduce an explicit Setta API route that handles frontend force refresh requests by fetching the latest project state from `ProjectManagerSwitcher` and invoking the updated `send_force_refresh`. (files: `backend/setta/routers/project_manager.py`, `frontend/src/...`)
- Stop auto-sending persisted snapshots after every backend mutation by removing the `send_persisted_update` branch from `_broadcast_project_state_snapshot`. (file: `backend/setta/project_state/base_project_manager.py`)
- Simplify `SettaListener` so `_dispatch_websocket_message` hydrates snapshots via `_refresh_from_snapshot` and relies solely on force refresh payloads for full-state rebuilds, updating tests that exercise bootstrap and refresh paths. (files: `backend/setta/api/listener.py`, `tests/setta/api/test_listener_realtime.py`, `tests/websockets/test_python_script_receiver.py`)

## Risks & Considerations
- Frontend flows that rely on implicit persisted snapshots must explicitly request a force refresh or they will observe stale state.
- Broadcasting force refresh snapshots without project scoping will overwrite listeners pointed at other projects; ensure the sender filters recipients before removing persisted updates.
- Removing message types from the listener client is a breaking change for the published Python package; plan for a version bump and communicate the migration.

## Next Steps
1. Prototype the targeted force refresh sender + bootstrap handshake and update websocket tests.
2. Add the frontend/backend route for on-demand refreshes, wiring the UI trigger to call it.
3. Delete `send_persisted_update`, adjust listener client logic, and refresh documentation once tests are green.
