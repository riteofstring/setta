# Section Shell S1 Checkpoint 1 Deterministic Mousedown Harness

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Replace the weak generic DevTools click probe with the actual first-activation path for the disposable `open` control scene's `mode` row, then compare untouched `main` versus this worktree on a real cold mount.

## Activation Path Read

Focused source read plus the existing test coverage narrowed the first-activation contract:

- `TextInputCodeMirror.tsx` drives first activation from the dummy node's primary-button `mousedown`, not from `click`.
- `getOnCreateEditor.ts` consumes the stored pointer coordinates during the first live CodeMirror mount.
- `DummyCodeMirror.tsx` is still the pre-activation target on both branches after a clean reload.

That means a generic center-point click is not the right probe for this checkpoint, even if the row itself appears visible.

## Why The Old Click Probe Was Weak

Fresh hit-testing on the centered disposable scenes showed the same problem on both branches:

- the overview pane still sits ahead of the dummy `mode` field in `elementsFromPoint(...)`
- center-point DevTools clicks can land on the overlaying pane or ancestor row instead of the dummy node itself
- when that happens, the dummy node's `mousedown` handler never runs, so the live `.cm-editor` does not mount

This explains the earlier weak click rerun without treating it as a transport failure.

## Deterministic Harness

Clean reload procedure on both branches:

1. Reload the centered disposable scene back to the dummy state.
2. Target the actual dummy `mode` node id.
3. Dispatch a direct `pointerdown` plus primary-button `mousedown` on that node.
4. Wait for the live editor swap, then read the DOM and the saved trace.

Post-dispatch DOM result on both branches:

- dummy node removed
- live `.cm-editor` count inside the row: `1`
- row `:focus-within`: `true`
- active element role: `textbox`

This is a real activation harness for the first live mount, unlike the earlier generic click probe.

## Clean Reload Visual Split

The harness is reliable, but the focused `mode` row still differs between branches after the live mount:

| Branch | Row shell | `.section-value` display | Focus border | Live editor font |
| --- | --- | --- | --- | --- |
| untouched `main` | older grid-based `section-key-value ... grid ...` shell | `block` | `rgb(229, 231, 235)` | `monospace` |
| worktree | newer flex-based `section-param-row` shell | `flex` | `rgb(96, 165, 250)` | `ui-monospace ... monospace` |

Local diff read points at branch code rather than a flaky harness:

- `frontend/index.css` now defines the flex `section-param-row` / `.section-value` contract
- `frontend/src/components/Params/ParamRowShell.tsx`
- `frontend/src/components/Params/paramRowClassNames.ts`
- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`

So this rerun is measuring a real branch-state difference, not a bad DOM read.

## Trace Read

Artifacts:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-devtools-recovery/worktree-mode-mousedown-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-devtools-recovery/main-mode-mousedown-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-devtools-recovery/worktree-mode-mousedown-focused.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-devtools-recovery/main-mode-mousedown-focused.png`

Representative overlap totals inside the `mousedown` `EventDispatch` window:

| Metric | untouched `main` | worktree | Read |
| --- | ---: | ---: | --- |
| `EventDispatch` | `0.863 ms` | `6.304 ms` | regression |
| `RunTask` | `111.754 ms` | `88.383 ms` | improvement |
| `FunctionCall` | `98.122 ms` | `65.190 ms` | improvement |
| `UpdateLayoutTree` | `23.062 ms` | `29.761 ms` | regression |
| `Layout` | `1.987 ms` | `7.941 ms` | regression |
| `Paint` | `0.293 ms` | `0.643 ms` | regression |
| `Commit` | `0.096 ms` | `0.213 ms` | regression |
| `FireAnimationFrame` | `0.584 ms` | `0.148 ms` | improvement |

## Conclusion

- The checkpoint is no longer blocked by DevTools transport or by an unreliable interaction path.
- The deterministic dummy-node `mousedown` harness is the correct cold activation probe for this seam.
- The latest trace is still mixed.
- The rerun is also not acceptance-grade because the focused `mode` row still diverges from untouched `main`.

## Next Step

- Keep using this deterministic `mousedown` harness for any follow-up cold activation traces.
- Resolve or explicitly justify the focused row/input parity drift before deciding whether the lower activation seam deserves another refactor.
- If the parity-resolved rerun still points back down into the lower activation seam, reopen `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx` first.
