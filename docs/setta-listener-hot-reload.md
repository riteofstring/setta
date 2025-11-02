# SettaListener Hot Reload Proposal

This note sketches an in-process hot-reload flow for listener scripts so long-lived
objects (ML models, caches, etc.) survive code edits.

## Goals
- Keep websocket sessions and runtime state alive while swapping callback logic.
- Reuse existing listener registration paths; no server changes required.
- Provide a simple script-side helper so projects opt in with minimal boilerplate.

## Listener API Extensions
Add guarded management helpers inside `SettaListener`:

- `self._callback_lock = asyncio.Lock()` protects callback mutations.
- `clear_callbacks()` and `_remove_callback(callback_id)` drop scheduler entries via
  `ListenerCallbackScheduler.unregister_callback` and update `_callbacks`.
- `async reload_callbacks(builder, *, trigger_refresh=True)`:
  1. Acquire the lock and snapshot `_runtime_state` / `_dependency_cache`.
  2. Clear existing callbacks, run `builder(self)` to register new ones,
     rewire the scheduler via `_register_scheduler_callback`.
  3. Reset `_registration_pending` / `_expected_ack_callback_ids`, resend registration
     through `_send_listener_register()`.
  4. Optionally replay cached persisted state with `_replay_cached_snapshot()` so new
     callbacks see current values immediately.

`_build_register_content` must tolerate being called while `_runtime_state` is `None`
and skip registration if the listener is not yet bootstrapped.

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
- Ensure `_send_listener_register()` can run multiple times per connection without
  leaking scheduler state (`ListenerCallbackScheduler.reset` handles this today).
- Preserve `run_on_refresh` semantics during bootstrap by invoking callbacks after
  `reload_callbacks` completes when `trigger_refresh=True`.

## Testing and Docs
- Add an async unit test that performs two reload cycles and asserts the server-side
  `ListenerRegistry` sees updated callback IDs while the websocket remains open.
- Document the workflow in `docs/` (this file) and link from `docs/setta-listener-plan.md`.

## Next Steps
1. Implement the listener API changes and cached snapshot replay.
2. Ship `ListenerHotReloader` and `listener.start_with_hot_reload`.
3. Add regression coverage plus manual instructions for testing with a slow model.
