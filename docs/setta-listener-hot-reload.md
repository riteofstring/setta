# SettaListener Hot Reload

Hot reload keeps a `SettaListener` session connected while you iterate on callback
code. Callbacks are rebuilt in place, websocket state stays alive, and fresh
callbacks immediately receive the latest project snapshot so long-lived resources
such as ML models or database handles can be reused safely.

## How the Runtime Works

- **Callback rebuilds happen under a lock.** `SettaListener.reload_callbacks`
  acquires an internal lock before clearing and re-registering callbacks. The
  listener keeps a snapshot of the previous registration so recoverable errors
  restore the old callbacks automatically (`backend/setta/api/listener.py:503-528`).
- **Registrations can be replayed at any time.** The listener clears its
  bookkeeping, resends `ListenerRegister`, and tolerates repeated acknowledgements
  without leaking scheduler state (`backend/setta/api/listener.py:610-636`, `backend/setta/api/listener.py:358-415`).
- **Persisted snapshots are cached.** When callbacks change, the listener replays
  the most recent snapshot so newly registered handlers see current values right
  away (`backend/setta/api/listener.py:1153-1184`).
- **Realtime traffic continues uninterrupted.** The watcher runs inside the same
  event loop as the websocket connection; no reconnects are required when callback
  code changes (`backend/setta/api/listener.py:245-270`).

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
)
```

Key points:
- The builder is executed immediately before the websocket connects, so callback
  registration succeeds on the first bootstrap.
- Heavy resources should live outside the builder function so they persist between
  reloads.
- Attempting to provide a builder without `hot_reload=True` raises an error, keeping
  the API straightforward (`backend/setta/api/listener.py:205-234`).

## ListenerHotReloader Reference

`ListenerHotReloader` coordinates file watching, module reloads, and callback
updates (`backend/setta/api/hot_reload.py`).

- **Module discovery.** The reloader infers watch roots from the builder module, so a
  simple script can opt in without specifying paths.
- **File watching.** `watchfiles.awatch` provides an asyncio-native watcher that
  batches edits and cooperates with the listener loop (`backend/setta/api/hot_reload.py:166-185`).
- **Custom targets.** `extra_watch_paths` accepts files, directories, or glob
  patterns. `ignore_patterns` filters noise such as generated files.
- **Snapshot replay.** `trigger_refresh` (default `True`) controls whether the cached
  snapshot is replayed after each reload.
- **Manual reloads.** `reload_now(reload_module=False)` lets scripts prime callback
  registration before connecting, and `stop()` cleanly tears down the watcher.
- **Settle delay.** Configure `settle_delay` to debounce bursty editor writes; the
  default is 100 ms.

## Watcher Configuration Details

`ListenerHotReloader` normalises extra watch inputs and merges them with inferred
roots:

- Paths ending in wildcards are split into a root directory plus pattern (for
  example, `callbacks/**/*.py` watches every Python file under `callbacks/`).
- Ignore patterns apply per directory root and use `fnmatch` semantics.
- For direct file paths, ignore patterns are matched against the file name so single
  files can be exempted without restructuring the project (`backend/setta/api/hot_reload.py:302-358`).

## Testing & Verification

- Automated coverage lives in `tests/setta/api/test_listener_hot_reload.py`.
  The suite verifies callback ID churn, snapshot replay after reloads, glob/ignore
  handling, and the convenience `start(hot_reload=True, ...)` path.
- `tests/manual_listener_smoke.py --hot-reload` is a manual script that connects to
  the dev backend. Edit `tests/manual_listener_hot_reload_callbacks.py` while it
  runs to observe live reloads and ensure the websocket session stays alive.

## Related Resources

- `docs/setta-listener-plan.md` tracks the broader listener roadmap and future work.
- `tests/manual_listener_hot_reload_callbacks.py` provides a simple builder example
  used by the manual smoke test.
