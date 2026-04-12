# Settings Graph Pixi Resolution Identity Reuse

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Reduce avoidable work inside the measured dominant motion owner
`pixiDrawableModelResolve` without changing renderer behavior.

## Change

- updated
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiModel.ts`
  so the resolver now:
  - reuses prior per-section cache entries when the section's drawable inputs
    are unchanged
  - reuses the prior drawable array and cache map identity when the full
    presented resolution is unchanged
- updated
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.tsx`
  to pass the previous drawable array into the resolver
- added focused regression coverage in
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiModel.test.ts`
  for:
  - full-resolution identity reuse
  - selective cache-entry reuse when one section invalidates

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiModel.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts`
  - passed (`3` files, `20` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiModel.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiModel.test.ts`
  - passed
- Chrome DevTools MCP visual smoke against worktree `3075` and read-only
  `main` `3087`
  - both `/settings` surfaces mounted cleanly with the graph substrate area
    visible
  - no obvious new visual drift observed for this slice

## Notes

- This is a product-side perf slice, not a new oracle/probe lane.
- No fresh numeric perf probe was run in this iteration; the next pass should
  measure whether the canonical lane's dominant owner or average motion cost
  changed after this reuse path landed.
