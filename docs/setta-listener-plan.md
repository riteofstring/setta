## Setta Listener Plan

### Goals
- Give users a long-lived `SettaListener` script that reacts to frontend changes in near real time and can drive interactive workflows.
- Preserve the existing “generate and run” experience by letting listener scripts reuse the generated `S` class and project state metadata.
- Support two update feeds:
  - **Persisted feed (“state mode”)**: authoritative updates that flow through the project manager pipeline.
  - **Realtime feed (“interactive mode”)**: lightweight events emitted directly from the frontend action layer so slider drags and similar controls feel snappy.

### Listener API Shape
```python
from setta.api import SettaListener

listener = SettaListener(project_id="...", mode="interactive")

@listener.listen(deps=["sections_Homepage__hero__title"], feeds="realtime")
def on_title_drag(state, ctx):
    ctx.log.info("hero title is now %s", state.sections.Homepage.hero.title)

@listener.listen(
    deps=["sections_Chat__input"], feeds="both", debounce_ms=150
)
def on_chat_change(state, ctx):
    listener.emit_to_frontend({"panel": "chat", "value": state.sections.Chat.input})

if __name__ == "__main__":
    listener.start()
```

Key concepts:
- `listen` decorator registers callback metadata: dependencies, debounce/throttle, desired feeds (`"realtime"`, `"persisted"`, or `"both"`), whether to run on bootstrap refresh, concurrency policy, etc.
- Callbacks receive the lazily-updated `S` instance plus a context object exposing:
  - `changed`: dependency attribute names and new values
  - helpers for emitting messages to the backend or frontend
  - `refresh_state()` to request a full resync
  - structured logger scoped to the callback
- `SettaListener` manages the websocket lifecycle, reconnection, and exposes helpers like `force_refresh()` and `stop()`.

### Current Backend Websocket Flow
- `backend/setta/routers/websocket.py:51` funnels all sockets through a shared `websocket_route_loop`; the existing `Route.WEBSOCKET_PYTHON_SCRIPT` entry is wired but its handler stub does nothing yet.
- `backend/setta/websockets/websocket_manager.py:26` centralizes connection tracking and broadcasting. Each message can be targeted by `WebsocketConnectionType`; `PYTHON_SCRIPT` is defined but unused.
- `backend/setta/websockets/msg_handlers/frontend_receiver.py:24` only accepts `WebsocketMsgCurrentAddressUpdate` today. We should keep it focused on frontend control messages and forward any new realtime payloads to a dedicated hub rather than overloading this class.
- Persisted state updates originate in `BaseProjectManager._broadcast_project_state_snapshot` (`backend/setta/project_state/base_project_manager.py:1257`), which calls `WMHFrontendSender.broadcast_project_state`. This is the hook for a new `WMHPythonScriptSender.send_persisted_update`.
- Other broadcast producers (settings reloads, artifact watchers, LLM streaming) also route through the shared websocket manager, so introducing a listener-specific sender keeps responsibilities clear.

### Project State Access Model
- `ProjectStateSingleConfig` stores sections, impls, variants, and code objects in parallel dicts (`sections`, `sectionImpls`, `sectionVariants`, `codeObjs`, `codeObjImpls`, `codeObjVariants`). The active variant for each section lives in `projectConfig.sectionVariantMap`, so there is no single nested structure to index like `state.sections.Homepage.hero.title`.
- Reading a “value” requires resolving the active variant and merging modifiers. Helpers such as `get_curr_effective_section_impl` and `get_curr_effective_code_obj_impl` copy the base impl and apply overrides from `Core.sharedModifier` and `Variant.modifier` before exposing attributes. Type guards (e.g., `get_curr_effective_section_impl_with_type_guard`) are the preferred way to assert expected impl types.
- Parameters inside sections are themselves code objects. Section impls carry `codeObjVariantMap` so we can locate the current variant for each param and again merge through the helper layer before accessing `.value`.
- The generated `S` class that scripts consume today is produced by building a `DependencyGraph` over the project state and then emitting assignments via `PythonCodeGenerator`. Each graph node is keyed by `(sectionId, paramId)` (param id may be `None` for section-level values) and is turned into a sanitized attribute name like `s.sections_Homepage__hero__title`, using double underscores to encode hierarchy.
- Dependency strings represent those generated attribute names exactly; listeners and realtime events reference the same identifiers without any additional dot-notation conversion layer.

