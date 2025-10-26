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
