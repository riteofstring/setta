# Section Shell S1 Checkpoint 1 DevTools Recovery

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Resolve the tracker blocker that said this Codex session could not use `chrome-devtools-mcp`, then rerun the pending cold `mode` activation compare instead of taking another blind lower-seam refactor.

## What Changed In This Pass

- The built-in `chrome-devtools-mcp` tool is live again in this session:
  - `list_pages` succeeded
  - the worktree app was available at `http://127.0.0.1:3011/...`
  - untouched `main` was reachable from the same debug Chrome at `http://127.0.0.1:3087/...`
- Recreated matched disposable control scenes directly through backend endpoints instead of relying on wiped local project state:
  - worktree project: `smooth_hawk`
  - untouched `main` project: `dry_slow`
  - shared section name: `zinc_blade`
  - shared callable: `open`
  - shared setup:
    - `file` pinned
    - `buffering` converted to an edge input
    - `errors` indented under `encoding`
- Re-centered the canvas on both branches because the historical `1440x1200` baseline transform placed the callable too far down/right inside the current `1400x900` DevTools viewport.

## Artifacts

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-devtools-recovery/worktree-centered-open-scene.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-devtools-recovery/main-centered-open-scene.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-devtools-recovery/worktree-mode-click-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-devtools-recovery/main-mode-click-trace.json`

Discarded exploratory traces were kept in the same artifact directory because they were part of the failed interaction-harness attempts.

## Centered Scene Read

After re-centering, both branches exposed the same representative callable geometry again inside the current viewport:

- section left/top: `375 x 76`
- section size: about `243 x 423`
- `mode` row left/top:
  - worktree: `390.055 x 324.266`
  - untouched `main`: `390.638 x 323.063`

## Fresh DevTools Click Probe

Representative interaction attempt:

- one DevTools click on the inner `mode` row target after reload
- same centered `open` callable scene on both branches

Observed DevTools summary:

| Branch | URL | INP |
| --- | --- | ---: |
| untouched `main` | `http://127.0.0.1:3087/dry_slow` | `13 ms` |
| worktree | `http://127.0.0.1:3011/smooth_hawk` | `16 ms` |

Post-click DOM read on both branches:

- live `.cm-editor` count inside the `mode` row: `0`
- `:focus-within` on the `mode` row: `false`
- active element after the click probe: `BODY`

Interpretation:

- the old “DevTools bridge is dead” blocker is resolved
- the new blocker is interaction fidelity, not transport
- the current DevTools click path on the recreated scenes is still only producing a weak row-shell click, not a reliable live-editor activation
- because the live editor did not mount on either branch, this rerun is not comparable to the accepted earlier checkpoint traces and is not strong enough to accept checkpoint 1 or reopen the lower seam

## Conclusion

- Keep checkpoint 1 open.
- Do not take another lower-seam refactor from this read.
- The next step is to make the activation harness deterministic enough that the `mode` row demonstrably mounts the live `.cm-editor` on both branches before trusting another cold-trace compare.
