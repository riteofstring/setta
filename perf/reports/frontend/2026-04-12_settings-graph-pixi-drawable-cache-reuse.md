## Summary

Land one bounded product-side perf slice on the canonical
`rotaryParamCodeObjDefault` lane by reusing per-section Pixi shell drawable
models when the section's drawable inputs are unchanged across motion frames.

## What changed

- Added a per-section drawable cache in
  `settingsGraphSubstrateCanarySectionShellPixiModel.ts` keyed by the actual
  drawable inputs that affect Pixi shell output.
- Updated
  `SettingsGraphSubstrateCanarySectionShellPixiLayer.tsx`
  to feed the previous cache back into drawable resolution on the next render.
- Added focused model tests to prove unchanged sections reuse cached drawable
  objects while changed sections still invalidate and rebuild.

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiModel.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts`
  - passed (`3` files, `18` tests)
- `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-012/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-012/main-ai.log`
  - resolved worktree `3075/8075` and main `3087/8087`
  - progressed through read-only `main` bootstrap/open-settings and both sides'
    project-config/project-state/view-mode/target-section resolution
  - failed before numeric perf output with:
    `Timed out after 30000ms during settings graph probe phase: worktree: capture initial pane state.`
- Chrome DevTools MCP smoke
  - worktree `http://127.0.0.1:3075/settings` and main
    `http://127.0.0.1:3087/settings` both mounted the settings surface
  - no obvious visual drift or blank canary state from the inspected view

## Reading

- This slice reduces avoidable work inside `pixiDrawableModelResolve` by
  skipping shell model rebuilds for sections whose drawable inputs are stable.
- The canonical probe did not reach numeric motion output on this runtime, so
  this pass does not claim a measured win yet.
- The next bounded frontier should classify why the live worktree stalls at
  `capture initial pane state` on the canonical lane or recover that preflight
  before judging the remaining dominant motion owner.
