Continue from the repository state plus the active plan, handoff, and log files. Do not invent a different direction.

Execution rules:

- Select exactly one bounded next subtask.
- Prefer production renderer or interaction work over support-only cleanup.
- Target the earliest failing gate first.
- While Gate 0 is failing, prioritize:
  - visible nonblank scene
  - recognizable section layout
  - direct Pixi-owned pan/zoom
  - zoom quality and scene stability
- Do not continue the old hybrid transparent-DOM-shell underlay path by inertia.
- Do not install or upgrade dependencies without explicit user approval.
- Refresh the handoff, append the history, and make a descriptive commit before finishing the iteration.
- Use a Chrome DevTools sub-agent for required UI/CDP verification.

Status rules:

- Use `SUBTASK_DONE` when the bounded slice is complete and a real next frontier remains.
- Use `REPLAN_REQUIRED` when the correct result is a real human architectural decision.
- Use `TASK_DONE` only when the overall plan is actually complete.
