# emit_to_frontend overhaul plan

## Background
- `backend/setta/api/listener.py:984-1011` now lets callbacks call `emit_to_frontend(dependency_values=Mapping[str, Any])`. The helper serializes those dictionaries into `ListenerFrontendEmitRawContent` objects that are still forwarded verbatim to the frontend and dropped into the existing per-target queue (the backend no longer lets listeners pick a target explicitly, so everything currently lands under the default bucket).
- `backend/setta/websockets/msg_handlers/python_script_receiver.py:214-259` only validates the websocket registration/project id before relaying the payload. No transformation takes place on the server, so the frontend receives opaque, untyped data.
- `frontend/src/state/actions/listenerEvents.ts:4-10` simply enqueues the payloads in `useListenerEvents` (`frontend/src/state/definitions.ts:122-134`). Nothing consumes those queues today, so emits cannot mutate UI state.
- Users want to push typed updates (e.g., update an image section with new Base64 data) even when the corresponding section is absent from the generated `s_instance`. Doing the dependency-string → structured-key translation on the backend keeps listener scripts simple and avoids duplicating project-state introspection in TypeScript.

## Goals
1. Replace the “raw payload + target” contract with deterministic dependency overrides so emits can mutate project state directly.
2. Let listeners provide dependency identifiers using the same sanitized strings accepted by `@listener.listen` decorators; the backend resolves them to `BaseDependencyKeyUnion` entries even if the section never appeared on `s_instance`.
3. Encode values as `BaseDependencyValueUnion` instances server-side so the frontend can reuse the exact reducer path that already handles realtime UI changes.
4. Keep failures loud. Unknown dependency strings or invalid value shapes should raise/return errors instead of being silently ignored.
5. Remove the unused `useListenerEvents` store and its websocket plumbing.
6. Cover the new flow with unit tests on both the backend (translation, validation, broadcasting) and frontend (state mutation).

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
- `ListenerFrontendEmitContent` becomes an alias for the resolved form to keep frontend-only code simple; only the backend uses the request variant.

## Progress

- ✅ **Listener helper + raw schema**: `SettaListener.emit_to_frontend` now requires a `dependency_values` mapping, raises on empty payloads, and ships the new `ListenerFrontendEmitRawContent` through `WebsocketMsgListenerFrontendEmit`. `WebsocketMsgListenerFrontendEmitForward` still carries `ListenerFrontendEmitContent` until the resolver lands.
- ✅ **Test coverage for the new helper**: `tests/websockets/test_python_script_receiver.py` now validates the renamed schema and still passes (`source activate.sh && python -m unittest tests.websockets.test_python_script_receiver`).
- 🚧 **Dependency-resolution helper**: Introduced `backend/setta/listeners/listener_frontend_emit_resolver.py`, which caches dependency graphs, resolves sanitized dependency names, and infers literal/Base64 modes even when the node currently has no value. Still need to plug it into the websocket handler so the frontend receives the resolved payloads.
- ⏳ **Frontend reducer wiring / store cleanup**: pending after resolved payloads exist.

## Backend plan

### 1. Listener helper + schema updates ✅ (done)
- Update `SettaListener.emit_to_frontend` to accept the mapping, validate bootstrap/registration state as before, and serialize a `WebsocketMsgListenerFrontendEmit` with `ListenerFrontendEmitRawContent`. **Status:** completed—helper ships the new schema and enforces non-empty mappings.
- Remove references to `payload`/`target` and delete the unused `useListenerEvents` plumbing from the client docs. **Status:** helper + websocket layer no longer accept `payload/target`; doc cleanup of the frontend store remains tied to the frontend work in a later step.

