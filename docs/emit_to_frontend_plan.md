# emit_to_frontend overhaul plan

## Background
- `backend/setta/api/listener.py:984-1011` now lets callbacks call `emit_to_frontend(dependency_values=Mapping[str, Any])`. The helper serializes those dictionaries into `ListenerFrontendEmitRawContent` objects that are still forwarded verbatim to the frontend and dropped into the existing per-target queue (the backend no longer lets listeners pick a target explicitly, so everything currently lands under the default bucket).
- `backend/setta/websockets/msg_handlers/python_script_receiver.py:214-259` only validates the websocket registration/project id before relaying the payload. No transformation takes place on the server, so the frontend receives opaque, untyped data.
- The old frontend queue (`useListenerEvents` + `addListenerFrontendEvent`) merely stored payloads; nothing consumed them, so emits never affected UI state. That queue is being deleted.
- Users want to push typed updates (e.g., update an image section with new Base64 data) even when the corresponding section is absent from the generated `s_instance`. Doing the dependency-string → structured-key translation on the backend keeps listener scripts simple and avoids duplicating project-state introspection in TypeScript, but we also need the backend project manager to apply those overrides so it remains the source of truth for future broadcasts.

## Goals
1. Replace the “raw payload + target” contract with deterministic dependency overrides so emits can mutate project state directly.
2. Let listeners provide dependency identifiers using the same sanitized strings accepted by `@listener.listen` decorators; the backend resolves them to `BaseDependencyKeyUnion` entries even if the section never appeared on `s_instance`.
3. Apply those overrides inside the backend project manager so canonical `ProjectStateSingleConfig` snapshots always reflect emit-driven changes (even if they remain transient/in-memory).
4. Encode values as `BaseDependencyValueUnion` instances server-side; the frontend should only need the canonical project-state broadcasts.
5. Keep failures loud. Unknown dependency strings or invalid value shapes should raise/return errors instead of being silently ignored.
6. Remove the unused `useListenerEvents` store and its websocket plumbing.
7. Cover the new flow with unit tests on the backend (translation, validation, project-manager mutation) and smoke tests on the frontend to prove the regular reducers stay in sync.

## Proposed contract

### Listener API
- Replace `emit_to_frontend(*, payload: Any, target: str | None = None)` with `emit_to_frontend(*, dependency_values: Mapping[str, Any])`.
- Accept any `Mapping[str, Any]` (e.g., dict, `MappingProxyType`). Empty dictionaries raise `ValueError` to prevent no-op emits.
- Keys must match the sanitized dependency strings that `@listener.listen` already uses (e.g., `CoolImage`, `Settings_Group__Data_Source__Prompt`). Alias/shortcut strings are not supported.
- Values stay JSON-serializable since they still travel over the websocket. The helper does not attempt local validation—it simply ships the mapping to the backend.
- Backwards compatibility: remove `payload`/`target` immediately. They have no consumers and retaining them would complicate the new schema.

### Wire payloads
- Introduce two explicit content models:
  - `ListenerFrontendEmitRawContent`: `{ projectConfigId: str, dependencyValues: dict[str, Any] }`. Used by `WebsocketMsgListenerFrontendEmit` (Python script → backend).
  - `ListenerFrontendEmitResolvedContent`: `{ projectConfigId: str, dependencyValues: list[ListenerFrontendEmitKeyAndValue] }`, where each entry is `{ dependencyKey: BaseDependencyKeyUnionWithDiscriminator, value: BaseDependencyValueUnionWithDiscriminator }`. Used by `WebsocketMsgListenerFrontendEmitForward` (backend → frontend).
- Update the generated unions (`setta/types/generated/websocket_unions.py`, `frontend/src/utils/generatedTypes.ts`) accordingly.
- `ListenerFrontendEmitResolvedContent` now carries the resolved dependency overrides. Once received, the backend applies them to the project manager before notifying the frontend, so every consumer sees consistent state.

## Progress

