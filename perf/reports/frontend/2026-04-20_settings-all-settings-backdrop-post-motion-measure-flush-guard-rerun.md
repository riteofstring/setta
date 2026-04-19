# Settings All Settings Backdrop Post-Motion Measure Flush Guard Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline checkpoint: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`

## Goal

Remove one remaining retained-detail invalidation on the canonical browser lane by stopping `SectionShellBackdropCanvas` from forcing a fresh post-motion remeasure after every viewport interaction settle when nothing actually changed.

## Implementation

- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx`
  - narrowed the suspend/resume bookkeeping in `useCanvasOwnedMeasuredArray(...)`
  - entering `viewportInteractionActive` now preserves a pending flush only when a measurement RAF was already queued
  - settling interaction still flushes real observer-driven invalidations, but no longer remeasures every enabled detail family just because interaction toggled
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - added focused coverage that stubs `requestAnimationFrame(...)` and proves interaction start/settle with no invalidation does not schedule extra retained-detail measurement frames

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
  - Chrome DevTools MCP, headless Chromium
- Surface:
  - `settings` -> `All Settings`
- Canonical target section:
  - `settings-section__browserSectionDefault`
- Sibling proof sections:
  - `settings-section__promptSectionDefault`
  - `settings-section__languageServer`

## Fresh Dense Metrics

Fresh live rerun on the current worktree runtime recorded:

- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 57.98`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 100`
- `raf.maxMs: 1516.7`
- `longTasks.count: 15`
- `longTasks.totalMs: 5196`
- `longTasks.maxMs: 830`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 118 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`
- `motionHiddenSubtreeChurn.childListMutationCount: 0`
- `motionHiddenSubtreeChurn.subtreeRemovedElementCount: 0`
- `motionHiddenSubtreeChurn.subtreeAddedElementCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-motion-hidden-body-retention-rerun.md` on the same browser lane:

- `documentNodeCount: 5494 -> 5494`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 49.16 -> 57.98`
- `raf.p95Ms: 83.3 -> 100`
- `longTasks.totalMs: 4139 -> 5196`
- `motionHiddenSubtreeChurn.subtreeRemovedElementCount: 0 -> 0`
- `motionHiddenSubtreeChurn.subtreeAddedElementCount: 0 -> 0`

## Interpretation

- This is a bounded retained-detail invalidation cleanup on the canonical browser lane, not a new whole-scene checkpoint.
- The code now stops the unconditional post-motion measurement flush path itself; the added focused test locks that behavior even though the repo-wide jsdom / `html-encoding-sniffer` failure still blocked executing this file under Vitest.
- The fresh dense rerun stayed noisy in headless mode and did not produce a whole-scene win, so keep `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md` as the clean comparison checkpoint.
- The next pass should move to another retained-scene redraw / paint / snapshot invalidation candidate instead of reopening observer timing or motion-hidden body retention on this lane.

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before collection, not by this slice
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.Tkw5gG/loop-001/run-005/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.0m)`
- CDP visual check:
  - done in a fresh headless DevTools sub-agent after consuming a fresh bootstrap URL
  - reached `http://127.0.0.1:3068/settings` with `All Settings` active
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` were present on-screen
  - the graph surface was rendered and not blank/transparent, and there was no obvious detached shell/body artifact on that lane
