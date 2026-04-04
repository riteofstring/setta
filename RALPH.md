---
plan_path: docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-plan.md
handoff_path: docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-handoff.md
history_path: docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log.md
prompt_file: scripts/ralph-default-prompt.md
workdir: .
iterations: until_done
new_session_every: 1
codex_inactivity_timeout_seconds: 1800
yolo: true
worktree_lifecycle: ai
main_lifecycle: ai
terminal_mode: background
verify_command: Choose the narrowest relevant verification for the current subtask. For frontend or visual work, run the relevant tests and include the required Chrome DevTools MCP check before claiming completion.
---

# Ralph Loop Config

This file is the reusable loop entrypoint for this worktree.

## Primary files

- Plan: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-plan.md`
- Handoff: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-handoff.md`
- History: `docs/plans/worktrees/pixijs-graph/graph-substrate-rewrite-log.md`

## Working style

- Start a fresh Codex session each iteration unless there is a specific reason to batch multiple turns.
- Use the plan plus the compact handoff file as the durable handoff between conversations.
- Treat the history file as append-only audit trail, not the default read target for each new iteration.
- Keep `history_path` as a short recent window. When older recent items accumulate, rotate them into the next `...-log-archive-NNN.md` segment and update the history index instead of restoring full history into the active log.
- Refresh the handoff every iteration and append the history every iteration.
- Prefer one bounded subtask per iteration.
- Do not keep executing the same refactor pattern after it has reached a reasonable composition boundary.
- Repeated seam-lift ownership hops through pure forwarding layers count as churn, not progress.
- Iterations default to `until_done`, so the loop keeps going until it reaches `TASK_DONE`, `REPLAN_REQUIRED`, or a non-recoverable `BLOCKED` state unless you override `--iterations`.
- Reserve `TASK_DONE` for when the overall rewrite effort in this plan is actually complete and the iteration's verification passed. Use `REPLAN_REQUIRED` when the correct outcome is to stop the loop for a real replan/human decision. If one bounded lane is complete but another real frontier remains, use `SUBTASK_DONE`.
- Make frequent descriptive commits.
- Default entrypoint: `./ralph.sh`
- Yolo mode defaults on for this worktree config.
- Ralph should kill and retry any Codex iteration that shows no transcript activity for 30 minutes.
- Never run the Ralph loop in the `main` worktree. `main` must remain pristine and untouched.
- `main` may run a read-only reference app session for visual comparison, but Ralph must never edit code there.
- Because supply-chain attacks are a real risk, do not install, add, upgrade, or fetch new dependencies without explicit user permission. This includes package-manager commands and repo scripts that install dependencies.
- Do not auto-upgrade dependencies or relax version pins without explicit user permission. Keep dependency declarations and lockfiles pinned; do not switch to broad ranges such as `^`, `~`, `>=`, or `latest`, and do not run upgrade-oriented package-manager commands unless the user approves that exact change.
- `main` is the visual oracle for this rewrite. Final acceptance on the primary macOS `100%` zoom canary states is still `1:1` appearance versus `main`, but iteration sequencing should follow the staged visual gates below instead of treating final pixel parity as the first blocker on every pass.
- Do not treat obvious visual artifacts as acceptable canary debt. First-zoom text width jumps, temporary too-wide text before a later redraw, blurry or blocky text during zoom, raster snap-after-zoom behavior, or visible layout/chrome drift versus `main` are release-blocking failures for the renderer path being tested.
- Perf progress does not count as success if the checked canary still exhibits those visible artifacts. Keep the visual blocker explicit in the handoff/history instead of presenting the renderer path as acceptable.
- If the current graph-substrate canary is blank, detached during movement, non-interactive, blur/pixelation makes it hard to use, or it is obviously slower than the DOM version, treat that as a Gate 0 failure and block all looks-parity work until it is fixed.

## Staged visual gates

- Gate 0, basic viability:
  - normal-zoom graph surface is visible and not just a blank card
  - body stays attached to its shell/header during pan, zoom, and section movement
  - primary interaction/editing handoff works on the checked slice
  - perf is not obviously worse than the DOM version for that slice
  - blur/pixelation is not severe enough to make the slice unusable
- Gate 1, workable baseline:
  - no gross visual drift
  - no wrong workspace/project surface or stale chrome state
  - no obvious zoom artifacts
  - interactions correct for the currently checked slice
- Gate 2, normal-use parity:
  - spacing, text, chrome, and interaction-state behavior are visually indistinguishable in normal use
- Gate 3, final canary parity:
  - macOS Chrome `100%` canary is `1:1` against `main`
