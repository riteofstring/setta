# Meta Control Actions Plan (Listener-Only)

## Goal
Allow meta controls to emit higher-level "actions" (especially button clicks) that flow through listeners, enabling listener-driven project ops like Run.

## Constraints
- All meta control actions go through listeners.
- Existing hard-coded UI buttons (e.g., the current Run button) remain as-is.
- No backward compatibility; it is acceptable for the app to be broken during refactor.
- The solution must be general enough to extend beyond buttons later.

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
Add action subscriptions and a handler to emit project ops.
```
@listener.listen(actions=["my_run_button"])
def on_action(s):
  s.emit_project_ops([RunOp(run_kind="special")])
```

## Plan
1) Add action event types and server routing
   - Add `MetaControlActionEvent` to backend types.
   - Add a backend endpoint to receive action events and inject them into the listener pipeline.
   - Add frontend generated endpoint and helper to post action events.

2) Update listener wiring
   - Extend listener input parsing to accept `MetaControlActionEvent`.
   - Add subscription filtering for actions (e.g., `listen(actions=[...])`).
   - Ensure action events do not persist to project state.

3) Project ops output
   - Introduce a `ProjectOp` union for higher-level app actions.
   - Start with `RunOp` (custom run kinds allowed).
   - Add `emit_project_ops` on the listener side and route ops to the existing run pipeline.

4) Frontend meta control behavior
   - Treat button meta controls as action-only (no state write to `metaControlValue`).
   - Emit a `MetaControlActionEvent` on click using the generated endpoint helper.
   - Keep existing Run button wired directly, unchanged.

5) Make actions extensible beyond buttons
   - Extend the meta control config with an action mode:
     - `action_id` (required when action mode is on)
     - `emit_action_on_change` (opt-in for other controls)
     - Optional `payload` mapping (e.g., current value as string)
   - UI can emit both: value updates (stateful controls) and action events (when enabled).

6) Regenerate and test
   - Run `source activate.sh && cd frontend && pnpm generate` after backend type/router updates.
   - Add backend tests for action dispatch and project ops execution.

## Notes
- Action events are transient by design; they should never be written into project state.
- This replaces any ad-hoc "button as state" behavior for meta controls.
