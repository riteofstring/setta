# Settings All Settings Backdrop Observer-Suspension Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior clean checkpoint: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`
Focused motion proof: `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`

## Goal

Remove one concrete retained-canvas redraw/re-measure path on the canonical `settings-section__browserSectionDefault` lane by keeping enabled backdrop measurement observers wired through `viewportInteractionActive` instead of tearing them down and recreating them on every motion toggle.

## Implementation

- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx`
  - added a shared retained-detail measurement helper so enabled backdrop detail families can keep their `ResizeObserver` / `MutationObserver` wiring stable across `viewportInteractionActive` transitions
  - measurement plans still disable inapplicable detail families entirely, but active families now suspend only the RAF measurement work during motion instead of disconnecting and rebuilding the observer graph at interaction start and settle
  - kept the existing per-family measurement comparators and DOM queries intact so the slice changes observer lifecycle, not the rendered detail geometry logic
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - added focused coverage proving the browser retained-text lane does not recreate backdrop observers when `viewportInteractionActive` toggles

## Scenario

- Runtime:
  - worktree self-recovered with `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
  - frontend: `http://127.0.0.1:3069/`
  - backend: `http://127.0.0.1:8069`
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

Fresh live rerun on the restarted runtime recorded:

- blank pane point: `x=24`, `y=60`
- `flowNodeCount: 46`
- `visibleFlowNodeCount: 46`
- `projectChatChromeCount: 0`
- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `codeMirrorCount: 0`
- `raf.meanMs: 44.82`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 33.4`
- `raf.maxMs: 1183.3`
- `longTasks.count: 8`
- `longTasks.totalMs: 6544`
- `longTasks.maxMs: 4025`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against the current clean whole-scene checkpoint in `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`:

- `documentNodeCount: 5494 -> 5494`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 42.58 -> 44.82`
- `raf.p95Ms: 50 -> 33.4`
- `raf.maxMs: 1050.06 -> 1183.3`
- `longTasks.count: 8 -> 8`
- `longTasks.totalMs: 5844 -> 6544`
- `longTasks.maxMs: 3553 -> 4025`
- `motionHiddenBodies.totalMotionBodyRootCount: 45 -> 45`
- `motionHiddenBodies.peakHiddenBodyCount: 45 -> 45`

## Focused Motion Proof

The focused motion-overlay proof on the same restarted runtime still recorded:

- initial state on `browserSectionDefault`, `promptSectionDefault`, and `languageServer`:
  - `hiddenHeaderControlsCount: 0`
  - `hiddenBodyCount: 0`
  - each checked section kept `childElementCount: 2` and `display: block`
- during one checked zoom interaction:
  - `hiddenHeaderControlsCount: 45`
  - `hiddenBodyCount: 45`
  - each checked section flipped to `childElementCount: 0` and `display: none`
- after settle:
  - `hiddenHeaderControlsCount: 0`
  - `hiddenBodyCount: 0`
  - each checked section restored `childElementCount: 2` and `display: block`

## Interpretation

- This is a real retained-graph structural cleanup on the redraw/re-measure lane named in the handoff: enabled backdrop measurement families no longer churn observer instances at every `viewportInteractionActive` toggle.
- The live canary stayed visually intact on both the focused motion proof and the CDP check, so keeping observers wired did not reopen blank-canvas or detached shell/body behavior.
- The restarted dense rerun did not produce a new whole-scene win and came back noisier than the current clean checkpoint, so this slice should be kept as structural closure of one concrete path, not as a new performance milestone.
- Close the backdrop observer-churn lane here. The next default pass should move to another retained-graph candidate such as retained-scene paint invalidation, snapshot invalidation/reuse beyond the observer lifecycle, or motion-hidden-body orchestration that still fires even with the visible row-body frontier at zero.

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before test collection, not by this slice
- Playwright:
  - the standard runtime helper still reported `frontendUrl: null` after the bounded `./aireset.sh` recovery, so this rerun used a fresh bootstrap token from `./scripts/dev-runtime-info.sh` with the restarted `3069/8069` runtime values
  - result: `2 passed (1.6m)` for `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts` and `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
- Chrome DevTools MCP:
  - verified in a fresh headless DevTools sub-agent after consuming a fresh bootstrap URL from `./scripts/dev-runtime-info.sh`
  - normalized to `/settings` with `All Settings` active
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` were present on a visibly rendered graph surface
  - no obvious blank/transparent canvas or detached shell/body artifact was visible
  - normal right-side chat window chrome remained visible as noise
