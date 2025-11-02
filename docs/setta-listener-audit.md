# SettaListener Audit – April 2025

## Context
Recent refactors replaced the old bootstrap/persisted websocket feed with force refresh snapshots. I reviewed every listener-related module to confirm what is still exercised and what can be simplified.

## Observations
- `SettaListener` only emits `ListenerInit` during startup (`backend/setta/api/listener.py`). After the server resolves the target project, it unicasts a `ListenerForceRefresh` containing the initial snapshot. There is no outbound “bootstrap” message from the client anymore.
- `SettaListener._dispatch_websocket_message` still branches on `WebsocketMsgListenerBootstrap`, but nothing in the backend sends that type. The definition in `backend/setta/types/websocket.py` pipelines through the generated unions and frontend zod schemas even though it is unused.
- `WebsocketMsgListenerPersistedUpdate` is another unused message variant. The sender never constructs it, the receiver never expects it, and tests only reference the type definition.
- All other listener types (`ListenerForceRefreshContent`, `ListenerRealtimeEventContent`, `ListenerRegister*`, coverage payloads, etc.) continue to flow through the websocket senders, registry, coverage tracker, and frontend stores.
- `_process_snapshot` still needs its `refresh_kind` flag. The first snapshot (bootstrap) must trigger listener registration/logging paths, while subsequent refreshes skip the redundant work. `REFRESH_ONLY` callbacks also rely on that distinction.

## Recommended Cleanup
1. Remove `WebsocketMsgListenerBootstrap` and `WebsocketMsgListenerPersistedUpdate` plus their branches in the adapter unions and `SettaListener._dispatch_websocket_message`.
2. Regenerate types (`pnpm generate` after activating the environment) to drop the stale variants on both backend and frontend.
3. Leave `_process_snapshot` and `refresh_kind` as-is; it still differentiates first-run bootstrap work from later refreshes.

These changes should be safe once existing websocket tests are rerun (`python -m unittest discover tests`). No other dead listener code surfaced.
