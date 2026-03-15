# Meta Control + Listener Flows (Current)

This page describes how meta control UI changes, realtime listener traffic, and
listener-driven updates move through the system, plus when disk writes happen.

## Flow A: Meta control realtime -> listeners
```
UI change
  -> if meta control is an action control (button or stateless dropzone):
       send RealtimeDependencyEvent (SectionDependencyKey + JSON payload)
     else:
       update local pending value on the control param
       send RealtimeUIChange for SectionDependencyKey
         (only if listener coverage matches; PasswordParam controls skip realtime
         emits to avoid broadcasting secrets)
  -> /ws/frontend -> internal/wsapi/routes.go
      -> internal/realtime listener broadcaster + sequencer fan-out
           - realtime deltas -> sockets with matching dependencies or realtime wildcard
           - action events -> sockets with matching dependencies or realtime wildcard (deps=[])
  -> SettaListener applies deltas/action events, schedules callbacks (debounce/throttle)
```

Key paths:
- Meta control UI + realtime emit: `frontend/src/components/Section/Layouts/MetaControlArea.tsx`,
  `frontend/src/state/actions/websocketReceive.ts`
- Listener coverage gating: `frontend/src/state/actions/listenerCoverage.ts`,
  `internal/httpapi/listener_routes.go`, `internal/realtime/listener_coverage.go`
- Listener registration changes also push `ListenerCoverageSnapshot` over
  `/ws/frontend`, so coverage-dependent realtime sends can update without an
  explicit refetch after listener register/disconnect.
- Frontend websocket receiver: `internal/wsapi/routes.go`
- Realtime sequencing + fan-out: `internal/realtime/sequencer.go`,
  `internal/realtime/listener_broadcaster.go`,
  `internal/realtime/listener_registry.go`
- Listener realtime/action handling: `backend/setta/api/listener.py`

Payload note:
- Stateless dropzone events include `{ sectionId, paramInfoId, attachments }` where
  file attachments carry binary metadata (`contentId`, `byteLength`, `mimeType`),
  and the bytes arrive in a separate binary websocket frame.

## Flow B: Chat send/stop -> listeners
```
Chat input send/stop
  -> if scriptable mode:
       update local chat state + route_set_chat_section_state
  -> send RealtimeDependencyEvent (SectionDependencyKey + chat action payload)
  -> /ws/frontend -> internal/wsapi/routes.go
      -> internal/realtime listener broadcaster + sequencer fan-out
           - action events -> sockets with matching dependencies or realtime wildcard (deps=[])
  -> SettaListener batches events into ctx.events, schedules callbacks (debounce/throttle)
```

Key paths:
- Chat UI + realtime emit: `frontend/src/components/Section/Layouts/ChatArea.tsx`,
  `frontend/src/state/actions/websocketReceive.ts`
- Frontend websocket receiver + listener fan-out: `internal/wsapi/routes.go`,
  `internal/realtime/listener_broadcaster.go`
- Listener action handling: `backend/setta/api/listener.py`
- Listener helpers: `backend/setta/api/chat_toolkit.py`

Note:
- Listener chat history accepts an internal `engineConfigId`, or `None` for scriptable-only chats (no LLM).
- Chat send payloads include `attachments` (artifact metadata) for any files attached to the message.

## Flow C: Meta control persistence -> project state
```
UI change
  -> debounced route_set_param_entered_value (50ms, stateful controls only)
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
- Backend route + handler: `internal/httpapi/project_routes.go`,
  `internal/projectstate/code_object_writes.go`,
  `internal/projectstate/runtime.go`

Note:
- PasswordParam persistence stores the secret in the runtime secret store and
  keeps the project state value empty (`hasSecret` tracks presence).

## Flow D: Listener callback -> emit_to_frontend -> project state + artifacts
```
Listener callback
  -> emit_to_frontend()
      -> internal/wsapi/listener_frontend_emit.go resolves deps/artifacts
          -> applies Go project-state or artifact-service mutations
      -> if dependency updates:
           broadcast authoritative Go project state
      -> if artifact updates:
           broadcast UpdateArtifacts over /ws/frontend
```

Key paths:
- Listener emit helper: `backend/setta/api/listener.py`
- WebSocket handler + resolver: `internal/wsapi/routes.go`,
  `internal/wsapi/listener_frontend_emit.go`
- Apply updates: `internal/projectstate/runtime.go`,
  `internal/artifacts/service.go`,
  `internal/shareartifacts/service.go`
- Broadcasts: `internal/wsapi/listener_frontend_emit.go`,
  `internal/realtime/websocket_hub.go`

Notes:
- Realtime dependency deltas are gated by listener coverage snapshots; action events are not.
- Action events share the same sequence counter as dependency deltas.
- Dependency updates from emit_to_frontend are currently limited to section
  params plus `TextBlock`, `Chat`, and `Plugin` sections.

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
