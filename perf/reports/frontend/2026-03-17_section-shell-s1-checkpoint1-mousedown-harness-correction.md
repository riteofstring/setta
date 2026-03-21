# Section Shell S1 Checkpoint 1 Deterministic Mousedown Harness Correction

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Correct the focused-style interpretation from `2026-03-17_section-shell-s1-checkpoint1-mousedown-harness.md` without rewriting that earlier report.

## Correction

The earlier report treated a gray `borderBottomColor` on untouched `main` as evidence that the deterministic dummy-node `mousedown` harness was not producing the real focused underline state.

That read was too broad.

After a clean reload plus the same direct dummy-node `pointerdown` + `mousedown`, the row was re-read by enumerating every `.section-value` node inside the focused `mode` row:

- untouched `main` after activation:
  - live CodeMirror root exists
  - live CodeMirror root is `:focus-within`
  - active element role is `textbox`
  - the first `.section-value` is the live editor root and is not the underline element
  - the actual underline is the second sibling `.section-value` span, and its border turns blue: `rgb(96, 165, 250)`
- worktree after activation:
  - live CodeMirror root exists
  - active element role is `textbox`
  - the single wrapper `.section-value` is `:focus-within`
  - that wrapper border also turns blue: `rgb(96, 165, 250)`

## What Still Differs

The correction removes the supposed focused-underline regression, but the branches still use different real DOM contracts:

| Branch | Row shell | Underline owner | Live editor font path |
| --- | --- | --- | --- |
| untouched `main` | older grid row shell | sibling underline span | older bare `monospace` class path |
| worktree | newer flex row shell | wrapper `.section-value` | inherited `ui-monospace ... monospace` stack |

Those are real branch differences, but this corrected read does not prove a focused-style failure.

## Artifacts

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-devtools-recovery/main-mode-mousedown-focused-corrected.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-devtools-recovery/worktree-mode-mousedown-focused-corrected.png`

## Implication

- Keep the deterministic dummy-node `mousedown` harness.
- Keep the mixed trace result from the earlier mousedown report.
- Do not treat focused underline parity as the active blocker for checkpoint 1.
- The remaining decision is whether the mixed trace plus the known branch-structure differences justify one more lower-seam pass or whether this seam is exhausted enough to move upward.
