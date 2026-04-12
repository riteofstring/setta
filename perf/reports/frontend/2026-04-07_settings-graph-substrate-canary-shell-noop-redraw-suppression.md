# Settings Graph Substrate Canary Shell No-Op Redraw Suppression

Date: 2026-04-07
Worktree: `pixijs-graph`
Canonical target section: `rotaryParamCodeObjDefault`

## Change

Reused the previous Pixi shell drawable array when the newly resolved shell
output is semantically identical.

This keeps no-op controller rerenders from forcing another full-shell
`graphics.clear()` plus `app.render()` pass.

## Baseline before this slice

Source: the focused shell-layer redraw harness added for this slice.

- initial mount plus one semantically identical rerender triggered `2`
  `app.render()` calls
- a guaranteed drawable change still needed another draw pass

## After this slice

Measurement command:

```bash
pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiModel.test.ts
```

Observed results from the passing layer test:

- initial mount plus one semantically identical rerender now stays at `1`
  `app.render()` call
- a real drawable change still advances to `2` `app.render()` calls

## Live canary note

The required live `All Settings` canonical probe did not produce a trustworthy
performance snapshot in this pass.

- direct Playwright on the loop runtime at `3076/8076` timed out waiting for
  `[data-testid="graph-substrate-canary"]`
- one bounded `aireset` recovery moved the worktree to `3075/8075`, but the
  same canonical probe timed out on the same missing-canary wait there too

This slice is therefore landed with focused redraw-harness evidence, while the
next iteration must recover the live canary mount before claiming a fresh
normalized `All Settings` measurement.
