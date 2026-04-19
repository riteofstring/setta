---
plan_path: docs/worktrees/go-rewrite-pixijs/plan.md
handoff_path: docs/worktrees/go-rewrite-pixijs/handoff.md
history_path: docs/worktrees/go-rewrite-pixijs/log.md
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

## Primary files

- Plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
- Handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
- History: `docs/worktrees/go-rewrite-pixijs/log.md`

Reference worktree note:

- For this restart, the read-only reference worktree path is `/home/ubuntu/dev/setta`.
- That checkout is currently on branch `go-rewrite` and serves as the temporary pristine oracle until `go-rewrite` merges back into `main`.
- Legacy `main` wording in this file refers to that reference-worktree role, not to `origin/main`.

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
- Persisted session ordering, overview ordering, page scroll, worktree-label chrome, and other non-target workspace chrome are oracle-noise classes by default, not automatic reasons to stop the loop for human replan.
- Make frequent descriptive commits.
- Default entrypoint: `./ralph.sh`
- Yolo mode defaults on for this worktree config.
- Ralph should kill and retry any Codex iteration that shows no transcript activity for 30 minutes.
- Never run the Ralph loop in the read-only reference/oracle worktree at `/home/ubuntu/dev/setta`. That checkout must remain pristine and untouched.
- The reference/oracle checkout may run a read-only app session for visual comparison, but Ralph must never edit code there.
- `origin/go-rewrite` is the product-architecture source of truth for this restart.
- Do not revert broad `go-rewrite` refactors or transplant older branch structure wholesale; port proven ideas, instrumentation, and narrow code slices only.
- If the worktree bootstrap fails on a frontend compile blocker, fix it with the smallest `go-rewrite`-native source change that restores the build.
- Do not make the build green by recreating removed generated exports, copying old branch scaffolding wholesale, or backing out major `go-rewrite` structure.
- If the smallest robust compile-blocker fix appears to require a broad architectural rollback, stop and surface that as a blocker/replan instead of silently undoing the refactor.
- Because supply-chain attacks are a real risk, do not install, add, upgrade, or fetch new dependencies without explicit user permission. This includes package-manager commands and repo scripts that install dependencies.
- Do not auto-upgrade dependencies or relax version pins without explicit user permission. Keep dependency declarations and lockfiles pinned; do not switch to broad ranges such as `^`, `~`, `>=`, or `latest`, and do not run upgrade-oriented package-manager commands unless the user approves that exact change.
- The read-only reference/oracle checkout is the visual oracle for this rewrite. Final acceptance on the primary macOS `100%` zoom canary states is still `1:1` appearance versus that checkout, but iteration sequencing should follow the staged visual gates below instead of treating final pixel parity as the first blocker on every pass.
- Do not treat obvious visual artifacts as acceptable canary debt. First-zoom text width jumps, temporary too-wide text before a later redraw, blurry or blocky text during zoom, raster snap-after-zoom behavior, or visible layout/chrome drift versus the reference/oracle checkout are release-blocking failures for the renderer path being tested.
- Perf progress does not count as success if the checked canary still exhibits those visible artifacts. Keep the visual blocker explicit in the handoff/history instead of presenting the renderer path as acceptable.
- If the current settings canary is blank, detached during movement, non-interactive, blur/pixelation makes it hard to use, or it is obviously slower than the DOM version, treat that as a Gate 0 failure and block all looks-parity work until it is fixed.

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
- The loop is not done while the active `go-rewrite-pixijs` canary still fails the final visual gate against `main`.
- However, per-iteration sequencing should target the earliest failing staged gate rather than jumping straight to final pixel-perfect cleanup when Gate 1 or Gate 2 still has obvious failures.
- If performance improved but text instability, zoom blur/blockiness, wrong surfaces, incorrect interactions, or visible spacing/chrome drift remain, the next frontier is whichever staged visual gate those failures belong to rather than more perf-only churn.
- When Gate 1 or Gate 2 verification is running on the live `All Settings` canary, default to a graph-surface-only oracle:
  - close or minimize non-target pane/chat chrome on both sides
  - normalize both sessions to `All Settings`
  - clear viewport to `null`
  - trigger one shared `fit view`
  - compare only graph-surface metrics such as viewport transform, target-section rects, neighboring section geometry, and graph-surface screenshots
- Treat the shared Playwright parity probe as the primary oracle for those Gate 1 / Gate 2 lanes. Use Chrome DevTools MCP as the required visual confirmation layer, not as the default mechanism for re-driving fragile motion or wheel input from scratch.
- If a dynamic compare needs the same subject on both sides, choose a shared section by name or id and align that section locally inside the graph surface before acting; do not use overview ordering or whole-page scroll position as the oracle.
- Each active lane must name one canonical target section in the handoff/history. Use `findSharedVisibleSettingsGraphSection(...)` only to bootstrap a new lane when no named target has been proven yet; do not keep rediscovering the compare target once the lane exists.
- Trusted lane matrix for normalized `All Settings` parity:
  - shared `clear viewport -> fit view` landing on one named section, measured through the Playwright parity helpers
  - named-section authoritative viewport override / restoration
  - named-section toolbar zoom or modified-wheel zoom where Playwright drives the motion and CDP only confirms the post-state visually
  - named-section blank-pane pan or top-level drag on a lane that already has a deterministic Playwright oracle
  - named-section post-motion attachment/editing checks backed by one deterministic Playwright probe
