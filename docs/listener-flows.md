# Meta Control + Listener Flows (Current)

This describes the current control flow for meta control changes, listener updates,
and when disk writes happen. It also lists debounce/throttle timing.

## Flow A: Meta Control -> Project State -> LSP
```
UI change
  -> send realtime delta (immediate)
  -> debounced /setMetaControlValue (50ms)
      -> project manager update()
          -> rebuild dependency graph + codegen
          -> sync LSP text
          -> write canonical file only if missing
      -> broadcast project state
```

Key paths:
- Frontend meta control handler: `frontend/src/components/Section/Layouts/MetaControlArea.tsx`
- Realtime delta: `frontend/src/state/actions/websocketReceive.ts`
- Persisted value route: `backend/setta/routers/project_manager.py`
- Update + LSP sync: `backend/setta/project_state/base_project_manager.py`
- Disk writes and LSP hooks: `backend/setta/project_state/code.py`

## Flow B: Listener -> emit_to_frontend -> Project State (All Dependencies)
```
UI change
  -> send realtime delta (immediate)
      -> listener websocket realtime event
          -> listener callback (optional debounce/throttle)
              -> emit_to_frontend
                  -> apply listener updates
                      -> project manager update()
                          -> rebuild dependency graph + codegen
                          -> sync LSP text
                          -> write canonical file only if missing
                  -> broadcast project state
```

Key paths:
- Realtime event hub: `backend/setta/websockets/realtime_event_hub.py`
- Listener callbacks: `backend/setta/api/listener.py`
- Emit resolver + apply: `backend/setta/websockets/msg_handlers/python_script_receiver.py`,
  `backend/setta/project_state/listener_dependency_updates.py`
- Update + LSP sync: `backend/setta/project_state/base_project_manager.py`

Notes:
- This flow applies to any listener dependency exported in the dependency graph
  (params, TextBlock, MetaControl, etc.), not just meta controls.

## Disk Writes
- Canonical files are created on first use if missing during `update()`.
- Full disk flush happens on save (manual + autosave) and on run.

## Debounce / Throttle
- Meta control persistence: 50ms debounce
  - `frontend/src/components/Section/Layouts/MetaControlArea.tsx`
- Listener callbacks: optional, configured via `@listener.listen(debounce_ms=..., throttle_ms=...)`
  - `backend/setta/api/listener.py`, `backend/setta/api/scheduling.py`
- Autosave: 2000ms debounce
  - `backend/setta/project_state/base_project_manager.py`
