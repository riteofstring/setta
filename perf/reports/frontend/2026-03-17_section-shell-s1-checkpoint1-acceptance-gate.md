# Section Shell S1 Checkpoint 1 Acceptance Gate

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Turn the current checkpoint-1 ambiguity into an explicit gate: either the lower shared row-contract pass is ready to accept, or one more compare is still required before the plan can move upward into `sectionChrome`.

## Read Back

The current evidence set is materially stronger than it was before the `GlobalVariables` representative landed:

- the lower CodeMirror activation seam has already been re-read and treated as locally exhausted
- focused underline parity is no longer a blocker under the deterministic dummy-node `mousedown` harness
- callable row hover/highlight and resize-handle placement were already brought back into near-pixel parity against untouched `main`
- the cross-section verification gap is now closed:
  - `Callable`
  - `Dict`
  - `GlobalVariables`
  - callable floated/window representative
  - `MetaControl` as a contrast surface
- focused unit and Playwright cross-section suites are green
- direct headed-browser `GlobalVariables` reads confirm that the shared row-contract split is real on another shared param section type beyond callable

## Why The Checkpoint Still Stays Open

That evidence is enough to stop adding new verification assets, but it does not yet replace the older mixed acceptance blocker:

- the recorded cold first-activation compare is still mixed against untouched `main`
- the active plan still says checkpoint 1 remains blocked until the lower pass regains a clearly non-regressing untouched-`main` vs worktree compare on the touched path
- the newer `GlobalVariables` read is a strong cross-section confirmation of the row-contract split, but it is not yet written as the accepted compare that clears the checkpoint

## Decision

- Keep checkpoint 1 open.
- Do not reopen the lower CodeMirror seam on the current evidence.
- Do not add more coverage or harnesses first.
- Capture one more explicit untouched-`main` vs worktree shared-row compare on the declared lower seam.
- Use that compare plus the already-green cross-section evidence set to make the final accept/reject call for checkpoint 1 before moving upward into `sectionChrome`.
