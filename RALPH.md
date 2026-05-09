---
plan_path: ralph/main/IMPLEMENTATION_PLAN.md
handoff_path: ralph/main/HANDOFF.md
history_path: ralph/main/progress.txt
prompt_file: scripts/ralph-default-prompt.md
workdir: .
iterations: 100
new_session_every: 1
codex_inactivity_timeout_seconds: 1800
reasoning_effort: xhigh
service_tier: fast
yolo: true
worktree_lifecycle: none
terminal_mode: foreground
verify_command: Choose the narrowest relevant verification for the selected subtask; run ./check_quality.sh before committing unless the task explicitly narrows scope.
---

# Ralph Loop Config

This is an empty, ready-to-fill Ralph setup for the main Setta checkout.

Default entrypoint:

```bash
./ralph.sh
```

Primary files:

- Plan: `ralph/main/IMPLEMENTATION_PLAN.md`
- Handoff: `ralph/main/HANDOFF.md`
- History: `ralph/main/progress.txt`
- Prompt: `scripts/ralph-default-prompt.md`

The wrapper reads the frontmatter above for the default prompt, workdir,
iteration count, inactivity timeout, fresh-session cadence, and yolo setting.
Other fields are durable handoff metadata for humans and future loop tooling.

Before running Ralph, replace the placeholder plan with a concrete task list and
update the handoff with the current intended frontier.

## Working Style

- Start a fresh Codex session for each iteration.
- Use the plan plus the compact handoff file as the durable handoff between
  iterations.
- Treat the history file as append-only loop memory.
- Select exactly one bounded task per iteration.
- Run focused verification for the changed behavior.
- Refresh the handoff, append history, and make a descriptive commit after each
  completed code slice.
