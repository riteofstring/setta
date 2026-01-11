# Meta Control + Listener Flows (Current)

This page describes how meta control UI changes, realtime listener traffic, and
listener-driven updates move through the system, plus when disk writes happen.

## Flow A: Meta control realtime -> listeners
```
UI change
  -> if meta control is an action control:
       send RealtimeDependencyEvent (eventType=action, SectionDependencyKey)
     else:
       update local pending value on the control param
       send RealtimeUIChange for SectionDependencyKey
         (only if listener coverage matches)
  -> WMHFrontendReceiver -> RealtimeEventHub (per-project sequence)
      -> WMHPythonScriptSender fan-out
           - realtime deltas -> sockets with matching dependencies or realtime wildcard
           - action events -> sockets with matching dependencies or action wildcard
  -> SettaListener applies deltas/action events, schedules callbacks (debounce/throttle)
```

Key paths:
- Meta control UI + realtime emit: `frontend/src/components/Section/Layouts/MetaControlArea.tsx`,
  `frontend/src/state/actions/websocketReceive.ts`
- Listener coverage gating: `frontend/src/state/actions/listenerCoverage.ts`,
  `backend/setta/websockets/listener_coverage.py`,
  `backend/setta/websockets/msg_handlers/python_script_receiver.py`
- Frontend websocket receiver: `backend/setta/websockets/msg_handlers/frontend_receiver.py`
- Realtime sequencing + fan-out: `backend/setta/websockets/realtime_event_hub.py`,
  `backend/setta/websockets/msg_handlers/python_script_sender.py`,
  `backend/setta/websockets/listener_registry.py`
- Listener realtime/action handling: `backend/setta/api/listener.py`

## Flow B: Meta control persistence -> project state
```
UI change
  -> debounced route_set_param_entered_value (50ms)
      -> project manager set_param_entered_value()
          -> add history entry (autosave debounce)
          -> update_and_broadcast_project_state()
              -> update(): validate, rebuild DependencyGraph, codegen
                 -> write canonical files only if missing
                 -> sync LSP text
              -> broadcast project state snapshot
```

Key paths:
- Frontend optimistic update + route: `frontend/src/components/Section/Layouts/MetaControlArea.tsx`,
  `frontend/src/state/actions/sectionInfos.ts`,
  `frontend/src/utils/generatedEndpoints.ts`
- Backend route + handler: `backend/setta/routers/project_manager.py`,
  `backend/setta/project_state/base_project_manager.py`,
  `backend/setta/types/helpers_lvl2.py`

## Flow C: Listener callback -> emit_to_frontend -> project state + artifacts
```
Listener callback
  -> emit_to_frontend()
      -> python_script_receiver resolves deps/artifacts
          -> apply_listener_dependency_updates / apply_listener_artifact_updates
      -> if dependency updates:
           update_and_broadcast_project_state()
      -> if artifact updates:
           broadcast_artifacts_update()
```

Key paths:
- Listener emit helper: `backend/setta/api/listener.py`
- WebSocket handler + resolver: `backend/setta/websockets/msg_handlers/python_script_receiver.py`,
  `backend/setta/listeners/listener_frontend_emit_resolver.py`
- Apply updates: `backend/setta/project_state/listener_dependency_updates.py`,
  `backend/setta/project_state/listener_artifact_updates.py`
- Broadcasts: `backend/setta/project_state/base_project_manager.py`,
  `backend/setta/websockets/msg_handlers/frontend_sender.py`

Notes:
- Realtime dependency deltas are gated by listener coverage snapshots; action events are not.
- Action events share the same sequence counter as dependency deltas.
- Dependency updates from emit_to_frontend are currently limited to section params and TextBlock sections.

## Disk Writes
- `update()` only writes canonical code files if they are missing; it always syncs LSP.
- Manual save + autosave flush all code files, JSON sources, and artifacts.
- `create_run_command` flushes current code files and writes a run snapshot into a timestamped folder.

## Debounce / Throttle
- Meta control persistence: 50ms debounce
  - `frontend/src/components/Section/Layouts/MetaControlArea.tsx`
- Listener callbacks: optional, configured via `@listener.listen(debounce_ms=..., throttle_ms=...)`
  - `backend/setta/api/listener.py`, `backend/setta/api/scheduling.py`
- Autosave: 2000ms debounce
  - `backend/setta/project_state/base_project_manager.py`
