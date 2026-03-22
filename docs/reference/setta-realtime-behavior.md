# Setta Listener Realtime Behavior

This page explains how realtime listener updates move through the system, how callback dependencies are evaluated, and what happens when the backend forces a snapshot replay.

## Snapshot bootstrap and registration
- The listener connects via `SettaListener.run_forever` (or `start`), sends `ListenerInitContent`, and the backend replies with a targeted `WebsocketMsgListenerForceRefresh` containing `ProjectStateSingleConfig`.
- `_refresh_from_snapshot` caches the latest `ProjectStateSingleConfig` and delegates to `_process_snapshot`, which resets `_last_realtime_sequence`, records the authoritative Go dependency catalog, and rebuilds `_dependency_cache` from authoritative Go-rendered `dependencyValues` when they are present.
- The default listener path does not rebuild `PythonCodeGenerator` or a long-lived generated runtime instance during bootstrap. When authoritative dependency metadata or values are missing, the listener stays on the fail-closed metadata-backed path.
- Each `@listener.listen` decorator produces a `ListenerCallbackSpec`. During registration, `_refresh_callback_dependency_metadata` resolves declared dependency names through `ListenerDependencyMetadata` and sends typed dependency keys in `WebsocketMsgListenerRegister`.
- Cached snapshots are replayed by `_replay_cached_snapshot` using the cached dependency catalog plus cached authoritative snapshot values when callbacks reload or when a force refresh omits `projectState`.

## Realtime delta pipeline
- Producer side: the Go-owned realtime/listener websocket path emits `WebsocketMsgListenerRealtimeEvent` with typed dependency deltas and, when available, authoritative dirty `dependencyValues` for the affected dependency closure.
- Consumer side: `_handle_realtime_event` enforces sequencing (sequence must strictly increase), skips deltas with unknown dependency keys, and ignores updates until runtime state is available.
- Direct deltas are hydrated from dependency metadata, then any authoritative realtime `dependencyValues` overlay the cache so composite dependencies do not need client-side recomputation.
- Applied values update `_dependency_cache`, and matching callbacks are scheduled through `ListenerCallbackScheduler`. Callbacks with `dependency_mode=REFRESH_ONLY` are skipped for realtime deltas; callbacks with empty `deps` receive the merged `changed` map for the batch.
- PasswordParam changes never emit realtime deltas (to avoid broadcasting
  secrets). They persist via `route_set_param_entered_value` and are only
  reflected on snapshot refreshes.

## Action event pipeline
- Action controls emit `RealtimeDependencyEvent`, and the Go-owned realtime/listener websocket path increments the same per-project sequence counter used by dependency deltas.
- Go filters listener deliveries by dependency keys for action events before they reach the Python listener client. Callbacks with `dependency_mode` that includes realtime and matching dependency keys are notified; callbacks with `deps=[]` act as a wildcard for action events.
- `_handle_dependency_event` enforces sequencing, batches action events per callback, and schedules them through `ListenerCallbackScheduler`. `ctx.events` is populated for these calls; `ctx.changed` remains empty unless a dependency delta was also queued before execution.
- Action events do not touch the dependency cache or the generated `s` instance.

## Dependency modes
- `ListenerDependencyMode.ALWAYS` runs on snapshots and realtime deltas/actions. This is the default when `deps` are provided.
- `ListenerDependencyMode.REALTIME_ONLY` runs only on realtime deltas/actions (no snapshots).
- `ListenerDependencyMode.REFRESH_ONLY` runs only on snapshots. This is the default when `deps` are omitted.
- Pass `deps=[]` to listen to all dependencies (wildcard). With `deps=[]`, realtime batches include the merged `changed` map.
- Dependency names must match the latest authoritative dependency catalog; `_refresh_callback_dependency_metadata` raises `KeyError` when a dependency string cannot be resolved.

## Force refresh lifecycle
- Forcing a refresh on the Go listener transport sends `WebsocketMsgListenerForceRefresh` and resets sequence tracking so the next realtime delta or action event starts at sequence `1` even if no listeners were connected.
- `_handle_force_refresh` replays the provided `projectState` or falls back to `_latest_persisted_snapshot`. Missing snapshots are logged and only clear `_last_realtime_sequence`.
- `_process_snapshot` refreshes authoritative dependency metadata/value caches, replays callbacks using the same metadata-backed rules as bootstrap, and then waits for new realtime deltas at sequence `1`.

## Operational tips
- Prefer explicit dependencies so server-side filtering reduces realtime traffic.
- Use `deps=[]` for logging or routing workflows that need every delta.
- Use `REFRESH_ONLY` for expensive recomputations that should only happen on snapshots.
- For action controls, use the button section dependency with `dependency_mode=ListenerDependencyMode.REALTIME_ONLY` (or `deps=[]` for a wildcard).
