Continue the current effort from the repository state plus the plan and log files. Do not invent a new direction.

Execution rules:
- Select exactly one bounded next subtask.
- Keep the task small enough to finish, verify, log, and commit within this iteration.
- Follow the plan's sequencing gates instead of skipping ahead.
- Append the log before you finish the iteration.
- Make a descriptive git commit after each concrete completed subtask.
- Prefer the narrowest relevant tests and verification for the work you changed.
- For UI work, do not claim visual verification without the required CDP check.
- Never work in the `main` worktree or on the `main` branch. `main` is a pristine reference only.
- Make changes only in the current non-main worktree.

Sub-agent rules:
- Use sub-agents for any Chrome DevTools MCP or CDP verification so the main chat context stays clean.
- Those CDP sub-agents must start with fresh context.
- Use sub-agents for other parallelizable, non-overlapping tasks when they materially help.
- If Chrome CDP is inaccessible, stop and tell the user plainly that they should restart `ai.sh`.

Handoff rules:
- Rely on the plan and log files as the durable handoff between iterations instead of long in-chat summaries.
- If you hit a blocker, update the log with the blocker and stop.
- If the overall task is complete, say so clearly and stop instead of continuing to churn.
