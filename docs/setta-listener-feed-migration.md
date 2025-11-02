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

### 3. Force Refresh Handling
- Add a handler for `WebsocketMsgListenerForceRefresh` that:
  - hydrates the optional `projectState`,
  - replays the snapshot via the same path as bootstrap/refresh,
  - resets realtime sequencing if required.
- Propagate any necessary sequence reset through `RealtimeEventHub`.

### 4. Websocket Sender/Receiver Updates ✅
- Pruned `PERSISTED`/`BOTH` branches; registration acks, coverage tracking, and sender filtering now assume realtime-only feeds.
- `WMHPythonScriptSender.send_realtime_update` and listener coverage tracker both gate on the lone realtime enum member.

### 5. Tests and Validation
- Updated existing listener/websocket unit tests and manual helpers to use the realtime-only feed.
- ✅ Adjusted realtime integration tests to cover bootstrap invocation after the feed collapse.
- TODO: add fresh coverage for force-refresh behaviour now that it must replay snapshots and trigger callbacks.
- TODO: run `source activate.sh && python -m unittest discover` once remaining behavioural changes land, then perform a manual listener smoke pass if warranted.

## Listener Callback Dependency Modes
- Preserve the current “specific dependencies” flow but make it realtime-only.
- Introduce a way to express “any dependency” callbacks (e.g. wildcard deps or an explicit scope flag) so observers can react to every realtime delta without enumerating sections.
- Redefine “no dependencies” to mean “run on bootstrap and force-refresh only” for refresh-driven tasks that should skip realtime noise.
- Consider future enhancements: fine-grained trigger controls (initial vs refresh vs realtime), manual-only callbacks, or reusable dependency groups if new use cases demand them.

## Follow-ups
- Document the new behaviour in existing listener docs once the implementation lands.
- Revisit frontend listener integrations to ensure they rely on the regenerated feed enum.