### Frontend Changes
- When a UI control mutates state, continue sending the canonical HTTP/project-manager request, **and** emit a `RealtimeUIChange` websocket message containing:
  - `projectConfigId`, `sectionId`, `paramId`, `value`, optional metadata (source component, timestamp)
  - Optional client-side throttling knobs per control; no inherent debounce so sliders feel immediate.
- Add “Listener Mode” UI:
  - Toggle between “Run Once” and “Listen”.
  - Show connection status using the `AllConnections` websocket message.
  - Buttons for “Force Refresh” and “Stop Listener”.
  - Panel for messages emitted from listener scripts.
- Generate REST endpoints via `generatedEndpoints.ts` to manage listener lifecycle (`register`, `forceRefresh`, `stop`, `emit`).

### Backend Websocket Flow
- Extend `WMHFrontendReceiver` (or introduce a collaborator) to forward `RealtimeUIChange` payloads into a new `RealtimeEventHub`.
- `RealtimeEventHub` maintains per-project ephemeral state:
  - Applies incoming diffs to the latest `S` snapshot without waiting for the project manager.
  - Stores sequence numbers to detect missed events.
- Add `WMHPythonScriptSender` parallel to `WMHFrontendSender`:
  - `send_bootstrap` → ships full state, `S` schema blob, and initial sequence/version.
  - `send_realtime_update` → pushes minimal delta keyed by the generated `S` attribute names.
  - `send_persisted_update` → forwards the authoritative project-manager update with completed/pending op ids.
  - `send_force_refresh`, `send_error`, `broadcast_listener_event` → support force refreshes, error propagation, and script → frontend emissions.
- Flesh out `WMHPythonScriptReceiver` to manage listener sessions:
  - On connect: perform handshake, register dependencies, select feeds.
  - Handle messages: `RegisterListeners`, `Unregister`, `Emit`, `RequestRefresh`, `Heartbeat`.
  - On disconnect: clean session, release dependency subscriptions.

### Dependency Tracking
- Document the sanitization rules that `DependencyGraph` applies so users understand how section/param names become the double-underscore `S` attribute identifiers.
- On listener registration, accept dependency specs (plain strings, request types, etc.) as those generated attribute names and record them verbatim alongside the callback metadata.
- Persisted snapshots sent to listeners are the same `ProjectStateSingleConfig` payloads the frontend receives; after each persisted update the client rebuilds its own `DependencyGraph` and `PythonCodeGenerator` to hydrate the generated `S` class before dispatching callbacks.
- Realtime deltas carry those attribute names plus raw values; the listener keeps the most recent dependency graph/generator in memory and patches it via `DependencyGraph.change_value`. If a delta cannot be reconciled (sequence gap, missing id), the listener triggers `force_refresh()` and performs a full rebuild from the next persisted snapshot.
- The backend still tracks dependency registrations per listener so realtime emissions can be filtered to the interested sockets, but the heavy dependency walk lives entirely on the client.

### Listener State Hydration Strategy
- Bootstrap flow: server sends `ListenerBootstrap` containing the authoritative `ProjectStateSingleConfig`. The client rebuilds `DependencyGraph(project_state)` and a fresh `PythonCodeGenerator`, then instantiates or reloads the generated `S` module so callbacks can reference familiar attributes.
- Persisted updates: triggered every time `_broadcast_project_state_snapshot` runs. After receiving the snapshot, the listener repeats the dependency walk and regenerates the `S` instance. Because the backend already computed this snapshot for the frontend, no additional server-side work is required beyond routing it to listener sockets.
- Persisted feed rationale: keeping the listener subscribed to every authoritative broadcast guarantees scripts stay current with changes triggered outside the realtime channel (undo/redo, LLM completions, artifact watchers, other clients). To avoid wasted work when no listeners are connected, `WMHPythonScriptSender.send_persisted_update` should bail early if a project has no registered python-script sockets.
- Realtime updates: contain only the affected attribute names plus raw values. The listener applies them via `DependencyGraph.change_value` and reuses the cached generator to update the in-memory `S` before invoking callbacks. If the update references an unknown dependency or arrives out of order, the listener issues `force_refresh()` and waits for the next persisted snapshot to rebuild ground truth.
- Manual refresh UX (“Refresh Listener Scripts”) simply calls `force_refresh`, causing the backend to send the latest persisted snapshot. This lets users opt into explicit rebuilds without suspending the automatic persisted feed.

