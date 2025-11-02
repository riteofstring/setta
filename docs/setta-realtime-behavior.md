# Setta Listener Realtime Behavior

This page explains how realtime listener updates move through the system, how callback dependencies are evaluated, and what happens when the backend forces a snapshot replay.

## Snapshot bootstrap and registration
- The listener connects via `SettaListener.run_forever`, sends `ListenerInitContent`, and receives a `WebsocketMsgListenerBootstrap` containing `ProjectStateSingleConfig`.
- `_process_snapshot(refresh_kind="bootstrap")` compiles the project with `DependencyGraph` and `PythonCodeGenerator`, instantiates `s`, and populates `_dependency_cache`.
- Each `@listener.listen` decorator becomes a `ListenerCallbackSpec`. During bootstrap, `_build_register_content` converts declared dependency strings into `ListenerDependencyKey` values before emitting `WebsocketMsgListenerRegister`.
- Bootstrap callbacks run once the snapshot hydrates. Specs with `run_on_refresh=True` run even if nothing changed, while REFRESH_ONLY callbacks skip realtime traffic but emit an initial invocation so bootstrap-only workflows still fire.

## Realtime delta pipeline
- Producer side: code that mutates project state calls `RealtimeEventHub.emit_realtime_delta`. The hub increments per-project sequence numbers and delegates to `WMHPythonScriptSender.send_realtime_update`.
- The sender filters listener registrations so only sockets with realtime feeds and matching dependencies receive the `WebsocketMsgListenerRealtimeEvent` payload.
- Consumer side: `_handle_realtime_event` enforces sequencing (`sequence` must advance, otherwise the event is ignored) and rejects deltas for unknown dependency keys.
- Each `ListenerRealtimeDelta` encodes a `ListenerDependencyKey` plus a canonical value. `_set_dependency_value` updates the generated `s` instance, rehydrating typed values via `PythonCodeGenerator.get_value`.
- `_dependency_cache` keeps the latest values per dependency. When deltas arrive, the cache is updated so subsequent snapshots can detect whether a value actually changed.
- Matching callbacks enqueue work through `ListenerCallbackScheduler`, which handles debounce/throttle. SPECIFIC callbacks receive only the dependencies that changed; ANY_DEPENDENCY callbacks see a merged `changed` map of every delta in the batch; REFRESH_ONLY callbacks are skipped for realtime deliveries.

## Dependency modes
- `ListenerDependencyMode.SPECIFIC` (default when `deps` are provided) fires on realtime when any declared dependency changes. Snapshots trigger SPECIFIC callbacks only when the new value differs, unless `run_on_refresh=True`, in which case they run on bootstrap and force refresh regardless of diffs.
- `ListenerDependencyMode.ANY_DEPENDENCY` describes a wildcard watcher. You omit `deps`; the callback runs on every bootstrap, force refresh, and realtime delta, with `ctx.changed` containing the union of all changed dependencies for that invocation.
- `ListenerDependencyMode.REFRESH_ONLY` is the implicit mode when no deps are declared. Callbacks run during bootstrap and force refresh, but realtime updates are ignored. Declaring deps is optional; if present they populate `ctx.changed` on refreshes for convenience.
- Dependency names must match entries in `DependencyGraph.full_path_name_to_graph_key`; `_translate_dependency_name` raises `KeyError` so dependency mistakes surface immediately instead of silently failing.

## Force refresh lifecycle
- Forcing a refresh (`WMHPythonScriptSender.send_force_refresh`) broadcasts `WebsocketMsgListenerForceRefresh` to every Python listener. When a specific snapshot is included, the sender also resets the per-project realtime sequence through `RealtimeEventHub.reset_sequence`.
- `SettaListener._handle_force_refresh` falls back to the cached `_latest_persisted_snapshot` if the payload omits `projectState`. Missing snapshots are logged and only clear `_last_realtime_sequence`.
- `_process_snapshot(refresh_kind="force_refresh")` resets `_last_realtime_sequence`, rebuilds the dependency graph, and replays callbacks using the same rules as bootstrap. SPECIFIC callbacks run if a watched dependency changed; `run_on_refresh=True` ensures they run even without changes; REFRESH_ONLY callbacks always execute.
- After a successful replay, any future realtime event starts at sequence `1` again, preventing stale deltas from being accepted out of order.

## Operational tips
- When adding new listener callbacks, prefer SPECIFIC mode with explicit dependency strings so the registry can filter realtime traffic server-side.
- Use REFRESH_ONLY for expensive operations that should not react to every delta but still need to react to schema or project rebuilds.
- If a callback requires awareness of all deltas (for example, logging or routing messages), choose ANY_DEPENDENCY and handle the merged `ctx.changed`.
- Sequencing bugs typically stem from a missing force refresh reset; ensure any manual snapshot broadcast calls `RealtimeEventHub.reset_sequence` before new deltas are emitted.
