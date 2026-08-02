You are operating in a Ralph loop for Setta.

Read these files before acting:
- `AGENTS.md`
- `RALPH.md`
- `ralph/main/IMPLEMENTATION_PLAN.md`
- `ralph/main/HANDOFF.md`
- `ralph/main/progress.txt`

Goal:
Execute the active Ralph plan one bounded task at a time. This checkout starts
with an empty placeholder plan; if no real task is present, stop without making
code changes and report `LOOP_STATUS: REPLAN_REQUIRED`.

Execution rules:
- Select exactly one unchecked concrete task from the plan.
- If the plan still says it is empty or placeholder-only, do not invent work.
- Keep changes scoped to that one task.
- Prefer Go-owned logic and generated downstream surfaces where repository
  ownership rules require it.
- Do not install, add, upgrade, or fetch dependencies without explicit user
  approval.
- Run the narrowest relevant verification for the work changed.
- Run `./check_quality.sh` before committing unless the task explicitly narrows
  verification scope or the run is blocked.
- Refresh `ralph/main/HANDOFF.md` and append `ralph/main/progress.txt` before
  finishing the iteration.
- Make a descriptive commit after each completed code slice.

Status rules:
- Use `SUBTASK_DONE` when the bounded slice is complete and a real next frontier
  remains.
- Use `REPLAN_REQUIRED` when no concrete task is available or the next decision
  needs a human.
- Use `TASK_DONE` only when the overall active Ralph plan is actually complete.
