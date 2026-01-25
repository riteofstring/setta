# Setta Listener Realtime Behavior

This page explains how realtime listener updates move through the system, how callback dependencies are evaluated, and what happens when the backend forces a snapshot replay.

## Snapshot bootstrap and registration
- The listener connects via `SettaListener.run_forever` (or `start`), sends `ListenerInitContent`, and the backend replies with a targeted `WebsocketMsgListenerForceRefresh` containing `ProjectStateSingleConfig`.
- `_refresh_from_snapshot` caches the latest `ProjectStateSingleConfig` and delegates to `_process_snapshot`, which rebuilds `DependencyGraph` and `PythonCodeGenerator`, instantiates the generated `s` state, and resets `_last_realtime_sequence`.
- If code generation fails, the listener keeps runtime state unavailable, skips hydration, and still registers so coverage and action routing stay consistent.
- Each `@listener.listen` decorator produces a `ListenerCallbackSpec`. During registration, `_build_register_content` maps declared dependency strings through `DependencyGraph.full_path_name_to_dep_key` and sends typed dependency keys in `WebsocketMsgListenerRegister`.
- Cached snapshots are replayed by `_replay_cached_snapshot` when callbacks reload and when force refresh payloads omit `projectState`, so newly registered callbacks see current values without waiting for a new backend snapshot.

## Realtime delta pipeline
- Producer side: UI changes emit `RealtimeUIChange`, `WMHFrontendReceiver` calls `RealtimeEventHub.emit_realtime_delta`, and the hub increments the per-project sequence before delegating to `WMHPythonScriptSender.send_realtime_update`.
- The sender filters listener registrations so only sockets with matching dependency keys (or realtime wildcard callbacks) receive `WebsocketMsgListenerRealtimeEvent`.
- Consumer side: `_handle_realtime_event` enforces sequencing (sequence must strictly increase), skips deltas with unknown dependency keys, and ignores updates until runtime state is available.
- `_set_dependency_value` updates the generated state instance by evaluating the code-generated expression for the dependency.
- Applied values update `_dependency_cache`, and matching callbacks are scheduled through `ListenerCallbackScheduler`. Callbacks with `dependency_mode=REFRESH_ONLY` are skipped for realtime deltas; callbacks with empty `deps` receive the merged `changed` map for the batch.

## Action event pipeline
- Action controls emit `RealtimeDependencyEvent`, and `RealtimeEventHub.emit_dependency_event` increments the same per-project sequence counter used by dependency deltas.
- `WMHPythonScriptSender.send_dependency_event` filters listeners by dependency keys for action events. Callbacks with `dependency_mode` that includes realtime and matching dependency keys are notified; callbacks with `deps=[]` act as a wildcard for action events.
- `_handle_dependency_event` enforces sequencing, batches action events per callback, and schedules them through `ListenerCallbackScheduler`. `ctx.events` is populated for these calls; `ctx.changed` remains empty unless a dependency delta was also queued before execution.
- Action events do not touch the dependency cache or the generated `s` instance.

## Dependency modes
- `ListenerDependencyMode.ALWAYS` runs on snapshots and realtime deltas/actions. This is the default when `deps` are provided.
- `ListenerDependencyMode.REALTIME_ONLY` runs only on realtime deltas/actions (no snapshots).
- `ListenerDependencyMode.REFRESH_ONLY` runs only on snapshots. This is the default when `deps` are omitted.
- Pass `deps=[]` to listen to all dependencies (wildcard). With `deps=[]`, realtime batches include the merged `changed` map.
- Dependency names must match `DependencyGraph.full_path_name_to_dep_key`; `_build_register_content` raises `KeyError` when a dependency string cannot be resolved.

## Force refresh lifecycle
- Forcing a refresh (`WMHPythonScriptSender.send_force_refresh`) sends `WebsocketMsgListenerForceRefresh` and calls `RealtimeEventHub.reset_sequence`, so the next realtime delta or action event starts at sequence `1` even if no sockets were connected.
- `_handle_force_refresh` replays the provided `projectState` or falls back to `_latest_persisted_snapshot`. Missing snapshots are logged and only clear `_last_realtime_sequence`.
- `_process_snapshot` rebuilds the dependency graph and replays callbacks using the same rules as bootstrap, then waits for new realtime deltas at sequence `1`.

## Operational tips
- Prefer explicit dependencies so server-side filtering reduces realtime traffic.
- Use `deps=[]` for logging or routing workflows that need every delta.
- Use `REFRESH_ONLY` for expensive recomputations that should only happen on snapshots.
- For action controls, use the button section dependency with `dependency_mode=ListenerDependencyMode.REALTIME_ONLY` (or `deps=[]` for a wildcard).
