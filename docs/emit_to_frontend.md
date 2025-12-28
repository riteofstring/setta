# emit_to_frontend flow

## Purpose
`emit_to_frontend` lets Python listener callbacks push deterministic project-state and artifact overrides back through the Setta backend so the canonical broadcasts that drive the UI include listener-driven data. The flow replaces the old "payload + target" passthrough with typed dependency updates and artifact unions.

## Step-by-step pipeline
1. **Listener helper (backend/setta/api/listener.py)**
   - `SettaListener.emit_to_frontend` validates that the listener has finished bootstrap + registration and that at least one of `dependency_values` or `artifact_updates` is non-empty.
   - Dependency mappings are copied as plain dicts; artifact payloads are validated with `BaseArtifactTypeAdapter` so only well-formed union entries are emitted.
   - The helper wraps everything in `ListenerFrontendEmitRawContent` (project id + payloads) and ships a `WebsocketMsgListenerFrontendEmit` over the existing WebSocket connection.

2. **WebSocket receiver (backend/setta/websockets/msg_handlers/python_script_receiver.py)**
   - `_handle_listener_frontend_emit` ensures the websocket is still registered for the target project config and rejects empty payloads.
   - The handler grabs the active `DependencyGraph` from the project manager so dependency names can be resolved, and obtains the artifact cache for artifact validation.

3. **Dependency + artifact resolution (backend/setta/listeners/listener_frontend_emit_resolver.py)**
   - `ListenerFrontendEmitResolver.resolve` maps each sanitized dependency string to its `BaseDependencyKeyUnion` using the graph’s `full_path_name_to_dep_key` lookup.
   - Expected value types come from the node metadata. The resolver currently coerces literal text/param values, Base64 section payloads, and file-read strings; unsupported dependencies throw loud errors so caller scripts immediately see failures.
   - `resolve_artifact_updates` normalizes artifact ids, ensures requested artifact types match anything already cached at that path, and returns typed unions ready for application.

4. **Backend application (backend/setta/project_state/base_project_manager.py & helpers)**
   - `BaseProjectManager.apply_listener_emit_updates` runs inside the manager’s serialized queue via `@enqueue_method`, so listener updates cannot race with other mutations.
   - Dependency updates are applied directly to the authoritative `ProjectStateSingleConfig` via `apply_listener_dependency_updates`. As of today, section params and TextBlock sections are supported; targeting other section types raises `ListenerDependencyUpdateError`, keeping invariants explicit.
   - Artifact updates go through `apply_listener_artifact_updates`, which normalizes ids, writes them into the in-memory artifact cache, and returns the payloads that should be broadcast.

5. **Broadcasts and feedback**
   - After dependency updates, `update_and_broadcast_project_state` reuses the normal websocket fan-out so the frontend receives the same snapshot shape it expects everywhere else.
   - If artifacts were touched, `broadcast_artifacts_update` sends the usual `update` message with the resolved artifact unions.
   - Any resolver/project-manager failure is turned into `WebsocketMsgListenerError` responses with specific error codes (unknown dependency, invalid value, unsupported artifact, etc.), so listener scripts can log or retry with corrected data.

## Practical implications
- Listeners now specify dependencies using the same sanitized identifiers they used when declaring `@listener.listen` dependencies—no knowledge of project-state internals or dependency keys is required.
- Since the project manager mutates canonical state before broadcasting, future listeners or UI refreshes see the emitted changes without needing a dedicated "listener forward" channel.
- Artifact updates are fully typed (`{type, id, value}`); listeners can seed brand-new artifacts as long as they comply with the union schema, and the backend normalizes paths so cached artifacts remain consistent.
- The unit tests under `tests/websockets/test_python_script_receiver.py` and `tests/project_state/test_listener_artifact_updates.py` exercise resolver validation, state mutation, and error paths, ensuring regressions are caught before release.
