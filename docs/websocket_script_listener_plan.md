# WebSocket Script Listener Refactor Plan

## Overview

We will modernize the Python script listener mode so user-authored scripts can subscribe to frontend state changes via websockets, leverage the generated `S` helper, and manage callback invocation frequency locally.

## Protocol & Data Flow

- Audit the current websocket lifecycle across `backend/setta/api/listener.py`, `backend/setta/websockets/msg_handlers/python_script_receiver.py`, and `frontend/src/state/actions/websocketReceive.ts` to document existing handshakes, message payloads, and state-diff broadcasts.
- Introduce or clarify message types covering script readiness, dependency registration, targeted diffs, full-state payloads, and force-refresh responses; update the shared enums/constants once the shapes are finalized.
- Current code path recap:
  - `SettaListener.start` immediately emits `scriptReady` with the script’s module path, then waits for a `projectData` payload that is currently unimplemented before responding with `scriptDependencies` (`backend/setta/api/listener.py`).
  - Incremental updates arrive via `WS_CALL_INTERACTIVE_FNS`; the listener throttles/debounces callbacks but still needs logic to seed `_setta_data` and update dependency maps (`backend/setta/api/listener.py`).
  - `WMHPythonScriptReceiver.process_json_str` is a TODO, so the server never reacts to `scriptReady` or dependency messages, and only disconnect cleanup currently works (`backend/setta/websockets/msg_handlers/python_script_receiver.py`).
  - Treat existing constants/enums (`WS_PROJECT_DATA`, `WS_CALL_INTERACTIVE_FNS`, etc.) as historical; we can redefine the taxonomy if newer flows require different shapes.

## Backend Updates

- Implement the TODOs in `WMHPythonScriptReceiver` so incoming script messages register dependencies, trigger forced full-state recomputations, and route outbound diffs only to interested websocket IDs via `ScriptMetadata`.
- Extend `ScriptMetadata` to persist dependency filters per websocket, prune stale entries on disconnect, and expose helpers to resolve listeners by dependency key efficiently.
- Ensure the project-state serializer can emit both incremental updates and a generated `S` tree so external scripts receive the same rich objects as compiled code.

## Script Runtime

- Refactor `SettaListener` to:
  - Discover decorated interactive functions, maintain local debounce/throttle scheduling, and execute callbacks without involving the backend for rate limiting.
  - Track dependency keys, reconcile incoming diffs/full snapshots, and update both scalar data and the cached `S` instance before invoking user callbacks.
  - Provide imperative utilities such as `force_full_state()` and dependency re-registration so scripts can resync on demand.
- Fill in the TODO blocks responsible for maintaining per-function state (`update_stored_data`, dependency mapping) while keeping asyncio task management robust.

## Frontend & Tooling

- Update websocket handling on the frontend to surface script connection/dependency metadata if the UI needs it, otherwise ensure the new message types are ignored safely.
- Add documentation snippets or a CLI helper demonstrating how to launch listener scripts alongside the compiled-output workflow.

## Validation

- Add backend regression tests simulating script connections, dependency-filtered updates, forced full-state pushes, and S-class reconciliation.
- Supply an example listener script in docs/tests showcasing debounce/throttle behavior living entirely client-side.
- Update README or developer docs to walk through the new listener mode, decorator options, and integration with generated code.
