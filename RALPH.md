---
plan_path: docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-plan.md
log_path: docs/plans/worktrees/setta.pixijs-rewrite/settings-pan-zoom-rendering-rewrite-log.md
prompt_file: scripts/ralph-default-prompt.md
workdir: .
iterations: 100
new_session_every: 1
yolo: true
worktree_lifecycle: restart-aireset
main_lifecycle: restart-ai
terminal_mode: auto
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
- Yolo mode defaults on for this worktree config.
- Never run the Ralph loop in the `main` worktree. `main` must remain pristine and untouched.
- `main` may run a read-only reference app session for visual comparison, but Ralph must never edit code there.

## Sub-agents

- Use sub-agents for any Chrome DevTools MCP or CDP testing to keep the main chat context clean.
- Ensure those CDP sub-agents start with fresh context.
- Use sub-agents for other parallelizable, non-overlapping work when helpful.

## CDP handoff

- If Chrome CDP is inaccessible, stop and tell the user that `ai.sh` should be restarted.
- Do not claim CDP visual verification when CDP access is unavailable.

## Lifecycle bootstrap

- `./ralph.sh` can run lifecycle actions before each iteration so every Codex pass starts from a fresh app session.
- Default bootstrap for this worktree is `restart-aireset`.
- Default reference bootstrap for `main` is `restart-ai`.
- Supported lifecycle modes for the current worktree only:
  - `none`
  - `kill`
  - `ai`
  - `aireset`
  - `restart-ai`
  - `restart-aireset`
- Supported lifecycle modes for `main` reference startup:
  - `none`
  - `kill`
  - `ai`
  - `aireset`
  - `restart-ai`
  - `restart-aireset`
- Terminal mode:
  - `auto` relaunches Ralph visibly when possible: `cmux` in a cmux shell, `tmux` in a tmux shell, `Terminal.app` in Apple Terminal, otherwise background launch
  - `background` always launches lifecycle processes in the background with logs under the loop output dir
  - `tmux` requires a live tmux shell and opens lifecycle processes in new tmux windows
  - `cmux` requires a live cmux shell and opens lifecycle processes in new terminal tabs inside the current cmux workspace
  - `terminal` opens lifecycle processes in new macOS Terminal windows
- `aireset` and `restart-aireset` fall back to `ai.sh` if `aireset.sh` fails.
- `main` lifecycle is for a read-only visual reference session only; no code changes or commits may happen there.
- `main` reference startup is asynchronous; Ralph does not block Codex on `main` becoming ready.
- Restart lifecycles wait on the repo's Setta session status before Codex starts the iteration.
- Example:
  - `./ralph.sh --terminal-mode cmux --worktree-lifecycle restart-aireset`
