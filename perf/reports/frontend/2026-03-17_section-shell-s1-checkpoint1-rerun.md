# Section Shell Phase S1 Checkpoint 1 Rerun

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Phase: `Phase S1`
Checkpoint: `1`
Branch/Commit: `frontend-performance-11` @ `45bacd9f1`

## Change Summary

This rerun stays inside the reopened lower param-row seam after the flex row-shell conversion.

Code changes:

- Updated `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`.
- Updated `frontend/src/components/Utils/CodeMirror/useCodeMirrorStyle.ts`.
- Updated `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`.
- Updated `frontend/src/components/Params/ParamUIs/ParamUI.tsx`.
- Updated `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts`.

Structural intent:

- keep the live CodeMirror mounted after first activation instead of paying a blur-triggered remount
- move the visible underline ownership onto stable row wrappers inside the new flex shell
- restore dummy-vs-real mono font parity on the touched value path
- lock the new live-editor persistence behavior with a focused unit guardrail

## Automated Verification

Focused Vitest coverage:

```bash
pnpm -C frontend exec vitest run \
  src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts \
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

- `9` files passed
- `26` tests passed

Representative Playwright coverage:

```bash
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/params/params-section-scroll.spec.ts \
  frontend/tests/e2e/params/callable-minimum-regression.spec.ts
```

Result:

- `6 passed`

## Chrome DevTools Main vs Worktree Compare

Representative pages:

- untouched `main`: `http://127.0.0.1:3088/busy_tide`
- worktree: `http://127.0.0.1:3036/busy_tide`

Representative control:

- the shared `zinc_blade` callable section on the same `busy_tide` project content
- the touched `mode` row inside that callable shell

Focused visual compare:

- both branches now show the expected blue underline on the active `mode` field
- both branches now render the active `mode` field with a mono font
- the worktree focused wrapper reports:
  - `border-bottom-color: rgb(96, 165, 250)`
  - `:focus-within = true`
  - live editor font family = `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`

Saved rerun artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-rerun/main-busy-tide-mode-row-focused.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-rerun/worktree-busy-tide-mode-row-focused.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-rerun/main-mode-click-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-rerun/worktree-mode-click-trace.json`

## Cold Activation Trace Check

Representative interaction:

- fresh-load pointerdown on the `mode` row inside the same `zinc_blade` callable section

Trace window:

- `+100ms` after the `mousedown` `EventDispatch` in each saved trace

Observed category totals:

| Branch | EventDispatch | RunTask | FunctionCall | UpdateLayoutTree | Layout | Paint | Commit | TimerFire | FireAnimationFrame |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `main` | `3.446ms` | `109.704ms` | `95.525ms` | `38.075ms` | `10.928ms` | `0.573ms` | `0.543ms` | `0.079ms` | `0.343ms` |
| worktree | `3.588ms` | `109.357ms` | `98.821ms` | `40.231ms` | `11.278ms` | `0.556ms` | `0.133ms` | `0.000ms` | `0.295ms` |

Interpretation:

- the rerun is no longer blocked by the old visual parity regressions
- the cold first-activation path is still only mixed against untouched `main`
- the worktree wins `Commit`, `TimerFire`, and `FireAnimationFrame`
- the worktree is still slightly higher on `EventDispatch`, `FunctionCall`, `UpdateLayoutTree`, and `Layout`
- `RunTask` is effectively flat, so this is not a convincing improvement on the user-reported initial activation delay

## Conclusion

- The row-input visual parity regressions are fixed on the touched `mode` field.
- The checkpoint is still **not accepted yet**.
- The remaining blocker is the cold CodeMirror activation path, not the underline/font parity path.
- The next step should stay inside the same lower seam and target:
  - `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
  - `frontend/src/components/Utils/CodeMirror/getExtensions.ts`
  - `frontend/src/components/Utils/CodeMirror/getOnCreateEditor.ts`
  - `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - the mirrored param-input affordance copies in `frontend/src/components/App/appRegistry.tsx`
