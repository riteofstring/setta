# Meta Control Actions Plan (Listener-Only)

## Goal
Allow meta controls to emit higher-level "actions" (especially button clicks) that flow through listeners, enabling listener-driven project manager calls and state updates.

## Constraints
- All meta control actions go through listeners.
- Existing hard-coded UI buttons (e.g., the current Run button) remain as-is.
- No backward compatibility; it is acceptable for the app to be broken during refactor.
- The solution must be general enough to extend beyond buttons later.
- Current branch implementations (e.g., `emit_project_ops` / string-based calls) are provisional and may be removed entirely.

## Proposed Model
### Action Event
Introduce an explicit, non-persistent action event emitted by meta controls.

Example shape (final names TBD):
```
MetaControlActionEvent:
  control_name: str
  action_id: str
  meta_control_type: str
  payload: str | None
  timestamp_ms: int
```

### Listener Input
Extend listener inputs to accept action events alongside dependency literals.

Example:
```
ListenerInput = LiteralDependencyUpdate | MetaControlActionEvent
```

### Listener API
Add action subscriptions and a typed project manager call interface.
```
@listener.listen(actions=["inspect_state"])
async def on_action(s, ctx):
  state = await ctx.project_manager.get_latest_project_state()
```
Keep `emit_to_frontend` as a helper for dependency/artifact updates:
```
@listener.listen(deps=["Welcome"])
async def on_change(s, ctx):
  await ctx.emit_to_frontend(dependency_values={"OtherText": s.Welcome})
```

## Plan (Progress)
1) Add action event types and server routing (done)
   - Add `MetaControlActionEvent` to backend types. (done)
   - Add a backend websocket message handler to receive action events and inject them into the listener pipeline. (done)
   - Add a frontend websocket helper to post action events over the existing frontend connection. (done)

2) Update listener wiring (done)
   - Extend listener input parsing to accept `MetaControlActionEvent`. (done)
   - Add subscription filtering for actions (e.g., `listen(actions=[...])`). (done)
   - Support action wildcards with `actions=[]` while `actions=None` means no action subscription. (done)
   - Ensure action events do not persist to project state. (done)

3) Replace project ops with typed router endpoint calls (done)
   - Remove `ProjectOp` union + `emit_project_ops` and any websocket messages/handlers. (done)
   - Replace string-based calls with a typed listener API generated from router endpoints: (done)
     - Emit a listener-side `RouterEndpointAPI` with method stubs + typed payloads. (done)
     - Use an allowlist so only safe/desired endpoints are exposed. (done)
     - Prefer project-config–scoped endpoints; avoid CLI/WS-only endpoints. (done)
     - Auto-inject `projectConfigId` for listener payloads that omit it. (done)
   - Keep `emit_to_frontend` as a convenience helper. (done)
   - Keep non-backward compatible changes; allow breakage during refactor. (done)

4) Frontend meta control behavior (in progress)
   - Treat button meta controls as action-only (no state write to `metaControlValue`). (done)
   - Emit a `MetaControlActionEvent` on click using the websocket helper. (done)
   - Keep existing Run button wired directly, unchanged. (pending)

5) Regenerate and test (pending)
   - Run `source activate.sh && cd frontend && pnpm generate` after backend type/router updates.
   - Regenerate websocket unions + listener endpoint stubs. (done)
   - Add backend tests for action dispatch + typed project manager calls.
   - Add tests for router endpoint call allowlist + serialization of results/errors.

## Notes
- Action events are transient by design; they should never be written into project state.
- This replaces any ad-hoc "button as state" behavior for meta controls.
