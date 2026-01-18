# SettaListener Hot Reload

Hot reload keeps a `SettaListener` session connected while you iterate on callback
code. Callbacks are rebuilt in place, websocket state stays alive, and fresh
callbacks immediately receive the latest project snapshot so long-lived resources
such as ML models or database handles can be reused safely.

## How the Runtime Works

- **Callback rebuilds happen under a lock.** `SettaListener.reload_callbacks`
  acquires an internal lock before clearing and re-registering callbacks. If
  reload fails, the previous callbacks and scheduler state are restored.
- **Registrations can be replayed at any time.** The listener clears its
  bookkeeping, resends `ListenerRegister`, and resets expected ack tracking
  without leaking scheduler state.
- **Persisted snapshots are cached.** When callbacks change, the listener can
  replay the most recent snapshot so newly registered handlers see current values
  right away (`trigger_refresh=True`).
- **Realtime traffic continues uninterrupted.** The watcher runs as a background
  task alongside the websocket connection; no reconnects are required when
  callback code changes.

## Starting a Listener with Hot Reload

`SettaListener.start` accepts a `hot_reload=True` flag plus a callback builder
callable. The helper instantiates `ListenerHotReloader`, runs the initial build, and
watchers stay active until you stop the listener.

```python
from setta.api import SettaListener

model = load_model_once()


def build_callbacks(listener: SettaListener) -> None:
    @listener.listen(deps=["foo.bar"], run_on_refresh=True)
    def on_change(state, ctx):
        prediction = model.predict(state.foo.bar)
        ctx.log.info("prediction=%s", prediction)


listener = SettaListener(project_name="Demo Project")
listener.start(
    hot_reload=True,
    builder=build_callbacks,
    extra_watch_paths=["callbacks/**/*.py"],
    ignore_patterns=["tests/**"],
    trigger_refresh=True,
    settle_delay=0.2,
)
```

Key points:
- The builder is executed immediately before the websocket connects, so callback
  registration succeeds on the first bootstrap.
- Heavy resources should live outside the builder function so they persist between
  reloads.
- The builder must be a named function defined in a module so the reloader can
  reload it by name.
- Attempting to provide a builder without `hot_reload=True` raises an error, keeping
  the API straightforward.

## ListenerHotReloader Reference

`ListenerHotReloader` coordinates file watching, module reloads, and callback
updates (`backend/setta/api/hot_reload.py`).

- **Module discovery.** The reloader infers watch roots from the builder module, so a
  simple script can opt in without specifying paths.
- **File watching.** `watchfiles.awatch` provides an asyncio-native watcher that
  batches edits and cooperates with the listener loop.
- **Custom targets.** `extra_watch_paths` accepts files, directories, or glob
  patterns. `ignore_patterns` filters noise such as generated files.
- **Snapshot replay.** `trigger_refresh` (default `True`) controls whether the cached
  snapshot is replayed after each reload.
- **Manual reloads.** `reload_now(reload_module=False)` lets scripts prime callback
  registration before connecting, and `stop()` cleanly tears down the watcher.
- **Settle delay.** Configure `settle_delay` to debounce bursty editor writes; the
  default is 0.1 seconds.

## Watcher Configuration Details

`ListenerHotReloader` normalises extra watch inputs and merges them with inferred
roots:

- Paths ending in wildcards are split into a root directory plus pattern (for
  example, `callbacks/**/*.py` watches every Python file under `callbacks/`).
- Ignore patterns apply per directory root and use `fnmatch` semantics.
- For direct file paths, ignore patterns are matched against the file name so single
  files can be exempted without restructuring the project.

## Testing & Verification

- Automated coverage lives in `tests/api/test_listener_hot_reload.py`.
  The suite verifies callback ID churn, snapshot replay after reloads, glob/ignore
  handling, and the convenience `start(hot_reload=True, ...)` path.
- `tests/manual_listener_smoke.py --hot-reload` is a manual script that connects to
  the dev backend. Edit `tests/manual_listener_hot_reload_callbacks.py` while it
  runs to observe live reloads and ensure the websocket session stays alive.

## Related Resources

- `docs/setta-realtime-behavior.md` covers the snapshot + realtime contract that hot
  reload relies on.
- `tests/manual_listener_hot_reload_callbacks.py` provides a simple builder example
  used by the manual smoke test.
