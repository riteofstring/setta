# SettaListener Feed Migration Plan

## Goal
Collapse the existing `SettaListener` feed options into a single realtime feed that still receives initial state and force-refresh snapshots by default, while keeping the enum extensible for future feed types.

## Workstreams

### 1. Shared Types and Generated Artifacts ✅
- `backend/setta/types/listener.py` now exposes only the `"realtime"` feed and `ListenerInitContent.defaultFeed` is a non-null realtime default.
- Regenerated TypeScript bindings (`source activate.sh && cd frontend && pnpm generate`) so the frontend schema mirrors the single-value enum.
- Updated websocket listener receiver/sender specs to consume the collapsed enum (no remaining references to `PERSISTED`/`BOTH`).

### 2. Listener Feed Semantics
- ✅ Simplified feed handling in `backend/setta/api/listener.py`; the decorator still rejects unknown feeds and all callbacks are treated as realtime.
- ✅ Removed `_callback_accepts_persisted`/`_callback_accepts_realtime`; callbacks now execute on bootstrap, force-refresh (unless `run_on_refresh=False`), and realtime deltas via a single code path.
- ✅ Confirmed bootstrap triggers each callback once even without deltas (`tests/setta/api/test_listener_realtime.py` now asserts the initial invocation).
- ✅ Audited scheduler/cache reset points; persistence, refresh, and realtime flows all reset and enqueue callbacks without feed-specific branching.

### 3. Force Refresh Handling ✅
- `SettaListener` now dispatches `WebsocketMsgListenerForceRefresh` payloads into the unified snapshot pipeline, hydrating the supplied snapshot or the cached persisted state when none is provided.
- Snapshot replays clear `_last_realtime_sequence`, reuse the bootstrap logic, and honour `run_on_refresh=True` callbacks even when values are unchanged.
- `RealtimeEventHub` registers with `WMHPythonScriptSender`, allowing the sender to reset per-project sequences before broadcasting a force refresh (including broadcasts that only pass an id).

### 4. Websocket Sender/Receiver Updates ✅
- Pruned `PERSISTED`/`BOTH` branches; registration acks, coverage tracking, and sender filtering now assume realtime-only feeds.
- `WMHPythonScriptSender.send_realtime_update` and listener coverage tracker both gate on the lone realtime enum member.

### 5. Tests and Validation
- Updated existing listener/websocket unit tests and manual helpers to use the realtime-only feed.
- ✅ Adjusted realtime integration tests to cover bootstrap invocation after the feed collapse.
- ✅ Added unit coverage that force refreshes replay snapshots, clear sequence counters, and respect refresh-only callbacks (`tests/setta/api/test_listener_realtime.py`, `tests/websockets/test_realtime_event_hub.py`).
- 🚧 `source activate.sh && python -m unittest discover` currently fails locally because watchdog cannot start an FSEvents stream inside the harness; rerun on a host with working file watching (or force polling) before shipping.

## Listener Callback Dependency Modes
- ✅ Preserve the current “specific dependencies” flow but make it realtime-only. Implemented via `ListenerDependencyMode.SPECIFIC`, which requires explicit deps and continues to hydrate caches on snapshots.
- ✅ Introduce a way to express “any dependency” callbacks (e.g. wildcard deps or an explicit scope flag) so observers can react to every realtime delta without enumerating sections. The new `ListenerDependencyMode.ANY_DEPENDENCY` routes all deltas to the callback and marks coverage as wildcard.
- ✅ Redefine “no dependencies” to mean “run on bootstrap and force-refresh only” for refresh-driven tasks that should skip realtime noise. `ListenerDependencyMode.REFRESH_ONLY` skips realtime submissions, but still runs on bootstrap/force refresh.
- Consider future enhancements: fine-grained trigger controls (initial vs refresh vs realtime), manual-only callbacks, or reusable dependency groups if new use cases demand them.

## Follow-ups
- Document the new behaviour in existing listener docs once the implementation lands.
- Revisit frontend listener integrations to ensure they rely on the regenerated feed enum.
