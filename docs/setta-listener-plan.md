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
- **Phase 3 – listener UX & emit helpers** ⏳ Outstanding. Per-callback debounce/throttle scheduling lands via `ListenerCallbackScheduler`; realtime deltas now hydrate into typed values inside `SettaListener`, with a follow-up to consolidate the conversion logic into a shared helper instead of duplicating `PythonCodeGenerator.get_param_value`; still pending are public-facing emit helpers (`emit_to_frontend`, `force_refresh`, etc.) and documentation polish; UI exposure is still under discussion.
- **Phase 4 – reliability & tests** ⏳ Outstanding. New async suites cover scheduler edge cases and realtime debounce handling; still pending are schema hot-reload behavior, richer error handling, listener script end-to-end coverage beyond unit scaffolds, and broader monitoring.

### Value Conversion Centralization
- Introduce `setta/code_gen/value_codec.py` with a `format_param_expression(node, dep_graph, var_lookup)` helper that mirrors the logic from `PythonCodeGenerator.get_param_value`, including nested dict/list composition and quoting/boolean handling.
- Refactor the generator so `get_param_value` simply delegates to the codec while `construct_dict`, `construct_list`, and existing position bookkeeping stay untouched; the codec receives callbacks for dict/list assembly so we do not break current emitted code.
- Rework the listener hydration path to call the codec for every realtime delta: produce the canonical expression string, cache its `compile` result per dependency, evaluate it with a minimal namespace rooted at the cached `S` instance, and update both the runtime state and the underlying `ParamNode.value`.
- Expand the realtime listener tests to cover nested params and non-string payloads, add targeted unit tests for the codec comparing its output against the generator, and include a quick benchmark-style assertion to keep eval overhead within interactive tolerances.

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
   - For callbacks with `debounce_ms`/`throttle_ms`, expect grouped console output rather than one line per UI change; deja-vu entries are now coalesced before dispatch.
3. In the UI, switch to the matching project and edit a control covered by the listener dependency; confirm the listener prints the new value and `ctx.changed`.
4. Stop both processes with `Ctrl+C`.

### Open Questions
- Should listeners require auth or secrets outside local dev?
- Are scripts allowed to mutate backend state, or remain read-only for now?
- Do we need throttling/limits for high-frequency realtime emitters?
- Should we surface any dedicated UI affordances (listener mode toggle, status) or keep the feature script-driven only?
- Can a single listener session subscribe to multiple projects, or should that stay one-to-one?
