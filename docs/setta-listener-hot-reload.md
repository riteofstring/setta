# SettaListener Hot Reload Proposal

This note sketches an in-process hot-reload flow for listener scripts so long-lived
objects (ML models, caches, etc.) survive code edits.

## Goals
- Keep websocket sessions and runtime state alive while swapping callback logic.
- Reuse existing listener registration paths; no server changes required.
- Provide a simple script-side helper so projects opt in with minimal boilerplate.

## Listener API Extensions
Add guarded management helpers inside `SettaListener`:

- `start_with_hot_reload(reloader)` runs the listener and watcher within the same event loop, performs the initial callback build before connecting, and shuts the watcher down when the listener stops. **Done.**
- `self._callback_lock = asyncio.Lock()` protects callback mutations. **Done.**
- `clear_callbacks()` and `_remove_callback(callback_id)` drop scheduler entries via
  `ListenerCallbackScheduler.unregister_callback` and update `_callbacks`. **Done.**
- `async reload_callbacks(builder, *, trigger_refresh=True)`:
  1. Acquire the lock and rebuild callbacks using the supplied builder. **Done.**
  2. Reset registration bookkeeping and resend the register payload. **Done.**
  3. Optionally replay cached persisted state with `_replay_cached_snapshot()` so new
     callbacks see current values immediately. **Done.**

`_send_listener_register()` now skips quietly when the listener has not bootstrapped,
so `_build_register_content` continues to require a populated `_runtime_state`.

## Script Integration
Keep heavyweight objects outside the reloadable builder and wrap the listener with a
watcher that reloads the module in-place.

```python
from setta.api import SettaListener

model = load_model_once()


def build_callbacks(listener: SettaListener) -> None:
    @listener.listen(deps=["foo.bar"], feed="both")
    def on_change(state, ctx):
        prediction = model.predict(state.foo.bar)
        ctx.log.info("prediction=%s", prediction)


listener = SettaListener(project_name="Demo Project")
listener.start(
    hot_reload=True,
    builder=build_callbacks,
    extra_watch_paths=["callbacks/**/*.py"],
    ignore_patterns=["tests/**"],
)
```

`ListenerHotReloader.watch()` now uses `watchfiles.awatch` with a short settle delay
to collapse bursty editor writes, reloads the target module with `importlib.reload`,
and forwards the updated builder to `listener.reload_callbacks(...)`. The watcher runs
inside the listener’s event loop so websocket traffic continues uninterrupted, and it
replays the cached persisted snapshot after each reload when `trigger_refresh=True`.

## ListenerHotReloader Helper
- Accepts the callback builder callable and infers the originating module path (and package directory when applicable).
- Provides `extra_watch_paths` so scripts can add more files, directories, or glob patterns without replacing the defaults.
- Supports directory-level glob matching and `ignore_patterns` so large projects can exclude generated or transient files without expanding every path manually.
- Offers `reload_now(reload_module=False)` so scripts can build callbacks before the
  websocket connects.
- Exposes `trigger_refresh` (default `True`) to control whether the cached snapshot is
  replayed, and `settle_delay` to tune how quickly file saves trigger a reload.
- Surfaces a `stop()` coroutine that cleanly tears down the watcher when the listener
  exits.
- Uses `importlib.invalidate_caches()` ahead of `reload` so Python picks up freshly
  written bytecode without destroying long-lived state or forcing callers to manage
  timestamps manually.

### Watchfiles vs. Watchdog
- `watchfiles` (new dependency) delivers a fast, asyncio-native `awatch` loop backed
  by Rust watchers. It suits in-process reloaders because it surfaces change batches
  as async iterations and keeps latency low.
- `watchdog` remains in the tree for broader tooling; it still powers higher-level dev
  scripts that need cross-platform observer abstractions. The two coexist: listeners
  lean on `watchfiles`, while CLI utilities continue to rely on `watchdog` until they
  are ported or retired.
- When running tests on macOS, remember that `watchdog` defaults to FSEvents; if that
  observer fails in CI, set `WATCHDOG_USE_POLLING=1` or similar before invoking the
  full unittest suite.

## Backend Support Work
- Store the most recent persisted snapshot and reuse it for `_replay_cached_snapshot`.
  **Done.**
- Ensure `_send_listener_register()` can run multiple times per connection without
  leaking scheduler state (`ListenerCallbackScheduler.reset` handles this today). **Done.**
- Preserve `run_on_refresh` semantics during bootstrap by invoking callbacks after
  `reload_callbacks` completes when `trigger_refresh=True`.

## Testing and Docs
- Added `tests/setta/api/test_listener_hot_reload.py::SettaListenerHotReloadTests` to
  cover two reload cycles, asserting callback IDs rotate and cached snapshots replay
  for newly registered callbacks while the websocket stub stays open.
- The test suite manually bumps file modification times to avoid filesystem cache
  reuse, ensuring `importlib` sees updated modules without requiring callers to juggle
  temporary filenames.
- Linked this doc from `docs/setta-listener-plan.md` so the broader listener roadmap
  references the hot-reload workflow.

## Manual Verification
- `tests/manual_listener_smoke.py --hot-reload` now wires `ListenerHotReloader` into a manual script. It watches `tests/manual_listener_hot_reload_callbacks.py` by default so you can edit the `VERSION` label (or callback body) and observe the listener reload in place without dropping the websocket.
- The script accepts `--watch-path` to add extra files, directories, or glob patterns, `--ignore-pattern` to drop noisy paths, `--no-refresh` to skip replaying cached snapshots between reloads, and `--settle-delay` to tune how quickly file saves trigger refreshes.

## Progress
- Listener core supports hot reload end-to-end: callback mutation lock, reload workflow, cached snapshot replay, and `start_with_hot_reload` orchestration with `ListenerHotReloader` are implemented.
- `ListenerHotReloader` accepts builder callables directly, infers default watch paths, and now handles directory globs plus ignore patterns to reduce boilerplate in large repos.
- `SettaListener.start(hot_reload=True, builder=...)` wraps the helper so scripts opt in with a single flag instead of instantiating the reloader manually.
- Registration flow tolerates multiple register attempts without losing state.
- Latest persisted project snapshot is cached and replayed after reloads to hydrate new callbacks immediately.
- Manual smoke script exercises `ListenerHotReloader.watch()` against the fixture project for quick verification.

## Next Steps
1. Evaluate a persistent configuration surface (e.g., `listener.toml`) so common watch/ignore patterns can be shared across scripts without re-declaring arguments.
2. Decide whether hot-reload defaults (glob patterns, settle delay, ignore list) should live in project metadata or remain per-script overrides.
