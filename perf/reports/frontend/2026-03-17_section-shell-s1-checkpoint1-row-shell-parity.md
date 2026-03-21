# Section Shell S1 Checkpoint 1 Row-Shell Parity Follow-up

Date: 2026-03-17
Worktree: `setta.frontend-performance-11`
Branch: `frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Scope

Repair the shared callable row-shell recreation after the flex conversion so the branch matches untouched `main` on:

- row hover/highlight
- resize-handle placement
- reorder/indent row geometry
- callable resize flow screenshots

This follow-up does not accept checkpoint 1 on its own. The cold `TextInputCodeMirror` activation trace is still the remaining blocker.

## Scenario

- Control scene: `busy_tide`
- Section: `zinc_blade`
- Callable: `open`
- Sampled rows:
  - `file`
  - `mode`
  - nested `errors`
- Compare surfaces:
  - untouched `main`: `http://127.0.0.1:3088/busy_tide`
  - worktree: `http://127.0.0.1:3036/busy_tide`

## CDP Visual Read

- Captured a static callable section screenshot on untouched `main` and the worktree after the shared row-shell recreation.
- Captured a hovered `mode` row screenshot on untouched `main` and the worktree.
- The visible handle now sits back on the label/value boundary instead of appearing on the value side of the row.
- The row hover/highlight band now visually aligns with untouched `main`.

## Sampled Geometry

Measured in Chrome DevTools from the live DOM after the recreation:

| Row | Metric | `main` | worktree | delta |
| --- | --- | ---: | ---: | ---: |
| `file` | row `x` | `388.137` | `387.555` | `-0.582` |
| `file` | row `width` | `218.926` | `219.509` | `+0.583` |
| `file` | handle `x` | `486.774` | `486.192` | `-0.583` |
| `file` | value `x` | `503.615` | `503.032` | `-0.583` |
| `mode` | row `x` | `388.137` | `387.555` | `-0.582` |
| `mode` | row `width` | `211.709` | `212.291` | `+0.583` |
| `mode` | handle `x` | `486.774` | `486.192` | `-0.583` |
| `mode` | value `x` | `503.615` | `503.032` | `-0.583` |
| `errors` | row `x` | `402.572` | `401.416` | `-1.156` |
| `errors` | row `width` | `197.274` | `198.430` | `+1.156` |
| `errors` | handle `x` | `501.209` | `500.053` | `-1.156` |
| `errors` | value `x` | `518.050` | `516.894` | `-1.156` |

The sampled rows are now within roughly a pixel of untouched `main`.

## Automated Verification

- Vitest:
  - `pnpm -C frontend exec vitest run src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts src/components/Utils/CodeMirror/useCodeMirrorTooltipParent.test.tsx src/components/Params/paramAreaObservers.test.ts src/components/Params/ResizeHandle.test.tsx src/components/Params/ParamRowShell.test.tsx src/components/Params/paramRowClassNames.test.ts src/components/Params/ParamContainer.test.tsx src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`
  - Result: `12` files passed, `30` tests passed
- Playwright:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/params-section-scroll.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - Result: `6 passed`

## Outcome

- Shared callable row hover/highlight parity: restored
- Shared resize-handle placement parity: restored
- Shared callable reorder/indent and resize suite: passing
- Checkpoint 1 acceptance: still blocked on the remaining cold activation trace, not on row-shell visual drift
