# Section Shell S1 Checkpoint 1 Row-Contract Decision

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Decide whether the mixed deterministic `mousedown` rerun justifies one more lower CodeMirror activation pass or whether the stronger next move is now the shared row contract above it.

## Lower-Seam Read

Re-read the current lower activation files:

- `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
- `frontend/src/components/Utils/CodeMirror/getOnCreateEditor.ts`
- `frontend/src/components/Utils/CodeMirror/getExtensions.ts`
- `frontend/src/components/Utils/CodeMirror/codeMirrorLanguages.ts`
- `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx`

Conclusion:

- the already-landed lower-seam slices cover the stronger obvious activation/bootstrap work
- the old dummy-plus-hidden-real transition seam is gone from the worktree
- the only still-plausible lower reopen target is the unchanged non-empty dummy preview path in `DummyCodeMirror.tsx`

That remaining `DummyCodeMirror` path is real work:

- parser parse
- `highlightTree(...)`
- decoration building
- text/line rebuilding
- React line/span output

But on the current branch it now reads as pre-activation preview cost, not the main post-`mousedown` transition seam that the checkpoint has been tracing.

## Why The Decision Moves Outward

The deterministic `mousedown` compare is now good enough to say which direction still looks hot:

- worktree improvements:
  - `RunTask`
  - `FunctionCall`
  - `FireAnimationFrame`
- worktree losses:
  - `EventDispatch`
  - `UpdateLayoutTree`
  - `Layout`
  - `Paint`
  - `Commit`

That split is more consistent with the remaining shared row/layout contract than with another blind pass in the activation internals.

The stronger remaining branch-vs-`main` delta therefore lives in the row contract owners:

- `frontend/index.css`
- `frontend/src/components/Params/paramRowClassNames.ts`
- `frontend/src/components/Params/ParamRowShell.tsx`
- `frontend/src/components/Params/ParamContainer.tsx`
- `frontend/src/components/Params/GroupContainer.tsx`
- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`

## Decision

- Keep checkpoint 1 open.
- Do not reopen `TextInputCodeMirror` / `getExtensions` / `getOnCreateEditor` on the current evidence.
- Treat `DummyCodeMirror.tsx` as a trace-gated fallback only if a fresh rerun explicitly isolates the unchanged non-empty preview path.
- Move the checkpoint evidence read outward to the shared param-row contract before any move upward into `sectionChrome`.

## Remaining Evidence Gap

The plan still requires explicit verification across the declared row-contract verification set:

- `Callable`
- `Dict`
- `GlobalVariables`
- one floated/window param section
- `MetaControl` as a contrast check

The current tracker state has much stronger callable-side activation evidence than cross-section row-contract evidence, so the next pass should close that gap instead of taking another speculative lower code slice.
