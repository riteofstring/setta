## Setta Listener Plan

### Goals
- Give users a long-lived `SettaListener` script that reacts to frontend changes in near real time and can drive interactive workflows.
- Preserve the existing “generate and run” experience by letting listener scripts reuse the generated `S` class and project state metadata.
- Support two update feeds:
  - **Persisted feed (“state mode”)**: authoritative updates that flow through the project manager pipeline.
  - **Realtime feed (“interactive mode”)**: lightweight events emitted directly from the frontend action layer so slider drags and similar controls feel snappy.

### Listener API Shape
```python
from setta.api import SettaListener, SPath

listener = SettaListener(project_id="...", mode="interactive")

@listener.listen(deps=[SPath("sections.Homepage.hero.title")], feeds="realtime")
def on_title_drag(state, ctx):
    ctx.log.info("hero title is now %s", state.sections.Homepage.hero.title)

@listener.listen(deps=[SPath("sections.Chat.input")], feeds="both", debounce_ms=150)
def on_chat_change(state, ctx):
    listener.emit_to_frontend({"panel": "chat", "value": state.sections.Chat.input})

if __name__ == "__main__":
    listener.start()
```

Key concepts:
- `listen` decorator registers callback metadata: dependencies, debounce/throttle, desired feeds (`"realtime"`, `"persisted"`, or `"both"`), whether to run on bootstrap refresh, concurrency policy, etc.
- Callbacks receive the lazily-updated `S` instance plus a context object exposing:
  - `changed`: dependency ids and new values
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
  - `send_realtime_update` → pushes minimal delta plus derived dependency ids.
  - `send_persisted_update` → forwards the authoritative project-manager update with completed/pending op ids.
  - `send_force_refresh`, `send_error`, `broadcast_listener_event` → support force refreshes, error propagation, and script → frontend emissions.
- Flesh out `WMHPythonScriptReceiver` to manage listener sessions:
  - On connect: perform handshake, register dependencies, select feeds.
  - Handle messages: `RegisterListeners`, `Unregister`, `Emit`, `RequestRefresh`, `Heartbeat`.
  - On disconnect: clean session, release dependency subscriptions.

### Dependency Tracking
- During code generation, emit companion metadata (`setta_gen_meta.json`) mapping `SPath` strings to dependency graph keys (`(sectionId, paramId)` tuples).
- On listener registration:
  - Resolve user-provided dependency specs (`SPath`, request types, etc.) to canonical dependency ids.
  - Store indices for the persisted feed (hooks into the existing dependency_graph diff) and for the realtime feed (directly map section/param pairs).
- When the project manager broadcasts updates, include the changed dependency ids so we can route persisted updates quickly.
- For realtime deltas, read directly from the `RealtimeEventHub` mapping.

### Message Types (new enums in `types.websocket`)
- `ListenerBootstrap`: full project state + schema hash + sequence.
- `ListenerRealtimeEvent`: realtime delta, dependency ids, sequence number.
- `ListenerPersistedEvent`: authoritative update with completed/pending op ids.
- `ListenerForceRefresh`: instructs listener to discard cache and request fresh state.
- `ListenerAck` / `ListenerError`: handshake, heartbeat, and error reporting.
- `ListenerFrontendEmit`: forwarded script→frontend payloads.

### Listener Message Payload Notes
- `ListenerRealtimeEventContent`:
  - `projectConfigId` identifies which listener session should process the delta.
  - `dependencyIds` are the resolved dependency-graph ids (e.g., section/param tuples) so the client can trigger only the callbacks that registered for those ids.
  - `delta` is a dict keyed by the same dependency ids with JSON-serializable new values; listeners patch their cached `S` snapshot before invoking callbacks.
  - `sequence` monotonically increases per project; gaps signal missed events and prompt a force refresh.
  - `metadata` is optional context from the frontend (e.g., emitting control, timestamps); scripts may ignore it.
- `ListenerForceRefreshContent`:
  - ships an optional authoritative `ProjectStateSingleConfigWithCompletedOpIds` snapshot.
  - includes `reason` strings for logging/UX and `schemaHash` that increments whenever the backend regenerates the `S` bundle so listeners reload the matching generated module.
- `ListenerFrontendEmitContent` wraps listener `emit_to_frontend` calls with `projectConfigId`, an arbitrary payload dict, and an optional `target` routing hint for the UI.

### Force Refresh & Reconciliation
- Listener keeps track of the last `sequence` per feed.
- Missing or out-of-order sequence → listener requests `force_refresh`.
- Backend responds with `ListenerForceRefresh` that includes the latest project state and `S` bundle; listener reruns callbacks marked `run_on_refresh`.
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
- Phase 1 should wire `BaseProjectManager._broadcast_project_state_snapshot` to call the new `WMHPythonScriptSender` so listener sockets receive the same persisted snapshots the frontend does.
- Realtime emission from the frontend will mirror the existing `WMHFrontendReceiver` flow, but the listener bridge should live in a new `RealtimeEventHub` (or similar service) that the receiver calls into; the hub can then forward deltas via `WMHPythonScriptSender.send_realtime_update`.
- Keep websocket type unions (`backend/setta/types/generated/websocket_unions.py`) in sync as listener message types are added so FastAPI validation works for both frontend and script connections.

### Modes of Operation
- `mode="persisted"`: only consume project-manager updates. Lowest complexity, good for today’s generated scripts.
- `mode="interactive"`: default for realtime controls; consumes the realtime feed and optionally persisted confirmations.
- `mode="hybrid"` / feeds parameter per callback: mix & match based on workload.

### Testing & Rollout Steps
1. **Phase 1**: Implement websocket session plumbing, `SettaListener` client skeleton, basic persisted updates (no realtime yet).
2. **Phase 2**: Add realtime feed (frontend emission, `RealtimeEventHub`, selective callback trigger). Ship minimal metadata for dependency resolution.
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
- ✅ Began `SettaListener` client scaffolding with callback registration metadata (dependencies, feed selection, debounce/throttle, refresh flags).
- ✅ Implemented the `SettaListener` websocket connection loop plus `start/stop` helpers so scripts can connect, reconnect, and observe incoming message types using the shared host/port defaults.
- ✅ Listener client records per-callback registration metadata (stable IDs, feeds, debounce/throttle flags) and can serialize a full `ListenerRegister` payload for handshakes.
- ⏳ Listener client and tooling are not yet implemented beyond registration metadata; frontend endpoints remain unchanged.

### Pending Work
- Complete the `SettaListener` client handshake, dependency resolution, and message dispatch (using the `ListenerRegister` / `ListenerRegisterAck` messages) so callbacks receive bootstrap/persisted events.
- Provide a replacement manual smoke test once the listener client exists.
- Extend docs/examples after the client lands.
- Track listener dependency registrations server-side so realtime broadcasts can target only interested sockets.
- Flesh out `WMHPythonScriptReceiver` message handling (register, emit, heartbeat) to pair with the new sender helpers.

### Manual Validation
- Deferred until the listener client is implemented; no CLI helper exists yet.
