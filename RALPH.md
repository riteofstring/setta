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

Primary files:

- Plan: `docs/worktrees/go-rewrite-pixi-scene/plan.md`
- Handoff: `docs/worktrees/go-rewrite-pixi-scene/handoff.md`
- History: `docs/worktrees/go-rewrite-pixi-scene/log.md`

Reference worktree note:

- `/home/ubuntu/dev/setta` is the read-only reference/oracle worktree for side-by-side checks.
- That checkout is currently on branch `go-rewrite` and stays pristine.

Loop rules for this restart:

- Treat the prior `go-rewrite-pixijs` branch as research input only, not as the default code path to continue.
- The visible xyflow area must be replaced by a Pixi-owned scene. Hybrid transparent-DOM-shell underlay work does not count as the target architecture.
- Gate 0 is strict:
  - the graph surface is visible
  - the section layout is recognizable
  - pan and zoom are not obviously slower or more janky than the DOM reference
  - zoom does not blur, snap, or blank badly enough to feel broken
- While Gate 0 is failing, do not spend iterations on pixel polish, shell-family expansion, or support-only micro-optimizations.
- DOM is allowed only for active editors, menus/popups, chat, and other explicit exceptions named in the plan/handoff.
- Do not install or upgrade dependencies without explicit user approval.
