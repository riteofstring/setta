# Section Shell Phase S1 Checkpoint 1

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Phase: `Phase S1`
Checkpoint: `1`
Branch/Commit: `frontend-performance-11` @ `e0bdf91a7`

## Change Summary

This checkpoint candidate removes the shared row-container grid contract from the lower param shell without moving upward yet.

Code changes:

- Updated `frontend/index.css`.
- Updated `frontend/src/components/Params/paramRowClassNames.ts`.
- Updated `frontend/src/components/Params/GroupContainer.tsx`.
- Updated `frontend/src/components/Params/ParamContainer.tsx`.
- Updated `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`.
- Updated `frontend/src/components/Params/ParamItems/ParamTextLabel.tsx`.
- Added `frontend/src/components/Section/Layouts/CallableArea.test.tsx`.
- Added `frontend/src/components/Section/Layouts/GlobalVariablesArea.test.tsx`.
- Updated the focused lower-shell guardrails around the shared row contract.

Structural intent:

- replace the shared `section-args-nested` grid wrapper with a flex-column list shell
- replace the shared `section-param-row` grid shell with a flex row
- keep the row label/value contract explicit through child selectors instead of a shared grid-template
- preserve the existing section-level geometry while cutting row-shell DOM/layout complexity

Implementation detail:

- `section-args-nested` now owns only stacked list flow
- `section-param-row` now owns only row flex layout and the fixed label/value split
- pinned and unpinned `ParamGroupContainer` shells no longer mount the old grid/auto-row contract
- leaf labels and editable name inputs opt into the fixed label width through `param-row-label`
- the row error badge now carries an explicit `param-row-error` hook for the flex contract

## Automated Verification

Focused Vitest coverage:

```bash
pnpm -C frontend exec vitest run \
  src/components/Params/ParamRowShell.test.tsx \
  src/components/Params/paramRowClassNames.test.ts \
  src/components/Params/GroupContainer.test.tsx \
  src/components/Params/ParamContainer.test.tsx \
  src/components/Section/Layouts/DictArea.test.tsx \
  src/components/Section/Layouts/CallableArea.test.tsx \
  src/components/Section/Layouts/GlobalVariablesArea.test.tsx \
  src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx
```

Result:

- `8` files passed
- `22` tests passed

Representative Playwright coverage:

```bash
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/params/params-section-scroll.spec.ts \
  frontend/tests/e2e/params/callable-minimum-regression.spec.ts
```

Result:

- `6 passed`

Why these automated checks were used:

- the Vitest sweep locks the shared row contract directly and re-checks the affected section-type entry paths:
  - `Callable`
  - `Dict`
  - `GlobalVariables`
  - `MetaControl` contrast coverage
- the Playwright pair keeps the highest-value existing guards on:
  - params scroll-shell ownership
  - callable row/column resize flows
  - callable reorder / tab-indent behavior

## Chrome DevTools Main vs Worktree Compare

Representative pages:

- untouched `main`: `http://127.0.0.1:3088/busy_tide`
- worktree: `http://127.0.0.1:3036/busy_tide`

Representative control:

- the shared `zinc_blade` callable section on the same `busy_tide` project content
- viewport kept by the existing headed browser scene

Live visual compare:

- both branches rendered the same `zinc_blade` callable shell and the same visible row set:
  - `file`
  - `mode`
  - `encoding`
  - `errors`
  - `newline`
  - `closefd`
  - `opener`
- both branches kept the same outer section geometry:
  - section `243 x 423`
- both branches kept the same scroll-surface geometry to within `1px`:
  - `main`: `241 x 180`
  - worktree: `241 x 179`
- both branches kept the same row count:
  - `7`
- both branches kept the same resize-handle count:
  - `6`

Accepted structural DOM audit for the same section:

| Branch | Total nodes | Max depth | First row display |
| --- | ---: | ---: | --- |
| `main` | `124` | `12` | `grid` |
| worktree | `92` | `9` | `flex` |

Interpretation:

- the worktree removes `32` section-subtree nodes on the representative callable scene
- the worktree cuts subtree depth from `12` to `9`
- the row-shell contract is materially flatter on the live scene while preserving the outer callable geometry

Saved visual artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1/main-busy-tide-open-callable.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1/worktree-busy-tide-open-callable.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1/worktree-busy-tide-open-callable-focused-mode.png`

## Row Activation Trace Check

Representative interaction:

- fresh-load pointerdown on the `mode` row inside the same `zinc_blade` callable section

Saved trace artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1/main-mode-click-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1/worktree-mode-click-trace.json`

Observed DevTools summary:

| Branch | INP | Notes |
| --- | ---: | --- |
| `main` | `56 ms` | summary from the saved `main` trace stop |
| worktree | `90 ms` | `pointerdown`; `4 ms` input delay, `42 ms` processing, `44 ms` presentation |

Trace interpretation:

- this interaction read is mixed and currently worse on the worktree
- it is not strong enough to accept the checkpoint on its own
- the trace is also noisier than the structural DOM audit because the pages are carrying existing branch-level UI drift in the live dev scene

## Hard-Gate Regression Check

The checkpoint is still blocked on the touched row-input path.

Observed issue:

- after focusing the `mode` input on the worktree scene, the underline still does not visibly light up the way the user expects
- this means the reopened plan's hard acceptance check on text/code input focus feedback is not yet satisfied

Related follow-up slice:

- `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
- `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx`
- `frontend/src/components/Utils/CodeMirror/useCodeMirrorStyle.ts`
- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- `frontend/src/components/Params/ParamUIs/TextParamInput.tsx`

## Conclusion

- The row-container grid removal itself is implemented and verified across the touched section types.
- The checkpoint is **not accepted yet**.
- The blocking reasons are:
  - the row-input focus/underline regression is still visible on the touched path
  - the fresh row-activation trace is mixed and currently worse on the worktree
- The next step should stay in the same lower seam:
  - fix stable underline/focus ownership
  - close dummy-vs-real CodeMirror typography drift
  - re-check activation responsiveness
  - rerun the same `busy_tide` main-vs-worktree compare before considering the checkpoint accepted