- Known-untrusted compare shapes:
  - ad hoc CDP modified-wheel replay as the only zoom oracle
  - ad hoc CDP drag/drop or pane-pan replay without a paired deterministic Playwright lane
  - compare targets chosen from overview ordering, DOM order, first visible section, or page scroll
  - reused-session stale viewport/state snapshots treated as fresh parity evidence
- Before blaming renderer drift, run a hard preflight on both worktree and read-only `main`:
  - expected surface kind is mounted
  - compare pane state matches the normalized oracle state
  - active view mode is `All Settings`
  - the named target section exists
  - the shared targeted `fitView(...)` path returns `true` when that lane requires it
- If the worktree side fails that preflight, classify the slice as `worktree_unhealthy` and recover or narrow the setup before making renderer claims.
- If the read-only `main` side fails that preflight, classify the slice as `reference_unhealthy` and refresh/restart the reference runtime before making renderer claims.
- If the only remaining diffs are oracle-noise classes after that normalization, do not return `REPLAN_REQUIRED`; record the noise in handoff/history and continue with `SUBTASK_DONE` or a bounded non-terminal blocker plus the next normalization or graph-surface probe step.
- Use `REPLAN_REQUIRED` only when no bounded normalization step or graph-surface-only probe can produce trustworthy evidence without a real human decision.
- Lane budget rule: after two oracle-only or probe-only iterations on the same named lane, the next pass must either land product code on that lane or explicitly close the lane as unsupported/untrustworthy for the current tool stack. Do not spend a third pass re-proving the same setup.
- Once the normalized Gate 1 / Gate 2 motion/editing matrix is clean on live surfaces, stop opening new section-specific parity lanes by default. At that point the next frontier is product architecture work on scene-geometry authority and canary module deepening.
- Treat the existing parity probe matrix as regression coverage after that handoff. Only reopen a section-specific parity lane when a broad deterministic lane or a concrete user-visible artifact fails.
- If a broad deterministic lane is already repeatedly green and the only remaining blocker is standalone CDP/lifecycle access, do not keep spending default iterations on recovery semantics alone. After one bounded retry on the current product slice, either move to the next product prerequisite or stop for a real tooling replan.
- After the DOM-backed substrate is stable enough to serve as a viewable baseline, the next milestone is the first visible Pixi-owned static layer. Prefer slices that make that renderer insertion possible over additional DOM-only parity closure.
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
  - `./scripts/dev-runtime-info.sh --workspace <worktree> --runtime-log <current lifecycle log>`
  - if that helper fails, fall back to `setta status --connect-info --latest --json --workspace <worktree>` plus `./scripts/cdp-port.sh --workspace <worktree> --json`
- Retry the blocked verification after the restart using the refreshed runtime values instead of stale ports or URLs.
- If the recovery attempt still does not restore CDP/app access, return `BLOCKED`.
- Do not claim CDP visual verification when CDP access is unavailable.
- If a rewrite phase temporarily leaves no trustworthy live CDP canary for the gate you need, mark the slice as `SUBTASK_DONE` with `LOOP_VERIFY_RESULT: deferred_visual_gate` so the loop can keep moving while the pending visual gate stays explicit in the handoff/history.
- Do not spend multiple back-to-back iterations on standalone lifecycle/CDP repair for a lane whose deterministic Playwright oracle is already green unless the live worktree or reference runtime is actually unhealthy. One bounded retry is enough before the blocker must either become explicit tooling debt or give way to the next product prerequisite.
- For settings graph exact-fit / centering probes, prefer the shared Playwright parity helpers under `frontend/tests/e2e/settings/graphSubstrateParityProbe.ts` over one-off browser snippets so pane normalization, section lookup, targeted `fitView(...)`, and center-offset capture stay consistent across iterations.
- When a settings parity lane uses the shared helpers, prefer `runSettingsGraphComparePreflight(...)` before the lane action so reference/runtime health is classified explicitly instead of being mistaken for renderer drift.

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
- Detached supervisor launches do not stay attached to the starting terminal or `tmux` pane. Use `./ralph-watch.sh` to follow the active detached log stream after reconnects.
- Restart lifecycles wait on the repo's Setta session status before Codex starts the iteration.
- If an iteration returns `BLOCKED` with `LOOP_RECOVERY: restart_worktree_lifecycle`, Ralph should continue to the next iteration instead of stopping so the configured worktree bootstrap can retry automatically.
- If an iteration returns `BLOCKED` with `LOOP_RECOVERY: retry_next_iteration`, Ralph should continue to the next iteration instead of stopping.
- If an iteration returns plain `SUBTASK_DONE`, Ralph should continue to the next iteration and treat the completed slice as a handoff to the next real frontier named in `LOOP_NEXT_ACTION`.
- If an iteration returns `SUBTASK_DONE` with `LOOP_VERIFY_RESULT: deferred_visual_gate`, Ralph should treat the code slice as complete for sequencing purposes and continue to the next planned subtask.
- Example:
  - `./ralph.sh --terminal-mode background --worktree-lifecycle ai`
