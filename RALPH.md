---
plan_path: docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-plan.md
log_path: docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-log.md
prompt_file: scripts/ralph-default-prompt.md
workdir: .
iterations: 100
new_session_every: 1
verify_command: Choose the narrowest relevant verification for the current subtask. For frontend or visual work, run the relevant tests and include the required Chrome DevTools MCP check before claiming completion.
---

# Ralph Loop Config

This file is the reusable loop entrypoint for this worktree.

## Primary files

- Plan: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-plan.md`
- Log: `docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-log.md`

## Working style

- Start a fresh Codex session each iteration unless there is a specific reason to batch multiple turns.
- Use the plan plus the append-only log as the durable handoff between conversations.
- Prefer one bounded subtask per iteration.
- Make frequent descriptive commits.
- Default entrypoint: `./ralph.sh`

## Sub-agents

- Use sub-agents for any Chrome DevTools MCP or CDP testing to keep the main chat context clean.
- Ensure those CDP sub-agents start with fresh context.
- Use sub-agents for other parallelizable, non-overlapping work when helpful.

## CDP handoff

- If Chrome CDP is inaccessible, stop and tell the user that `ai.sh` should be restarted.
- Do not claim CDP visual verification when CDP access is unavailable.
