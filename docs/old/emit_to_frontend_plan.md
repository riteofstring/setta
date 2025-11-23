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
- The backend resolves sanitized names into `ListenerFrontendEmitKeyAndValue` entries and applies them directly via the project manager queue so that canonical broadcasts stay authoritative—no dedicated “forward” websocket message is necessary once backend state mutates in-place.

## Progress

- ✅ **Listener helper + raw schema**: `SettaListener.emit_to_frontend` now requires a `dependency_values` mapping, raises on empty payloads, and ships the new `ListenerFrontendEmitRawContent` through `WebsocketMsgListenerFrontendEmit`.
- ✅ **Resolver + websocket integration**: `_handle_listener_frontend_emit` now loads the active `ProjectStateSingleConfig`, resolves sanitized dependency names via `ListenerFrontendEmitResolver`, and forwards typed overrides to the frontend, deleting the legacy payload/target contract end-to-end.
- ✅ **Receiver tests**: `tests/websockets/test_python_script_receiver.py` now covers the resolved broadcast, plus error paths for unknown dependencies, invalid value types, and empty payloads (`source activate.sh && python -m unittest tests.websockets.test_python_script_receiver`).
- ✅ **Backend project-manager application**: `BaseProjectManager.apply_listener_emit_updates` now runs inside the serialized queue, applies literal dependency updates via `listener_dependency_updates.py`, and uses the standard `update_and_broadcast_project_state` path. Image/Draw dependency updates remain out of scope until we define the artifact workflow.
- ✅ **Frontend cleanup**: removed the temporary `handleListenerFrontendEmitForward` reducer so the frontend now relies solely on `UpdateFrontendProjectState` broadcasts.

## Backend plan

### 1. Listener helper + schema updates ✅ (done)
- Update `SettaListener.emit_to_frontend` to accept the mapping, validate bootstrap/registration state as before, and serialize a `WebsocketMsgListenerFrontendEmit` with `ListenerFrontendEmitRawContent`. **Status:** completed—helper ships the new schema and enforces non-empty mappings.
- Remove references to `payload`/`target` and delete the unused `useListenerEvents` plumbing from the client docs. **Status:** helper + websocket layer no longer accept `payload/target`; doc cleanup of the frontend store remains tied to the frontend work in a later step.

### 2. Dependency translation service ✅ (done)
- `backend/setta/listeners/listener_frontend_emit_resolver.py` now builds/caches per-project dependency graphs, resolves sanitized names to `BaseDependencyKeyUnion`, infers the correct `DependencyValueType`, and raises explicit exceptions for unknown dependencies or invalid value types.

### 3. Python-script receiver changes ✅ (done)
- `_handle_listener_frontend_emit` now validates registration/project ids, loads the current project state, resolves dependency overrides via the resolver, surfaces structured errors back to the script, and hands the typed payload off for further processing.

### 4. Project manager application ✅
- Add `BaseProjectManager.apply_listener_emit_updates` so dependency (and future artifact) overrides enqueue through one helper, apply via `listener_dependency_updates.py`, and trigger the canonical broadcast flow.
- Leave Image/Draw dependency updates unimplemented for now; they’ll ship once we define how listeners write canvas artifacts.

### 5. Tests ✅
- `tests/websockets/test_python_script_receiver.py` already exercises translation + error paths.
- `tests/project_state/test_listener_emit_updates.py` now provisions a lightweight project manager fixture to cover successful dependency overrides, artifact-only emits, and failure paths (unknown sections, invalid payloads).

## Frontend plan

1. Regenerate types (`source activate.sh && cd frontend && pnpm generate`) after updating the schemas so frontend unions stay in sync with backend websocket enums.
2. Confirm no lingering references to the old listener queue/imports remain.
3. Validate that `UpdateFrontendProjectState` (or a dedicated delta) now reflects emit-driven changes without extra client logic.
4. Add a simple smoke test/manual checklist to ensure a listener emit results in a backend state change that naturally reaches the UI.

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

## Artifact update strategy
- ✅ **Dual payloads:** `emit_to_frontend` now accepts both `dependencyValues` and `artifactUpdates`, requiring at least one non-empty payload. The wire schema + generated types mirror this.
- ✅ **Artifact payload shape:** Each `artifactUpdates` entry is now a real `BaseArtifactUnionWithDiscriminator`, so listeners send `{type, id, value}` objects instead of “path → base64 string” maps.
- ✅ **Artifact type enforcement:** The resolver no longer guesses types; it simply normalizes the artifact ID, ensures it matches any cached type, and clones the union if the path changed.
- ✅ **Receiver flow + PM hook:** `_handle_listener_frontend_emit` routes typed artifacts directly into `BaseProjectManager.apply_listener_emit_updates`, which caches them and broadcasts the canonical `UpdateArtifacts` payload without rebuilding intermediate models.
- ✅ **Artifacts integration:** Listener emits still populate the `Artifacts` caches via `listener_artifact_updates.py`, mark metadata dirty, and trigger `broadcast_artifacts_update` even when there are no dependency overrides. Disk persistence remains on the autosave cadence.
- ⏳ **Draw/Image propagation:** Once artifact updates apply via `Artifacts`, existing `UpdateArtifacts` broadcasts keep every section referencing a shared path in sync automatically—no extra dependency wiring needed.
- ✅ **Future cleanup:** introduced `Artifacts.cache_artifact_in_memory` so both `_update_single_artifact` and listener-driven updates share the same cache/metadata mutation path. `_cache_listener_artifact` is gone, keeping listener updates purely in-memory without forcing disk writes.

## Artifact payload format decision

**Decision**
- `artifactUpdates` is now defined as `list[BaseArtifactUnionWithDiscriminator]` everywhere (listener helper, websocket payloads, backend resolver, and TS schemas). Listeners must send fully-typed artifacts (`{type, id, value}`), which lets them create any supported artifact in one shot.

**Why**
- The old “path → serialized payload string” contract forced the backend to guess artifact types and then rebuild full unions; this was lossy, prevented emitting new brush/draw/chart artifacts, and duplicated type inference logic.
- Using the canonical artifact union keeps payloads self-describing, aligns with `UpdateArtifacts` broadcasts, and lets the resolver focus on normalization + validation instead of heuristics.

**Implications**
- Listener scripts can seed brand-new artifact types (brush strokes, transforms, chart data, etc.) without relying on cache state.
- Backend application simply normalizes IDs and caches the supplied artifact, so broadcasts reuse the same object graph the listener provided.
- Validation failures are clearer: blank IDs, cached type mismatches, or malformed unions now raise explicit errors before any state mutation.

**Follow-ups**
- Publish a listener sample that shows constructing common artifact unions (image + chart) so scripts don’t have to dig through generated classes.
- Expand autosave + persistence docs once artifact caching supports immediate disk writes for listener-generated files.
