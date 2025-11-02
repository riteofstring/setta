# Setta Listener Audit (2024-##-##)

This note captures unused listener code paths identified during a review of the current SettaListener implementation, its websocket message handlers, and related types.

## Candidate removals

- **`WMHPythonScriptSender.send_force_refresh`** (`backend/setta/websockets/msg_handlers/python_script_sender.py:120`): never invoked outside of tests. No production code emits `WebsocketMsgListenerForceRefresh`, so the listener-side force refresh path (including `RealtimeEventHub.reset_sequence`) currently has no effect.
- **`WMHPythonScriptSender.send_error`** (removed nov 2025): callers construct and broadcast listener error messages directly.
- **`WMHPythonScriptSender.broadcast_listener_event`** (removed nov 2025): listener emitted payloads flow through `_handle_listener_frontend_emit` → `WMHFrontendSender.broadcast_listener_emit`, making this resend helper obsolete.
- **`ListenerForceRefreshContent.reason` / `.schemaHash`**: removed. Listener force refresh payloads now only ship the latest snapshot when available.
- **`ListenerFeed` enum indirection**: removed. Listener registration payloads now assume realtime updates by default, simplifying the callback model.

## Suggested follow-ups

1. Decide whether to revive the force-refresh workflow or delete the unused sender method, message handling, and associated tests/docs.
2. If force refresh is dropped, strip the related content fields and message types so the listener runtime only manages bootstrap and realtime flows.
3. If multiple feeds are no longer planned, simplify listener registration data by removing the feed enum entirely.