### Message Types (new enums in `types.websocket`)
- `ListenerBootstrap`: full project state + schema hash + sequence.
- `ListenerRealtimeEvent`: realtime delta, dependency attribute names, sequence number.
- `ListenerPersistedEvent`: authoritative project state snapshot from the persisted pipeline.
- `ListenerForceRefresh`: instructs listener to discard cache and request fresh state.
- `ListenerAck` / `ListenerError`: handshake, heartbeat, and error reporting.
- `ListenerFrontendEmit`: forwarded script→frontend payloads.

### Listener Message Payload Notes
- `ListenerRealtimeEventContent`:
  - `projectConfigId` identifies which listener session should process the delta.
  - `dependencyIds` are the generated `S` attribute names (double-underscore hierarchy) so the client can trigger only the callbacks that registered for those identifiers.
  - `delta` is a dict keyed by the same attribute names with JSON-serializable new values; listeners update the cached dependency graph/generator before invoking callbacks.
  - `sequence` monotonically increases per project; gaps signal missed events and prompt a force refresh.
  - `metadata` is optional context from the frontend (e.g., emitting control, timestamps); scripts may ignore it.
- `ListenerForceRefreshContent`:
  - ships an optional authoritative `ProjectStateSingleConfig` snapshot.
  - includes `reason` strings for logging/UX and `schemaHash` that increments whenever the backend regenerates the `S` bundle so listeners reload the matching generated module.
- `ListenerFrontendEmitContent` wraps listener `emit_to_frontend` calls with `projectConfigId`, an arbitrary payload dict, and an optional `target` routing hint for the UI.

### Force Refresh & Reconciliation
- Listener keeps track of the last `sequence` per feed.
- Missing or out-of-order sequence → listener requests `force_refresh`.
- Backend responds with `ListenerForceRefresh` that includes the latest project state and `S` bundle; listener rebuilds its dependency graph/`S` instance and reruns callbacks marked `run_on_refresh`.
- Frontend “Refresh Listener Scripts” UI simply triggers `force_refresh` so scripts can opt in to a manual rebuild without waiting for the next persisted update.
- Once the persisted pipeline confirms a change (e.g., after slider release), the listener can run heavier tasks in callbacks subscribed to the persisted feed.

### Execution Model & Reliability
- Default single-threaded callback execution to preserve ordering; optional executor for CPU-bound work with max concurrency caps per listener.
- Debounce/throttle enforced client side (per callback metadata) and optionally server side to avoid overwhelming scripts.
- Heartbeats: listener sends periodic pings; backend drops stale sessions after timeout.
- Error propagation:
  - Callback exceptions captured, logged, and forwarded as `ListenerError`.
  - Option to auto-disable faulty callbacks until manual refresh.
- Schema hot-reload:
  - `ListenerBootstrap` ships `schemaHash`.
  - When code generation outputs new schema, backend pushes updated blob; listener reloads module via importlib and rebinds dependencies.

### Next Implementation Notes
- Phase 1 should wire `BaseProjectManager._broadcast_project_state_snapshot` to call the new `WMHPythonScriptSender` so listener sockets receive the same persisted snapshots the frontend does. `WMHPythonScriptSender.send_persisted_update` should fast-exit when no listeners are registered for a project, but remain wired so active listeners automatically stay in sync.
- Realtime emission from the frontend will mirror the existing `WMHFrontendReceiver` flow, but the listener bridge should live in a new `RealtimeEventHub` (or similar service) that the receiver calls into; the hub can then forward deltas via `WMHPythonScriptSender.send_realtime_update`.
- Keep websocket type unions (`backend/setta/types/generated/websocket_unions.py`) in sync as listener message types are added so FastAPI validation works for both frontend and script connections.