- ✅ **Listener helper + raw schema**: `SettaListener.emit_to_frontend` now requires a `dependency_values` mapping, raises on empty payloads, and ships the new `ListenerFrontendEmitRawContent` through `WebsocketMsgListenerFrontendEmit`. `WebsocketMsgListenerFrontendEmitForward` now carries the resolved `ListenerFrontendEmitResolvedContent` payloads.
- ✅ **Resolver + websocket integration**: `_handle_listener_frontend_emit` now loads the active `ProjectStateSingleConfig`, resolves sanitized dependency names via `ListenerFrontendEmitResolver`, and forwards typed overrides to the frontend, deleting the legacy payload/target contract end-to-end.
- ✅ **Receiver tests**: `tests/websockets/test_python_script_receiver.py` now covers the resolved broadcast, plus error paths for unknown dependencies, invalid value types, and empty payloads (`source activate.sh && python -m unittest tests.websockets.test_python_script_receiver`).
- ⏳ **Backend project-manager application**: needs to accept the resolved overrides, mutate canonical state, and then broadcast downstream.
- ⏳ **Frontend cleanup**: after the backend owns mutations, we can delete the temporary websocket reducer logic altogether.

## Backend plan

### 1. Listener helper + schema updates ✅ (done)
- Update `SettaListener.emit_to_frontend` to accept the mapping, validate bootstrap/registration state as before, and serialize a `WebsocketMsgListenerFrontendEmit` with `ListenerFrontendEmitRawContent`. **Status:** completed—helper ships the new schema and enforces non-empty mappings.
- Remove references to `payload`/`target` and delete the unused `useListenerEvents` plumbing from the client docs. **Status:** helper + websocket layer no longer accept `payload/target`; doc cleanup of the frontend store remains tied to the frontend work in a later step.

### 2. Dependency translation service ✅ (done)
- `backend/setta/listeners/listener_frontend_emit_resolver.py` now builds/caches per-project dependency graphs, resolves sanitized names to `BaseDependencyKeyUnion`, infers the correct `DependencyValueType`, and raises explicit exceptions for unknown dependencies or invalid value types.

### 3. Python-script receiver changes ✅ (done)
- `_handle_listener_frontend_emit` now validates registration/project ids, loads the current project state, resolves dependency overrides via the resolver, surfaces structured errors back to the script, and hands the typed payload off for further processing.

### 4. Project manager application ⏳
- Update the backend project manager so it can ingest `ListenerFrontendEmitKeyAndValue` entries, mutate canonical `ProjectStateSingleConfig` objects (including artifacts/image paths), and trigger the usual frontend broadcast path.
- Decide whether these overrides persist to disk or remain in-memory but, regardless, ensure they originate from the backend rather than the browser.

### 5. Tests ✅ / ⏳
- `tests/websockets/test_python_script_receiver.py` already exercises translation + error paths.
- Add targeted project-manager tests to cover successful overrides and error handling (e.g., missing dependencies, invalid shapes) before we rely on them in production.

## Frontend plan

1. Regenerate types (`source activate.sh && cd frontend && pnpm generate`) after updating the schemas.
2. Remove the temporary `handleListenerFrontendEmitForward` reducer once backend broadcasts already include emit-driven changes; frontend should only need the canonical project-state updates.
3. Confirm no components depended on `useListenerEvents` (already removed) and delete any lingering imports.
4. Validate that `UpdateFrontendProjectState` (or a dedicated delta) now reflects emit-driven changes without extra client logic.
5. Add a simple smoke test/manual checklist to ensure a listener emit results in a backend state change that naturally reaches the UI.

## Rollout & validation

1. **Backend unit tests**: run `source activate.sh && python -m unittest tests/websockets/test_python_script_receiver.py`.
2. **Schema regeneration**: `source activate.sh && cd frontend && pnpm generate`.
3. **Manual listener smoke test** (`tests/manual_listener_smoke.py`):
   - Call `ctx.emit_to_frontend({"CoolImage": "<base64>"})`, verify the backend project state reflects the change, and confirm the frontend updates via the standard broadcast.
4. **Regression**: ensure realtime UI edits still flow since we’re touching shared reducer helpers, project-manager state, and websocket broadcasts.
5. **Docs**: update `docs/setta-realtime-behavior.md` and `docs/old/setta-listener-plan.md` to describe the backend-applied emit contract.

## Open questions / follow-ups
1. **Value-mode heuristics**: Do we need to support non-string overrides (e.g., dict payload for chart data) on day one, or can we scope MVP to literal/base64 and expand later?
2. **Partial failures**: Should the backend reject the entire emit when one dependency fails to resolve, or should it apply the valid subset and report the failures?
3. **Rate limiting**: Do we need guardrails to prevent listeners from spamming emits and overwhelming the websocket?
4. **Hot reload & persistence**: Does the resolver need to refresh cached dependency graphs when project structure changes mid-session, and should emit-driven overrides persist across restarts or remain purely in-memory?
