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
   - Sends `ListenerFrontendEmit` over the Go listener websocket route.

2. **Go listener websocket transport (`internal/wsapi/routes.go`, `internal/wsapi/listener_frontend_emit.go`)**
   - Confirms the listener websocket is registered for the project, enforces
     project/share-session matches, and rejects empty payloads.
   - In deployment/share mode, enforces the current deployment policy before any
     mutation runs.

3. **Dependency + artifact resolution (`internal/wsapi/listener_frontend_emit.go`)**
   - Rebuilds the listener dependency export from the current Go project
     snapshot and maps sanitized dependency names back through
     `codegen.BuildPythonDependencyGraph`.
   - Accepts writable dependency updates for section params plus `TextBlock`,
     `Chat`, and `Plugin` sections; unsupported targets fail fast with typed
     listener errors.
   - Validates artifact updates through the Go artifact services
     (`Artifacts.ValidateListenerUpdate` / `ShareArtifacts.ValidateListenerUpdate`),
     which normalize ids and enforce type/path policy.

4. **Backend application (`internal/wsapi/listener_frontend_emit.go`, `internal/projectstate/runtime.go`)**
   - Dependency updates mutate the Go project document through
     `projectstate.Runtime.MutateAndSave`.
   - Artifact updates go through the Go artifact services and share overlays.
   - Artifact-only emits skip project-state mutation and just apply the
     validated artifact writes.

5. **Broadcasts**
   - Dependency updates broadcast the authoritative Go project-state snapshot.
   - Artifact updates broadcast `UpdateArtifacts` over the Go frontend websocket
     hub.
   - Artifact-only emits do not rebuild project state.

## Error codes returned to listeners
- `listener_not_registered`
- `project_config_mismatch`
- `share_session_missing`
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
- Dependency updates are intentionally narrow today (section params plus
  `TextBlock`, `Chat`, and `Plugin` sections).
- Use artifact updates for Draw/Image payloads instead of dependency updates.
- Image/File artifact updates require `BinaryContentRef` values that already
  exist in the binary store (for example, via `BinaryStore.store_bytes` or
  `route_binary_upload`); the websocket payload does not include raw bytes.
- Tests covering the active transport live in
  `internal/wsapi/routes_test.go`, `internal/app/websocket_test.go`, and the
  Python listener SDK websocket tests under
  `tests/api/test_listener_websocket_endpoint.py`.