### 2. Dependency translation service
- Add a resolver (`backend/setta/listeners/listener_frontend_emit_resolver.py`) that:
  1. Accepts a `ProjectStateSingleConfig` plus a dict of sanitized names → values.
  2. Builds (or reuses) a `DependencyGraph` for that project to resolve sanitized names to `BaseDependencyKeyUnion`.
  3. Inspects each dependency node (and, when needed, referenced section/code object metadata) to determine the correct value encoding (`DependencyValueType` -> literal/Base64/FileRead) so values can be wrapped as `BaseDependencyValueUnion` instances. Reuse the same value codec used by realtime hydration (`setta/code_gen/value_codec.py`) to avoid duplicating formatting logic.
  4. Raises `KeyError` for unknown names and `ValueError` when the provided value cannot be encoded for that dependency (e.g., expecting Base64 but receiving a non-string).
- Cache dependency graphs per project in the resolver so repeated emits don’t rebuild them every time (mirror the caching approach already used in `ProjectManagerSwitcher`).

### 3. Python-script receiver changes
- Update `_handle_listener_frontend_emit` in `backend/setta/websockets/msg_handlers/python_script_receiver.py` to:
  - Validate registration/project id as today.
  - Resolve the incoming mapping using the resolver above. Surface errors back to the script via `WebsocketMsgListenerError` so listeners get immediate feedback.
  - Forward a `WebsocketMsgListenerFrontendEmitForward` populated with the resolved dependency overrides (no raw user data).
- Drop the old “payload + target” handling entirely.

### 4. Tests
- Extend `tests/websockets/test_python_script_receiver.py` to cover:
  - Happy path: dict with multiple sanitized names produces a broadcast whose overrides contain the expected dependency keys/value unions.
  - Section missing from project state → `listener_emit_unknown_dependency` error.
  - Type mismatch (e.g., non-string for an image section) → `listener_emit_invalid_value`.
- Add targeted unit tests around the resolver to ensure duplicate sanitized names, nested sections, and non-section dependencies (e.g., section params, code obj impls) resolve correctly.

## Frontend plan

1. Regenerate types (`source activate.sh && cd frontend && pnpm generate`) after updating the schemas.
2. Update `frontend/src/state/actions/websocketReceive.ts` to handle the new resolved payload shape:
   - Iterate over `dependencyValues` and reuse the same helper that processes realtime UI changes (`processRealtimeSectionUpdate` or similar) so emits and realtime deltas share the exact mutation path.
   - Because emits originate from the backend, ensure we guard against project mismatches (ignore updates if the frontend is displaying another project).
3. Remove `useListenerEvents` and `addListenerFrontendEvent` since no code will enqueue arbitrary payloads anymore.
4. Decide how to surface listener-driven updates in the UI (e.g., they simply mutate state, so no additional UX may be necessary).
5. Add a lightweight test (or manual checklist) ensuring the websocket reducer can replay a sample emit response and the state updates as expected.

## Rollout & validation

1. **Backend unit tests**: run `source activate.sh && python -m unittest tests/websockets/test_python_script_receiver.py`.
2. **Schema regeneration**: `source activate.sh && cd frontend && pnpm generate`.
3. **Manual listener smoke test** (`tests/manual_listener_smoke.py`):
   - Call `ctx.emit_to_frontend({"CoolImage": "<base64>"})` and confirm the frontend image updates even when `CoolImage` is absent from the generated `s_instance`.
4. **Regression**: ensure realtime UI edits still flow since we’re touching shared reducer helpers.
5. **Docs**: update `docs/setta-realtime-behavior.md` and `docs/old/setta-listener-plan.md` to describe the new emit contract.

## Open questions / follow-ups
1. **Value-mode heuristics**: Do we need to support non-string overrides (e.g., dict payload for chart data) on day one, or can we scope MVP to literal/base64 and expand later?
2. **Partial failures**: Should the backend reject the entire emit when one dependency fails to resolve, or should it apply the valid subset and report the failures?
3. **Rate limiting**: Do we need guardrails to prevent listeners from spamming emits and overwhelming the websocket?
4. **Hot reload**: Does the resolver need to refresh cached dependency graphs when project structure changes mid-session?
