# Settings Graph Substrate Canary Viewport Layer Promotion

Date: 2026-04-12
Worktree: `pixijs-graph`
Canonical lane: normalized `All Settings` focused on `rotaryParamCodeObjDefault`

## Summary

- Goal: move the canary viewport transform onto a compositor-friendly path so
  the graph surface itself, not just inner section chrome, is promoted during
  pan/zoom motion.
- Product slice:
  - `resolveSettingsGraphSubstrateCanaryViewportTransform(...)` now emits
    `translate3d(..., 0) scale(...)`
  - the canary viewport layer now opts into `will-change: transform`,
    `backface-visibility: hidden`, and `contain: layout paint style`
- Scope: no presentation-ownership or oracle helper changes; this is a bounded
  product-side viewport-presentation adjustment on the existing canary lane.

## Verification

Commands:

```bash
pnpm -C frontend exec prettier --write src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryController.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryController.test.tsx

pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryController.test.tsx

scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-005/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-005/main-ai.log
```

Results:

- Focused unit coverage passed:
  - `SettingsGraphSubstrateCanary.test.tsx`
  - `settingsGraphSubstrateCanaryController.test.tsx`
- Canonical cross-worktree motion probe reached a real numeric verdict on both
  sides, then failed on the reference threshold:
  - reference legacy:
    - average `142.04ms`
    - max `450ms`
    - `44` samples
    - root DOM `9527`
    - editable controls `129`
    - visible sections `46`
  - worktree canary:
    - average `38.64ms`
    - max `366.6ms`
    - `44` samples
    - root DOM `135`
    - editable controls `2`
    - visible sections `1`
    - dominant canary motion owner:
      - `interactionReactFlowStateSync` with `7` calls and `2.8ms` total
- CDP visual check:
  - worktree `http://127.0.0.1:3075/settings`
  - reference `http://127.0.0.1:3087/settings`
  - `All Settings` surface mounted on both sides
  - no obvious new layout, clipping, or viewport-drift artifact from the
    viewport-promotion change

## Reading

- This runtime suggests the viewport-layer promotion helped the worktree canary
  on the canonical lane: the canary side came in below the existing
  `averageFrameDurationMs < 40` threshold while the visual gate stayed clean.
- The automated gate is still red because the read-only `main` reference became
  unhealthy/noisy again rather than because the canary regressed:
  - reference root DOM inflated from the usual `~7628` range to `9527`
  - reference editable controls also rose above the usual `99` baseline to
    `129`
- The next bounded frontier should pivot to the repeated reference-side
  normalization / health blocker instead of reopening this viewport slice.
