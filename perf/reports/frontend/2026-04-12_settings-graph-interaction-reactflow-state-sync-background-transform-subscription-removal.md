# Settings Graph `interactionReactFlowStateSync`: background transform subscription removal

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`
Owner: `interactionReactFlowStateSync`

## Slice

- Removed the render-path React Flow `transform` subscription from
  `frontend/src/forks/xyflow/background/Background.tsx`.
- `BackgroundCore` now renders from the current transform once and keeps the
  SVG pattern attributes synchronized imperatively via
  `useReactFlow.subscribe(...)`.
- Extended `frontend/src/forks/xyflow/background/Patterns.tsx` so the dot/line
  pattern nodes can be updated through refs without re-committing the mounted
  background subtree.
- Added focused profiler coverage in
  `frontend/src/forks/xyflow/background/Background.test.tsx` to assert:
  - the mounted background pattern does not commit when only the React Flow
    transform changes
  - the rendered SVG pattern attributes still update to the latest viewport
    transform

## Expected effect

- Keeps the graph background/grid layer out of pan/zoom transform commits on
  the legacy React Flow surface while preserving the same visual pattern motion.

## Verification

- `pnpm -C frontend exec vitest run src/forks/xyflow/background/Background.test.tsx`
  - passed (`1` file, `1` test)
- `pnpm -C frontend exec prettier --check src/forks/xyflow/background/Background.tsx src/forks/xyflow/background/Patterns.tsx src/forks/xyflow/background/Background.test.tsx`
  - passed
- headless Chrome DevTools MCP smoke on worktree `/settings`
  - first fresh-context bootstrap attempt failed because the refreshed
    bootstrap token was rejected in the DevTools profile
  - one bounded worktree lifecycle recovery (`BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`) restored the worktree runtime
  - retry against direct `http://127.0.0.1:3075/settings` succeeded in the
    authenticated DevTools profile
  - the settings surface mounted with app chrome and a centered loading
    indicator visible; no obvious blank white screen, background/grid
    disappearance, or layout collapse was observed during the smoke check

## Reading

- This is another bounded product-side reduction on an always-mounted
  motion-path surface inside the measured `interactionReactFlowStateSync`
  owner, not another harness-only pass.
- The next bounded frontier should either rerun attribution once the canonical
  probe family is trustworthy again or keep isolating similarly wide mounted
  transform subscribers on the live motion path.
