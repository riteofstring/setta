# SettaListener Hot Reload Proposal

This note sketches an in-process hot-reload flow for listener scripts so long-lived
objects (ML models, caches, etc.) survive code edits.

## Goals
- Keep websocket sessions and runtime state alive while swapping callback logic.
- Reuse existing listener registration paths; no server changes required.
- Provide a simple script-side helper so projects opt in with minimal boilerplate.

## Listener API Extensions
Add guarded management helpers inside `SettaListener`:

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
from setta.api.hot_reload import ListenerHotReloader

model = load_model_once()

def build_callbacks(listener: SettaListener) -> None:
    @listener.listen(deps=["foo.bar"], feed="both")
    def on_change(state, ctx):
        prediction = model.predict(state.foo.bar)
        ctx.log.info("prediction=%s", prediction)

listener = SettaListener(project_name="Demo Project")
reloader = ListenerHotReloader(
    listener=listener,
    module_name="my_listener_module",
    builder_name="build_callbacks",
    paths={"my_listener_module.py"},
)

listener.start_with_hot_reload(reloader)
```

`ListenerHotReloader.watch()` can rely on `watchfiles.awatch` to detect saves, then
`importlib.reload` the module and call `listener.reload_callbacks(builder)`. The helper
should run inside the same event loop so websocket traffic continues uninterrupted.

## Backend Support Work
- Store the most recent persisted snapshot and reuse it for `_replay_cached_snapshot`.
  **Done.**
- Ensure `_send_listener_register()` can run multiple times per connection without
  leaking scheduler state (`ListenerCallbackScheduler.reset` handles this today). **Done.**
- Preserve `run_on_refresh` semantics during bootstrap by invoking callbacks after
  `reload_callbacks` completes when `trigger_refresh=True`.

## Testing and Docs
- Add an async unit test that performs two reload cycles and asserts the server-side
  `ListenerRegistry` sees updated callback IDs while the websocket remains open.
- Document the workflow in `docs/` (this file) and link from `docs/setta-listener-plan.md`.

## Progress
- Listener core now supports hot reload: callback mutation lock, reload workflow, and cached snapshot replay are implemented.
- Registration flow tolerates multiple register attempts without losing state.
- Latest persisted project snapshot is cached and replayed after reloads to hydrate new callbacks immediately.

## Next Steps
1. Ship `ListenerHotReloader` and expose `listener.start_with_hot_reload` so scripts can opt in easily.
2. Add regression coverage for multiple reload cycles plus documentation for manual hot-reload testing with a slow model.
