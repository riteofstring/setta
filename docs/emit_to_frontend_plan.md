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
- ✅ **Dual payloads:** `emit_to_frontend` now accepts both `dependencyValues` and `artifactUpdates`, requiring at least one non-empty map. The wire schema + generated types mirror this.
- ✅ **Artifact payload shape:** Each `artifactUpdates` entry is just the payload string (base64 image today). The backend normalizes the path, wraps the payload as an image update, and does **not** require the path to exist yet so listeners can seed new artifacts.
- ✅ **Artifact type inference:** `ListenerFrontendEmitResolver._infer_artifact_type` now consults the global `Artifacts` cache so each path inherits its cached type (Image, BrushStroke, Draw transform, etc.) instead of blindly defaulting to Image.
- ✅ **Receiver flow + PM hook:** `_handle_listener_frontend_emit` now routes both dependency and artifact payloads through `BaseProjectManager.apply_listener_emit_updates`, which in turn invokes the new `apply_listener_artifact_updates` stub so everything shares the serialized queue. Until the artifact cache learns how to mutate in-memory, `ListenerArtifactUpdateError` surfaces `listener_emit_artifact_update_failed` back to the emitting listener.
- ✅ **Artifacts integration:** Listener emits now populate the `Artifacts` caches via the new helper in `listener_artifact_updates.py`, mark metadata dirty, and trigger `broadcast_artifacts_update` even without dependency overrides. Disk flushes still rely on the existing autosave cadence.
- ⏳ **Draw/Image propagation:** Once artifact updates apply via `Artifacts`, existing `UpdateArtifacts` broadcasts keep every section referencing a shared path in sync automatically—no extra dependency wiring needed.
- ✅ **Future cleanup:** introduced `Artifacts.cache_artifact_in_memory` so both `_update_single_artifact` and listener-driven updates share the same cache/metadata mutation path. `_cache_listener_artifact` is gone, keeping listener updates purely in-memory without forcing disk writes.

## Artifact payload format decision

**Take**
- The current contract intentionally limits `artifactUpdates` to “path → payload string” so the backend can infer a type from cached artifacts, defaulting to `Image` when it has never seen the path before (`docs/emit_to_frontend_plan.md:83-87`, `backend/setta/listeners/listener_frontend_emit_resolver.py:120-205`). That’s why you can’t seed a brand-new brush stroke, draw transform, or chart artifact today—the resolver picks `ArtifactType.Image` whenever there’s no prior cache entry (`backend/setta/listeners/listener_frontend_emit_resolver.py:187-204`).
- On the backend we immediately turn those strings back into real `BaseArtifact` instances inside `apply_listener_artifact_updates` (`backend/setta/project_state/listener_artifact_updates.py:29-121`), so we’re effectively doing a lossy round-trip: listeners send raw strings, the resolver guesses the type, and then we rebuild the very same artifact union we already use everywhere else.
- The wire schema mirrors this “dict of strings” shape on both sides (`backend/setta/types/listener.py:55-64`, `frontend/src/utils/generatedTypes.ts:5913-5932`), so as long as we keep that schema we can’t cleanly represent anything beyond the base64/text payloads described in the doc.

**Recommendation**
- Since we don’t need backward compatibility, I’d collapse the listener-facing format into the same union we already broadcast in `UpdateArtifacts`: let `artifactUpdates` be `list[BaseArtifactUnionWithDiscriminator]`. That keeps the payload self-describing (type + id + value) and avoids duplicating the `ListenerFrontendEmitArtifactUpdate` shim.
- Going with a list instead of `dict[str, BaseArtifact]` avoids the redundant “key contains the path, value also has `id`” problem and aligns with every other artifact payload (`backend/setta/types/artifact.py:110-159`). We can still reject duplicates or keep “last write wins” in the resolver. If we really want map semantics we can always coerce `list` into a dict keyed by `normalize_path(artifact.id)` during resolution.
- This change simplifies the resolver: instead of inferring types, it only needs to normalize/validate `artifact.id`, coerce the incoming JSON into `BaseArtifactUnionWithDiscriminator`, and bail when the artifact type isn’t one of the supported ones. That unlocks non-image creation immediately because the listener explicitly picks the union variant.
- The backend apply path already expects real artifacts, so `apply_listener_artifact_updates` can just normalize paths, optionally clone the object to ensure `artifact.id` matches the normalized string, and call `artifacts.cache_artifact_in_memory(...)`. No more JSON parsing heuristics or type guessing.

**Next steps**
- Update `ListenerFrontendEmitRawContent` + generated TS schema to use `artifactUpdates: list[BaseArtifactUnionWithDiscriminator]`, regenerate types (`source activate.sh && cd frontend && pnpm generate`).
- Teach `SettaListener.emit_to_frontend` to accept `Sequence[BaseArtifactUnion | dict]` (plus maybe helpers like `create_image_artifact_update(...)`) so user scripts can build artifacts without wrestling with Pydantic classes.
- Replace `ListenerFrontendEmitArtifactUpdate` with direct unions throughout `_handle_listener_frontend_emit`, the resolver, and `apply_listener_artifact_updates`, and refresh `tests/websockets/test_python_script_receiver.py` to cover chart/brush/transform emissions plus validation failures under the new schema.
- Surface a short doc/sample showing how to emit, e.g., a `ChartDataArtifact`, so listeners know they can mint new JSON/CSV-backed assets now.
