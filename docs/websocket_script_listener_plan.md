# WebSocket Script Listener Refactor Plan

## Overview

We will modernize the Python script listener mode so user-authored scripts can subscribe to frontend state changes via websockets, leverage the generated `S` helper, and manage callback invocation frequency locally.

### Progress Snapshot

- `WMHPythonScriptReceiver` now streams the initial `projectData` snapshot during `on_connect`, and `SettaListener` hydrates without emitting `scriptReady` before registering dependencies.
- Dependency lists broadcast via websocket now travel through the typed `WebsocketMsgAllDependencies`, ready for the frontend handler to be revived.
- Scripts can explicitly resync via the new `requestFullState` verb; `SettaListener.force_full_state` wraps the send and tests assert the server snapshot response.

## Protocol & Data Flow

- Audit the current websocket lifecycle across `backend/setta/api/listener.py`, `backend/setta/websockets/msg_handlers/python_script_receiver.py`, and `frontend/src/state/actions/websocketReceive.ts` to document existing handshakes, message payloads, and state-diff broadcasts.
- Introduce or clarify message types covering script readiness, dependency registration, targeted diffs, full-state payloads, and force-refresh responses; update the shared enums/constants once the shapes are finalized.
- Current code path recap:
- `SettaListener.start` now waits for the first `projectData` payload to populate `_setta_data` before responding with `scriptDependencies` (`backend/setta/api/listener.py`).
- Incremental updates arrive via `WS_CALL_INTERACTIVE_FNS`; the listener throttles/debounces callbacks but still needs logic to seed `_setta_data` and update dependency maps (`backend/setta/api/listener.py`).
- `WMHPythonScriptReceiver` pushes the bootstrap snapshot from `on_connect`, stores dependency registrations, and now handles `requestFullState` resyncs (`backend/setta/websockets/msg_handlers/python_script_receiver.py`).
- Treat existing constants/enums (`WS_PROJECT_DATA`, `WS_CALL_INTERACTIVE_FNS`, etc.) as historical; we can redefine the taxonomy as we align backend/frontend/script message shapes.

## Backend Updates

- Implement the TODOs in `WMHPythonScriptReceiver` so incoming script messages register dependencies, trigger forced full-state recomputations (✅), and route outbound diffs only to interested websocket IDs via `ScriptMetadata`.
- Extend `ScriptMetadata` to persist dependency filters per websocket, prune stale entries on disconnect, and expose helpers to resolve listeners by dependency key efficiently.
- Ensure the project-state serializer can emit both incremental updates and a generated `S` tree so external scripts receive the same rich objects as compiled code.

## Script Runtime

- Refactor `SettaListener` to:
  - Discover decorated interactive functions, maintain local debounce/throttle scheduling, and execute callbacks without involving the backend for rate limiting.
  - Track dependency keys, reconcile incoming diffs/full snapshots, and update both scalar data and the cached `S` instance before invoking user callbacks.
  - Provide imperative utilities such as `force_full_state()` (✅) and dependency re-registration so scripts can resync on demand.
- Fill in the TODO blocks responsible for maintaining per-function state (`update_stored_data`, dependency mapping) while keeping asyncio task management robust.

## Frontend & Tooling

- Update websocket handling on the frontend to surface script connection/dependency metadata if the UI needs it, otherwise ensure the new message types are ignored safely.
- Add documentation snippets or a CLI helper demonstrating how to launch listener scripts alongside the compiled-output workflow.

## Validation

- Add backend regression tests simulating script connections, dependency-filtered updates, forced full-state pushes, and S-class reconciliation.
- Supply an example listener script in docs/tests showcasing debounce/throttle behavior living entirely client-side.
- Update README or developer docs to walk through the new listener mode, decorator options, and integration with generated code.
- ✅ Added unit coverage for `requestFullState` ensuring websocket responses include the targeted project config metadata.

### Current Handshake Snapshot

- Python scripts connect to `/api/pythonScript/{module_path}` and immediately receive `{"messageType": "projectData", "content": {"projectConfigId": <default>, "projectState": …}}` from `WMHPythonScriptReceiver.on_connect`.
- After hydrating local state, the listener responds with `scriptDependencies`, allowing the backend to rebroadcast the merged set to frontend clients.
- Incremental updates are expected to use `{"messageType": "WS_CALL_INTERACTIVE_FNS", "content": [key, value]}` with `key` representing the S-tree path, yet no existing server code emits that message and `SettaListener.update_stored_data` still needs the logic to merge the diff.
- Frontend receivers broadcast `AllDependencies` to UI clients on connect, but `frontend/src/state/actions/websocketReceive.ts` currently comments out the handler so dependency metadata never surfaces.

### File Trace Notes

- `backend/setta/api/listener.py:101-206` gathers decorated functions before dialing `Route.WEBSOCKET_PYTHON_SCRIPT`, hydrates on the first `WS_PROJECT_DATA` frame, rebuilds `dependencies_to_fns`, echoes back a `scriptDependencies` list, and kicks off `_run_functions_on_init`; follow-on diffs are funneled through `_run_functions_with_new_data`, but `update_stored_data` is still a stub so cache hydration never happens.
- `backend/setta/websockets/msg_handlers/python_script_receiver.py:23-96` now streams either the default config snapshot or the full backend state via `WS_PROJECT_DATA` from `on_connect`, and on `scriptDependencies` wipes/re-adds entries in `ScriptMetadata` before broadcasting `WebsocketMsgAllDependencies` to every frontend websocket.
- `backend/setta/websockets/script_metadata.py:1-37` normalizes dependency keys to tuples, tracks wildcard listeners under `None`, and exposes `dependencies` for the frontend broadcast while `get_websocket_ids_listening_to_data` merges wildcard and keyed subscribers.
- `frontend/src/state/actions/websocketReceive.ts:101-134` still logs every payload but leaves the `AllDependencies` handler commented out, so dependency broadcasts never update the UI.

### Handshake Rework Notes

- Server now pushes a bootstrap snapshot as soon as the websocket is accepted so scripts hydrate without first sending a no-op message.
- Keep scripts in control of future resyncs with an explicit verb such as `requestFullState`, optional parameters included when they need non-default project configs or filters.
- Reserve an `initialize`-style payload for scenarios where the script must supply configuration (e.g., selecting a project) so the backend can act before sending the first snapshot.

### Proposed Handshake Update

- Backend entry point: ✅ snapshot push now lives in `WMHPythonScriptReceiver.on_connect` via the reusable `_send_project_state_snapshot`.
- Message taxonomy: retire `C.WS_SCRIPT_READY`, introduce `C.WS_SCRIPT_REQUEST_FULL_STATE = "requestFullState"` (✅), and keep `C.WS_PROJECT_DATA` as the canonical bootstrap/delta envelope until the new taxonomy lands.
- Request flow: extend `WMHPythonScriptReceiver.process_json_str` with a `WS_SCRIPT_REQUEST_FULL_STATE` branch that invokes `_send_project_state_snapshot`, supporting an optional `projectConfigId` in `content` to override the default config when present (✅).
- Script runtime: removal of the `scriptReady` send is complete; a public `force_full_state(project_config_id: str | None = None)` now wraps the websocket send for `requestFullState`, letting user code opt into explicit resyncs without re-registering callbacks (✅).
