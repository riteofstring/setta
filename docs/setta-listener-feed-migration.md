# SettaListener Feed Migration Plan

## Goal
Collapse the existing `SettaListener` feed options into a single realtime feed that still receives initial state and force-refresh snapshots by default, while keeping the enum extensible for future feed types.

## Workstreams

### 1. Shared Types and Generated Artifacts
- Update `backend/setta/types/listener.py` so `ListenerFeed` only contains `"realtime"`.
- Ensure `ListenerInitContent.defaultFeed` reflects the new single-value enum and still serializes cleanly.
- Regenerate the TypeScript bindings (`source activate.sh && cd frontend && pnpm generate`) so the frontend schema matches.

### 2. Listener Feed Semantics
- Simplify feed normalization in `backend/setta/api/listener.py` to accept only the realtime option.
- Remove `_callback_accepts_persisted`/`_callback_accepts_realtime`; callbacks should run on:
  - bootstrap snapshots,
  - force-refresh snapshots (respecting `run_on_refresh=False` to opt out),
  - realtime deltas.
- Confirm bootstrap still guarantees one run per callback even with no deltas.
- Audit scheduler/cache reset points to ensure they no longer branch on feed type.

### 3. Force Refresh Handling
- Add a handler for `WebsocketMsgListenerForceRefresh` that:
  - hydrates the optional `projectState`,
  - replays the snapshot via the same path as bootstrap/refresh,
  - resets realtime sequencing if required.
- Propagate any necessary sequence reset through `RealtimeEventHub`.

### 4. Websocket Sender/Receiver Updates
- Remove references to `PERSISTED`/`BOTH` in registration acks and dependency matching.
- Confirm `WMHPythonScriptSender.send_realtime_update` still filters callbacks correctly with the single feed.
- Review listener registry/coverage tracking for feed-specific assumptions.

### 5. Tests and Validation
- Update Python tests under `tests/setta/api/` and `tests/websockets/` to reflect the new default feed semantics.
- Add coverage for force-refresh behaviour now that it triggers callbacks.
- Run `source activate.sh && python -m unittest discover` to validate the backend suite.
- Manually sanity-check the listener by exercising `tests/manual_listener_smoke.py` or a similar workflow if needed.

## Listener Callback Dependency Modes
- Preserve the current “specific dependencies” flow but make it realtime-only.
- Introduce a way to express “any dependency” callbacks (e.g. wildcard deps or an explicit scope flag) so observers can react to every realtime delta without enumerating sections.
- Redefine “no dependencies” to mean “run on bootstrap and force-refresh only” for refresh-driven tasks that should skip realtime noise.
- Consider future enhancements: fine-grained trigger controls (initial vs refresh vs realtime), manual-only callbacks, or reusable dependency groups if new use cases demand them.

## Follow-ups
- Document the new behaviour in existing listener docs once the implementation lands.
- Revisit frontend listener integrations to ensure they rely on the regenerated feed enum.
