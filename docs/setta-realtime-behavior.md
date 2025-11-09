# Setta Listener Realtime Behavior

This page explains how realtime listener updates move through the system, how callback dependencies are evaluated, and what happens when the backend forces a snapshot replay.

## Snapshot bootstrap and registration
- The listener connects via `SettaListener.run_forever`, sends `ListenerInitContent`, and receives a targeted `WebsocketMsgListenerForceRefresh` containing `ProjectStateSingleConfig`.
- `_process_snapshot(refresh_kind="bootstrap")` compiles the project with `DependencyGraph` and `PythonCodeGenerator`, instantiates `s`, and populates `_dependency_cache`.
- Each `@listener.listen` decorator becomes a `ListenerCallbackSpec`. During bootstrap, `_build_register_content` looks up the sanitized dependency names in `DependencyGraph.full_path_name_to_dep_key` and emits those typed dependency keys (instances of the `BaseDependencyKeyUnionWithDiscriminator` union) inside `WebsocketMsgListenerRegister`.
- `_refresh_from_snapshot` caches the latest `ProjectStateSingleConfig` inside `_latest_persisted_snapshot`. Hot reload (`reload_callbacks`) and force refresh payloads that omit `projectState` reuse this cache via `_replay_cached_snapshot`, so freshly registered callbacks hydrate immediately instead of waiting for another backend snapshot.
- Bootstrap callbacks run once the snapshot hydrates. Specs with `run_on_refresh=True` run even if nothing changed, while REFRESH_ONLY callbacks skip realtime traffic but emit an initial invocation so bootstrap-only workflows still fire.

## Realtime delta pipeline
- Producer side: code that mutates project state calls `RealtimeEventHub.emit_realtime_delta`. The hub increments per-project sequence numbers and delegates to `WMHPythonScriptSender.send_realtime_update`.
- The sender filters listener registrations so only sockets with matching dependencies receive the `WebsocketMsgListenerRealtimeEvent` payload.
- Consumer side: `_handle_realtime_event` enforces sequencing (`sequence` must advance, otherwise the event is ignored) and rejects deltas for unknown dependency keys.
- Each `ListenerRealtimeDelta` carries a discriminated dependency key plus a canonical value. `_set_dependency_value` updates the generated `s` instance, rehydrating typed values via `PythonCodeGenerator.get_value`.
- `_dependency_cache` keeps the latest values per dependency. When deltas arrive, the cache is updated so subsequent snapshots can detect whether a value actually changed.
- Matching callbacks enqueue work through `ListenerCallbackScheduler`, which handles debounce/throttle. SPECIFIC callbacks receive only the dependencies that changed; ANY_DEPENDENCY callbacks see a merged `changed` map of every delta in the batch; REFRESH_ONLY callbacks are skipped for realtime deliveries.

## Dependency modes
- `ListenerDependencyMode.SPECIFIC` (default when `deps` are provided) fires on realtime when any declared dependency changes. Snapshots trigger SPECIFIC callbacks only when the new value differs, unless `run_on_refresh=True`, in which case they run on bootstrap and force refresh regardless of diffs.
- `ListenerDependencyMode.ANY_DEPENDENCY` describes a wildcard watcher. You omit `deps`; the callback runs on every bootstrap, force refresh, and realtime delta. Snapshot replays currently invoke the callback with an empty `ctx.changed` (no diff is computed), while realtime batches populate `ctx.changed` with the union of every dependency updated in that batch.
- `ListenerDependencyMode.REFRESH_ONLY` is the implicit mode when no deps are declared. Callbacks run during bootstrap and force refresh, but realtime updates are ignored. Declaring deps is optional; if present they populate `ctx.changed` on refreshes for convenience.
- Dependency names must match entries in `DependencyGraph.full_path_name_to_dep_key`; `_build_register_content` raises `KeyError` when a dependency string cannot be resolved so mistakes surface immediately instead of silently failing.

## Force refresh lifecycle
- Forcing a refresh (`WMHPythonScriptSender.send_force_refresh`) unicasts `WebsocketMsgListenerForceRefresh` to listeners bootstrapped for the project (or a targeted subset) and always calls `RealtimeEventHub.reset_sequence` beforehand—regardless of whether a snapshot payload is included or sockets are currently connected—so the very next realtime delta starts at sequence `1`.
- `SettaListener._handle_force_refresh` falls back to the cached `_latest_persisted_snapshot` if the payload omits `projectState`. Missing snapshots are logged and only clear `_last_realtime_sequence`.
- `_process_snapshot(refresh_kind="force_refresh")` resets `_last_realtime_sequence`, rebuilds the dependency graph, and replays callbacks using the same rules as bootstrap. SPECIFIC callbacks run if a watched dependency changed; `run_on_refresh=True` ensures they run even without changes; REFRESH_ONLY callbacks always execute.
- After a successful replay, any future realtime event starts at sequence `1` again, preventing stale deltas from being accepted out of order.

## Operational tips
- When adding new listener callbacks, prefer SPECIFIC mode with explicit dependency strings so the registry can filter realtime traffic server-side.
- Use REFRESH_ONLY for expensive operations that should not react to every delta but still need to react to schema or project rebuilds.
- If a callback requires awareness of all deltas (for example, logging or routing messages), choose ANY_DEPENDENCY and handle the merged `ctx.changed`.
- Sequencing bugs typically stem from bypassing `WMHPythonScriptSender.send_force_refresh` (which already calls `RealtimeEventHub.reset_sequence`). If you broadcast snapshots manually, make the `reset_sequence` call yourself before emitting new deltas.