- When selecting the next subtask, target the earliest failing gate first.
- While Gate 0 is still failing, do not spend iterations on low-zoom fidelity, looks polish, or harness-only work unless it directly unblocks the active Gate 0 failure.
- A slice that materially improves Gate 1 or Gate 2 without regressing behavior counts as real progress even if Gate 3 is still open.

## Sub-agents

- Use sub-agents for any Chrome DevTools MCP or CDP testing to keep the main chat context clean.
- Ensure those CDP sub-agents start with fresh context.
- Use sub-agents for other parallelizable, non-overlapping work when helpful.

## Completion criteria for this loop

- A seam-lift lane is done once the seam reaches the nearest caller that actually chooses between implementations or materially simplifies a dependency boundary.
- Do not continue lifting a graph-runtime seam through pure forwarding layers when those layers only pass the same contract through unchanged.
- If the same runtime blocker or broken canary repeats across two iterations, Ralph must pivot to that blocker or stop for replan instead of continuing adjacent support work.
- If the next candidate subtask would be another pure forwarding hop with no direct payoff, the correct result is `SUBTASK_DONE` for the current lane plus a handoff to the next real frontier, not `TASK_DONE` for the whole loop.
- The loop is not done while the active graph-substrate canary still fails the final visual gate against `main`.
- However, per-iteration sequencing should target the earliest failing staged gate rather than jumping straight to final pixel-perfect cleanup when Gate 1 or Gate 2 still has obvious failures.
- If performance improved but text instability, zoom blur/blockiness, wrong surfaces, incorrect interactions, or visible spacing/chrome drift remain, the next frontier is whichever staged visual gate those failures belong to rather than more perf-only churn.
- Terminal statuses must append an explicit marker to the history file:
  - `TASK_DONE` requires `LOOP_TERMINAL_MARKER: task_done`
  - `REPLAN_REQUIRED` requires `LOOP_TERMINAL_MARKER: replan_required`
  - non-terminal statuses must use `LOOP_TERMINAL_MARKER: none`

## CDP handoff

- If Chrome CDP or the current worktree app session becomes inaccessible during an iteration, do not block immediately.
- First attempt one bounded self-recovery of the current non-main worktree lifecycle:
  - prefer `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 ./aireset.sh`
  - if that fails, retry once with `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 ./ai.sh`
- After any self-recovery restart, refresh the current runtime values before continuing:
  - `setta status --connect-info --latest --json --workspace <worktree>`
  - `pnpm -C frontend cdp-port`
- Retry the blocked verification after the restart using the refreshed runtime values instead of stale ports or URLs.
- If the recovery attempt still does not restore CDP/app access, return `BLOCKED`.
- Do not claim CDP visual verification when CDP access is unavailable.
- If a rewrite phase temporarily leaves no trustworthy live CDP canary for the gate you need, mark the slice as `SUBTASK_DONE` with `LOOP_VERIFY_RESULT: deferred_visual_gate` so the loop can keep moving while the pending visual gate stays explicit in the handoff/history.

## Lifecycle bootstrap

- `./ralph.sh` can run lifecycle actions before each iteration so every Codex pass starts from a fresh app session.
- Default bootstrap for this worktree is `ai`.
- Default reference bootstrap for `main` is `ai`.
- After each completed iteration, Ralph performs best-effort cleanup of the worktree and `main` runtimes, which also closes lifecycle tabs/windows when their wrapped launcher exits. By default that cleanup also kills Chrome/Chromium processes so the next iteration starts clean.
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
- If `main` is configured with an `ai` lifecycle and the launched reference frontend still does not start serving, Ralph should retry `main` once with `restart-aireset` before giving up on that iteration.
- When Ralph starts lifecycle sessions itself, it should force the configured loop browser mode for those launches. Headless remains the default loop behavior; manual `./ai.sh` or `./aireset.sh` runs stay headed unless the caller explicitly opts into headless mode.
- Restart lifecycles wait on the repo's Setta session status before Codex starts the iteration.
- If an iteration returns `BLOCKED` with `LOOP_RECOVERY: restart_worktree_lifecycle`, Ralph should continue to the next iteration instead of stopping so the configured worktree bootstrap can retry automatically.
- If an iteration returns `BLOCKED` with `LOOP_RECOVERY: retry_next_iteration`, Ralph should continue to the next iteration instead of stopping.
- If an iteration returns plain `SUBTASK_DONE`, Ralph should continue to the next iteration and treat the completed slice as a handoff to the next real frontier named in `LOOP_NEXT_ACTION`.
- If an iteration returns `SUBTASK_DONE` with `LOOP_VERIFY_RESULT: deferred_visual_gate`, Ralph should treat the code slice as complete for sequencing purposes and continue to the next planned subtask.
- Example:
  - `./ralph.sh --terminal-mode background --worktree-lifecycle ai`
