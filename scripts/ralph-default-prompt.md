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
- A read-only reference app session may be running from `main` for visual comparison. You may inspect it, but never edit files, commit, or run implementation work there.
- Make changes only in the current non-main worktree.
- If the current iteration is otherwise on track and the only blocker is local lifecycle availability (for example CDP/debug Chrome, bootstrap session, or the worktree app session died), attempt one bounded self-recovery before returning `BLOCKED`.
- Prefer restarting the current worktree with `./aireset.sh`; if that fails, retry once with `./ai.sh`.
- After any restart, refresh runtime values with `setta status --connect-info --latest --json --workspace .` and `pnpm -C frontend cdp-port`, then retry the blocked verification using the refreshed values instead of stale ports or URLs.
- Return `BLOCKED` only if that recovery attempt fails or the retried verification still cannot run.
- If the code subtask is complete but the required visual/CDP gate is temporarily not trustworthy because the rewrite phase has not produced a stable live canary yet, log that state and return `LOOP_STATUS: SUBTASK_DONE` with `LOOP_VERIFY_RESULT: deferred_visual_gate`.
- Use `LOOP_RECOVERY: restart_worktree_lifecycle` only when the next iteration should begin with a fresh worktree bootstrap. Use `LOOP_RECOVERY: retry_next_iteration` only when the next fresh pass should retry the same blocked work instead of treating it as fatal.

Sub-agent rules:
- Use sub-agents for any Chrome DevTools MCP or CDP verification so the main chat context stays clean.
- Those CDP sub-agents must start with fresh context.
- Use sub-agents for other parallelizable, non-overlapping tasks when they materially help.
- If Chrome CDP is inaccessible after the one allowed self-recovery attempt, stop and say so plainly.

Handoff rules:
- Rely on the plan and log files as the durable handoff between iterations instead of long in-chat summaries.
- If you hit a blocker, update the log with the blocker and stop.
- If the overall task is complete, say so clearly and stop instead of continuing to churn.
- If the blocker is recoverable by a fresh outer-loop bootstrap of the current worktree, return `LOOP_RECOVERY: restart_worktree_lifecycle` with `LOOP_STATUS: BLOCKED` so Ralph can retry automatically.
- If the blocker should be retried in the next fresh iteration without stopping the loop, return `LOOP_RECOVERY: retry_next_iteration` with `LOOP_STATUS: BLOCKED`.
- If the code slice is done but the visual gate is intentionally deferred for the rewrite phase, return `LOOP_STATUS: SUBTASK_DONE`, `LOOP_VERIFY_RESULT: deferred_visual_gate`, and `LOOP_RECOVERY: none` so the next iteration can move on.
