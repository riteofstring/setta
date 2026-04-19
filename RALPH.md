---
plan_path: docs/worktrees/go-rewrite-pixi-scene/plan.md
handoff_path: docs/worktrees/go-rewrite-pixi-scene/handoff.md
history_path: docs/worktrees/go-rewrite-pixi-scene/log.md
prompt_file: scripts/ralph-default-prompt.md
main_worktree_root: /home/ubuntu/dev/setta
workdir: .
iterations: until_done
new_session_every: 1
codex_inactivity_timeout_seconds: 1800
reasoning_effort: xhigh
service_tier: fast
yolo: true
worktree_lifecycle: ai
main_lifecycle: ai
terminal_mode: background
verify_command: Choose the narrowest relevant verification for the current subtask. For frontend or visual work, run the relevant tests and include the required Chrome DevTools MCP check before claiming completion.
---

# Ralph Loop Config

This file is the reusable loop entrypoint for this worktree.

Primary files:

- Plan: `docs/worktrees/go-rewrite-pixi-scene/plan.md`
- Handoff: `docs/worktrees/go-rewrite-pixi-scene/handoff.md`
- History: `docs/worktrees/go-rewrite-pixi-scene/log.md`

Reference worktree note:

- `/home/ubuntu/dev/setta` is the read-only reference/oracle worktree for side-by-side checks.
- That checkout is currently on branch `go-rewrite` and stays pristine.

## Working style

- Start a fresh Codex session each iteration unless there is a specific reason to batch multiple turns.
- Use the plan plus the compact handoff file as the durable handoff between conversations.
- Treat the history file as an append-only audit trail, not the default read target for each new iteration.
- Keep `history_path` as a short recent window. When older recent items accumulate, rotate them into the next `...-log-archive-NNN.md` segment and keep the active `log.md` clean instead of restoring full history into the active file.
- Refresh the handoff every iteration and append the history every iteration.
- Prefer one bounded subtask per iteration.
- Make frequent descriptive commits.
- Default entrypoint: `./ralph.sh`
- Yolo mode defaults on for this worktree config.
- Ralph should kill and retry any Codex iteration that shows no transcript activity for 30 minutes.
- Never run the Ralph loop in the read-only reference/oracle worktree at `/home/ubuntu/dev/setta`. That checkout must remain pristine and untouched.
- The reference/oracle checkout may run a read-only app session for visual comparison, but Ralph must never edit code there.

## Branch rules

- Treat the prior `go-rewrite-pixijs` branch as research input only, not as the default code path to continue.
- The visible xyflow area must be replaced by a Pixi-owned scene. Hybrid transparent-DOM-shell underlay work does not count as the target architecture.
- Pixi is the current substrate choice, not a reason to force rollout if Gate 0 stays red. If bounded scene/bootstrap/zoom/text passes still leave the canary visibly worse than DOM, stop for replan instead of widening Pixi ownership.
- `origin/go-rewrite` is the product-architecture source of truth for this restart.
- Do not revert broad `go-rewrite` refactors or transplant older branch structure wholesale; port proven ideas, instrumentation, and narrow code slices only.
- Do not install, add, upgrade, or fetch new dependencies without explicit user permission.
- Do not auto-upgrade dependencies or relax version pins without explicit user permission.

## Staged visual gates

- Gate 0 is strict:
  - the graph surface is visible
  - the section layout is recognizable
  - pan and zoom are not obviously slower or more janky than the DOM reference
  - zoom does not blur, snap, or blank badly enough to feel broken
- While Gate 0 is failing, do not spend iterations on pixel polish, shell-family expansion, or support-only micro-optimizations.
- Gate 1:
  - no gross visual drift
  - no wrong workspace/project surface or stale chrome state
  - no obvious zoom artifacts
  - interactions correct for the checked slice
- Gate 2:
  - spacing, text, chrome, and interaction-state behavior are visually indistinguishable in normal use
- Gate 3:
  - the high-confidence canary is visually acceptable against the DOM reference
- When selecting the next subtask, target the earliest failing gate first.
- A slice that materially improves Gate 1 or Gate 2 without regressing behavior counts as real progress even if Gate 3 is still open.
- If the current settings canary is blank, detached during movement, non-interactive, severely blurred/pixelated, or obviously slower than the DOM version, treat that as a Gate 0 failure and block all looks-parity work until it is fixed.

## Completion and handoff rules

- Reserve `TASK_DONE` for when the overall rewrite effort in this plan is actually complete and the iteration's verification passed.
- Use `REPLAN_REQUIRED` when the correct outcome is to stop the loop for a real replan/human decision.
- If one bounded lane is complete but another real frontier remains, use `SUBTASK_DONE`.
- If the same runtime blocker or broken canary repeats across two iterations, Ralph must pivot to that blocker or stop for replan instead of continuing adjacent support work.
- Terminal statuses must append an explicit marker to the history file:
  - `TASK_DONE` requires `LOOP_TERMINAL_MARKER: task_done`
  - `REPLAN_REQUIRED` requires `LOOP_TERMINAL_MARKER: replan_required`
  - non-terminal statuses must use `LOOP_TERMINAL_MARKER: none`
- Keep the active `log.md` clean and recent. Do not dump large retrospective summaries into it once the loop is underway; rotate older material into archives and keep `handoff.md` as the compact current-state summary.

## Sub-agents

- Use sub-agents for any Chrome DevTools MCP or CDP testing to keep the main chat context clean.
- Ensure those CDP sub-agents start with fresh context.
- Use sub-agents for other parallelizable, non-overlapping work when helpful.

## Lifecycle bootstrap

- `./ralph.sh` can run lifecycle actions before each iteration so every Codex pass starts from a fresh app session.
- Default bootstrap for this worktree is `ai`.
- Default reference bootstrap for `main` is `ai`.
- `main` lifecycle is for a read-only visual reference session only; no code changes or commits may happen there.
- After each completed iteration, Ralph should leave the worktree docs refreshed, the active log append-only and current, and the git state clean except for the bounded code slice being worked.

## Additional loop rules

- DOM is allowed only for active editors, menus/popups, chat, and other explicit exceptions named in the plan/handoff.
