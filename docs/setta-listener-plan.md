## Setta Listener Snapshot

### Goals
- Long-lived `SettaListener` that reacts to project changes without rerunning generators.
- Enable interactive, script-driven workflows so users can build Python “apps” that respond in real time to UI edits.
- Share the existing generated `S` state model and metadata between run-once scripts and listeners.
- Deliver both persisted project manager snapshots and low-latency realtime deltas.

### Architecture Highlights
- **Websocket plumbing**: `Route.WEBSOCKET_PYTHON_SCRIPT` routes through `websocket_route_loop`, `WMHPythonScriptReceiver`, and a shared `ListenerRegistry` for registration bookkeeping.
- **Persisted feed**: `BaseProjectManager._broadcast_project_state_snapshot` now fans out snapshots to the Python script channel via `WMHPythonScriptSender.send_persisted_update`, which unicasts only to sockets that have bootstrapped the matching project. `WMHPythonScriptReceiver` replays the latest snapshot immediately during `ListenerInit`, and surfaces errors back to the listener when the project state can’t be loaded.
- **Realtime feed**: The frontend emits structured `{sectionId, codeObjId}` keys through `sendRealtimeUIChange`. `WMHFrontendReceiver` forwards events to `RealtimeEventHub`, which sequences them per project before `WMHPythonScriptSender.send_realtime_update` notifies matching listeners.
- **Listener runtime**: `SettaListener` handles bootstrap/init, callback registration, dependency translation, persisted snapshot rebuilds, realtime mutation of the cached `S` instance, reconnects, and callback invocation.

### Phase Progress
- **Phase 1 – persisted pipeline** ✅ Complete. Websocket session handling, listener client skeleton, snapshot broadcasting, and persisted callback execution are wired and covered by the manual smoke workflow.
- **Phase 2 – realtime feed** ✅ Complete. Structured dependency keys flow end-to-end, realtime sequencing is enforced, and listeners receive deltas only when subscribed via `realtime` or `both` feeds.
- **Phase 3 – listener UX & emit helpers** ⏳ In progress. Per-callback debounce/throttle scheduling lands via `ListenerCallbackScheduler`; realtime deltas now hydrate into typed values inside `SettaListener` via the shared value codec. `emit_to_frontend` is available on the listener (and exposed via `ctx.emit_to_frontend`), payloads now accept arbitrary JSON-serializable values (not just dicts), and the frontend queues incoming listener payloads by `target`. Still pending: wiring an explicit listener-facing `force_refresh` trigger from the UI, finalizing how the queued payloads are consumed/rendered, and documentation polish; UI exposure is still under discussion.
- **Phase 4 – reliability & tests** ⏳ In progress. New async suites cover scheduler edge cases, realtime debounce handling, bootstrap replay, and server-side routing. Listener registration now tolerates generated-code build failures by deferring callback execution until the next clean snapshot. Still pending are schema hot-reload behavior, richer error handling across generator rebuilds, listener script end-to-end coverage beyond unit scaffolds, and broader monitoring.

### Value Conversion Centralization
- ✅ Introduced `setta/code_gen/value_codec.py` as a `PythonValueCodec` class that mirrors `PythonCodeGenerator.get_param_value` logic, including dict/list composition and quoting semantics.
- ✅ Updated `PythonCodeGenerator` to delegate param/list/dict formatting to the codec while preserving existing callable construction and position bookkeeping.
- ✅ Swapped the listener hydration path to reuse the generator’s value codec: param nodes receive the new string value, we reuse `PythonCodeGenerator.get_value` to build the canonical expression, and evaluate it directly (no more per-dependency compile cache).
- ⏳ Still outstanding: broaden realtime listener coverage for nested params/non-string payloads, add codec-focused unit tests comparing generator output, and capture a lightweight perf assertion once profiling resumes.

### Dependency Key Refactor Status
- **Done**: Listener registration now resolves sanitized dependency strings to graph keys, websocket payloads ship structured keys, and frontend controls emit the same structure. Confirmed all websocket payload schemas (`ListenerRealtimeDelta`, `RealtimeUIChange`, generators) already use structured keys. Regenerated TypeScript bindings (`source activate.sh && cd frontend && pnpm generate`) and verified the websocket helpers.
- **Done**: `tests/manual_listener_smoke.py` now logs both sanitized dependency names and structured graph keys for each callback delta to aid debugging.
- **Done**: Added backend regression coverage validating sanitized-name ↔ structured-key round-trips and duplicate-name handling during listener registration.
- **Next**:
  1. Teach the frontend to emit realtime UI changes only for dependencies that currently have listeners; when no specific dependencies are registered (i.e., a wildcard listener), fall back to emitting every UI change. ✅ Added frontend coverage caching and emission gating; awaiting backend coverage snapshots & websocket broadcast to activate it. ⚠️ Follow-up: trigger an initial snapshot fetch (or force a bootstrap broadcast) when the frontend loads a project.
  2. Extend `RealtimeEventHub` so it can batch multiple deltas that arrive in quick succession before notifying listeners, instead of emitting one websocket message per change.
  3. Define the stable contract for frontend listener payload processing (selection/filtering APIs, retention policy) and surface consumption helpers once UX is decided.

### Manual Validation
1. Stack: `source activate.sh && cd frontend && pnpm start`.
2. Listener: `source activate.sh && python tests/manual_listener_smoke.py`.
   - For callbacks with `debounce_ms`/`throttle_ms`, expect grouped console output rather than one line per UI change; deja-vu entries are now coalesced before dispatch.
3. In the UI, switch to the matching project and edit a control covered by the listener dependency; confirm the listener prints the new value and `ctx.changed`.
4. Stop both processes with `Ctrl+C`.

### Programmatic Launch
- When running against the packaged frontend bundle (after `./build.sh`), start the backend directly from your listener script with `setta.start_backend()`. The helper returns a context-managed handle that stops uvicorn automatically:
  ```python
  from setta import start_backend
  from setta.api import SettaListener

  with start_backend(open_browser=True):
      listener = SettaListener(project_name="Demo Project")
      listener.start()
  ```

### Open Questions
- Should listeners require auth or secrets outside local dev?
- Are scripts allowed to mutate backend state, or remain read-only for now?
- Do we need throttling/limits for high-frequency realtime emitters?
- Should we surface any dedicated UI affordances (listener mode toggle, status) or keep the feature script-driven only?
- Can a single listener session subscribe to multiple projects, or should that stay one-to-one?
