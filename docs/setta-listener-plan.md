## Setta Listener Snapshot

### Goals
- Long-lived `SettaListener` that reacts to project changes without rerunning generators.
- Enable interactive, script-driven workflows so users can build Python “apps” that respond in real time to UI edits.
- Share the existing generated `S` state model and metadata between run-once scripts and listeners.
- Deliver both persisted project manager snapshots and low-latency realtime deltas.

### Architecture Highlights
- **Websocket plumbing**: `Route.WEBSOCKET_PYTHON_SCRIPT` routes through `websocket_route_loop`, `WMHPythonScriptReceiver`, and a shared `ListenerRegistry` for registration bookkeeping.
- **Persisted feed**: `BaseProjectManager._broadcast_project_state_snapshot` now fans out snapshots to the Python script channel via `WMHPythonScriptSender.send_persisted_update`.
- **Realtime feed**: The frontend emits structured `{sectionId, codeObjId}` keys through `sendRealtimeUIChange`. `WMHFrontendReceiver` forwards events to `RealtimeEventHub`, which sequences them per project before `WMHPythonScriptSender.send_realtime_update` notifies matching listeners.
- **Listener runtime**: `SettaListener` handles bootstrap/init, callback registration, dependency translation, persisted snapshot rebuilds, realtime mutation of the cached `S` instance, reconnects, and callback invocation.

### Phase Progress
- **Phase 1 – persisted pipeline** ✅ Complete. Websocket session handling, listener client skeleton, snapshot broadcasting, and persisted callback execution are wired and covered by the manual smoke workflow.
- **Phase 2 – realtime feed** ✅ Complete. Structured dependency keys flow end-to-end, realtime sequencing is enforced, and listeners receive deltas only when subscribed via `realtime` or `both` feeds.
- **Phase 3 – listener UX & emit helpers** ⏳ Outstanding. Need per-callback debounce/throttle scheduling for the existing `debounce_ms`/`throttle_ms` spec, typed delta application that mirrors `PythonCodeGenerator.get_param_value` (re-hydrating string payloads via `eval` where appropriate), public-facing emit helpers (`emit_to_frontend`, `force_refresh`, etc.), and documentation polish; UI exposure is still under discussion.
- **Phase 4 – reliability & tests** ⏳ Outstanding. Pending work includes schema hot-reload behavior, richer error handling, integration tests that exercise listener scripts, and broader monitoring.

### Dependency Key Refactor Status
- **Done**: Listener registration now resolves sanitized dependency strings to graph keys, websocket payloads ship structured keys, and frontend controls emit the same structure.
- **Next**:
  1. Audit all websocket payload schemas (`ListenerRealtimeDelta`, `RealtimeUIChange`, generators) so every path uses structured keys.
  2. Regenerate TypeScript bindings (`source activate.sh && cd frontend && pnpm generate`) and verify the generated websocket helpers.
  3. Expand listener/manual tooling (`tests/manual_listener_smoke.py`) to log both sanitized names and structured keys for debugging.
  4. Add regression coverage for sanitized-name ↔ structured-key round-trips and duplicate-name handling.
  5. Teach the frontend to emit realtime UI changes only for dependencies that currently have listeners; when no specific dependencies are registered (i.e., a wildcard listener), fall back to emitting every UI change.
  6. Extend `RealtimeEventHub` so it can batch multiple deltas that arrive in quick succession before notifying listeners, instead of emitting one websocket message per change.

### Manual Validation
1. Stack: `source activate.sh && cd frontend && pnpm start`.
2. Listener: `source activate.sh && python tests/manual_listener_smoke.py`.
3. In the UI, switch to the matching project and edit a control covered by the listener dependency; confirm the listener prints the new value and `ctx.changed`.
4. Stop both processes with `Ctrl+C`.

### Open Questions
- Should listeners require auth or secrets outside local dev?
- Are scripts allowed to mutate backend state, or remain read-only for now?
- Do we need throttling/limits for high-frequency realtime emitters?
- Should we surface any dedicated UI affordances (listener mode toggle, status) or keep the feature script-driven only?
- Can a single listener session subscribe to multiple projects, or should that stay one-to-one?