### Modes of Operation
- `mode="persisted"`: only consume project-manager updates. Lowest complexity, good for today’s generated scripts.
- `mode="interactive"`: default for realtime controls; consumes the realtime feed and optionally persisted confirmations.
- `mode="hybrid"` / feeds parameter per callback: mix & match based on workload.

### Testing & Rollout Steps
1. **Phase 1**: Implement websocket session plumbing, `SettaListener` client skeleton, basic persisted updates (no realtime yet).
2. **Phase 2**: Add realtime feed (frontend emission, `RealtimeEventHub`, selective callback trigger). Document sanitization rules so dependency names stay intuitive.
3. **Phase 3**: Wire frontend UI controls (toggle, force refresh), expose script emission to frontend, polish API docs/examples.
4. **Phase 4**: Harden reliability (heartbeats, schema reload, error handling), add integration tests simulating listener scripts, and document end-to-end workflow.

### Open Questions
- Authentication/authorization: do listener sessions require project secrets or rely on local dev trust?
- Mutation rights: should scripts be allowed to call back into the backend to mutate project state, or remain read-only initially?
- Payload limits: define acceptable frequency/size for realtime events; may need throttling for extreme sliders.
- Multi-project listeners: should one listener handle multiple project configs simultaneously, or require separate sessions?

### Phase 1 Progress
- ✅ Added backend plumbing for listener-specific websocket messages:
  - `WebsocketMsgListenerBootstrap` / `WebsocketMsgListenerPersistedUpdate`.
  - `WMHPythonScriptSender` broadcasts persisted snapshots alongside existing frontend payloads.
  - `BaseProjectManager._broadcast_project_state_snapshot` now targets the python-script channel.
  - `WMHPythonScriptReceiver` tracks connected script sockets.
- ✅ Defined additional listener websocket enums/models (`ListenerRealtimeEvent`, `ListenerForceRefresh`, `ListenerAck`, `ListenerError`, `ListenerFrontendEmit`) and registered them in the discriminated unions.
- ✅ Centralized listener payload models (feed enum, realtime/force refresh/ack/error/frontend emit, register/ack) under `backend/setta/types/listener.py` and added `ListenerRegister` / `ListenerRegisterAck` websocket message types.
- ✅ Stubbed `WMHPythonScriptSender` helpers for realtime events, force refresh, ack/error, and listener→frontend emissions.
- ✅ Simplified listener websocket payloads to send bare `ProjectStateSingleConfig` snapshots (persisted, bootstrap, force refresh).
- ✅ `WMHPythonScriptReceiver` persists listener registrations via a shared `ListenerRegistry`, responds with targeted `ListenerRegisterAck` messages, and has regression coverage for the register flow.
- ✅ Listener client handles realtime events: sequence-order enforcement, in-place `S` instance patching for dependency deltas, and invocation of callbacks subscribed to realtime feeds.
- ✅ Began `SettaListener` client scaffolding with callback registration metadata (dependencies, feed selection, debounce/throttle, refresh flags).
- ✅ Implemented the `SettaListener` websocket connection loop plus `start/stop` helpers so scripts can connect, reconnect, and observe incoming message types using the shared host/port defaults.
- ✅ Listener client records per-callback registration metadata (stable IDs, feeds, debounce/throttle flags) and can serialize a full `ListenerRegister` payload for handshakes.
- ✅ Listener client now sends the `ListenerRegister` handshake on connect, processes `ListenerRegisterAck` responses, and flips readiness/error state based on accepted or rejected callbacks.
- ✅ Listener client rebuilds the generated `S` object on bootstrap/persisted snapshots, diffs registered dependencies, and invokes callbacks subscribed to persisted feeds with a structured context.
- ✅ Added regression coverage for realtime listener handling (unit test simulating delta dispatch).

### Pending Work
- Provide a replacement manual smoke test once the listener client exists.
- Extend docs/examples after the client lands.
- Use the shared listener registry to scope realtime broadcasts only to callbacks that registered a matching dependency set.
- Flesh out `WMHPythonScriptReceiver` message handling (register, emit, heartbeat) to pair with the new sender helpers.

### Manual Validation
- Deferred until the listener client is implemented; no CLI helper exists yet.
