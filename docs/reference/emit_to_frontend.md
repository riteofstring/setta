# emit_to_frontend flow

## Purpose
`emit_to_frontend` lets listener callbacks push dependency values or artifact updates
back through the backend so the UI receives the same canonical broadcasts as any
other project-state mutation. It is available as `SettaListener.emit_to_frontend`
and as `ctx.emit_to_frontend` inside callbacks.

## Preconditions + payload shape
- The listener must be bootstrapped (`_runtime_state` is set) and registered (or
  registration is pending).
- At least one of `dependency_values` or `artifact_updates` is required.
- `dependency_values` uses sanitized dependency names (the same strings used in
  `@listener.listen` and the generated `state` attributes).
- `artifact_updates` entries must validate against `BaseArtifactTypeAdapter` (type/id/value).

## Step-by-step pipeline
1. **Listener helper (`backend/setta/api/listener.py`)**
   - `SettaListener.emit_to_frontend` checks runtime state + registration and
     rejects empty payloads.
   - Dependency mappings are copied as plain dicts; artifact payloads are
     validated with `BaseArtifactTypeAdapter`.
   - Sends `WebsocketMsgListenerFrontendEmit` with `ListenerFrontendEmitRawContent`.

2. **WebSocket receiver (`backend/setta/websockets/msg_handlers/python_script_receiver.py`)**
   - Confirms the websocket is registered for the project and rejects empty
     payloads.
   - Loads the project manager + dependency graph
     (`manager.gen_code[project_config_id].dep_graph`); missing graphs return a
     `project_state_unavailable` error.
   - Resolves dependencies and artifacts; errors are returned as
     `WebsocketMsgListenerError` with specific codes.

3. **Dependency + artifact resolution (`backend/setta/listeners/listener_frontend_emit_resolver.py`)**
   - Maps sanitized names to dependency keys via
     `DependencyGraph.full_path_name_to_dep_key`.
   - Infers expected value type from the node value or section type:
     - Literal: section params, callable sections, TextBlock sections.
     - Binary: Draw + Image sections.
     - FileRead: dependencies whose current value type is FileRead.
   - Normalizes artifact paths and enforces cached type consistency.

4. **Backend application (`backend/setta/project_state/base_project_manager.py`)**
   - `apply_listener_emit_updates` runs through the serialized queue
     (`@enqueue_method`).
   - Dependency updates call `apply_listener_dependency_updates`:
     - Supported: `SectionParamDependencyKey` (literal) and
       `SectionDependencyKey` for TextBlock sections.
     - Other dependency types raise `ListenerDependencyUpdateError`; Image
       sections currently raise `NotImplementedError`.
   - Artifact updates call `apply_listener_artifact_updates`, which normalizes
     ids and caches artifacts in memory.

5. **Broadcasts**
   - Dependency updates trigger `update_and_broadcast_project_state` (full
     update + LSP sync).
   - Artifact updates trigger `broadcast_artifacts_update`.
   - Artifact-only emits do not rebuild or broadcast project state.

## Error codes returned to listeners
- `listener_not_registered`
- `project_config_mismatch`
- `listener_emit_invalid_payload`
- `project_state_unavailable`
- `listener_emit_unknown_dependency`
- `listener_emit_invalid_value`
- `listener_emit_unsupported_dependency`
- `listener_emit_invalid_artifact_update`
- `listener_emit_unsupported_artifact_update`
- `listener_emit_failed`
- `listener_emit_artifact_update_failed`

## Practical implications
- Use the sanitized dependency strings from `@listener.listen`; unresolved names
  fail fast.
- Dependency updates are intentionally narrow today (params + TextBlock only).
- Use artifact updates for Draw/Image payloads instead of dependency updates.
- Artifact updates stay in memory until a save writes them to disk.
- Tests covering this path live in `tests/websockets/test_python_script_receiver.py`,
  `tests/project_state/test_listener_emit_updates.py`, and
  `tests/project_state/test_listener_artifact_updates.py`.
