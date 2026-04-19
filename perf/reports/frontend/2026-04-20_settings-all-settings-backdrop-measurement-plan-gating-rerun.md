# Settings All Settings Backdrop Measurement Plan Gating Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`
Hotspot reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md`
Focused motion probe: `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Cut one shared retained-canvas measurement fanout on the canonical dense lane instead of extending another closed shell or wheel micro-pass.

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

## Implementation

- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now resolves a per-section backdrop measurement plan before wiring retained-canvas detail observers.
- Callable-only temporary height keys (`searchHeight`, `kwargsControlsHeight`, `pinnedParamsHeight`) now stay subscribed only on `settings-section__callableSectionDefault` instead of faning out across every other canvas-owned section.
- Per-section detail families now gate the retained-canvas measurement hooks so sections that cannot render filter icons, resting dropdown boxes, nested guides, or underlines stop creating unused `MutationObserver` / `ResizeObserver` pairs for those families.
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx` now locks the measurement-plan routing for callable, dict, browser, GUI, prompt, and `sectionSizingPolicy` lanes.

## Fresh Dense Rerun

Fresh live rerun on the current worktree runtime recorded:

- `documentNodeCount: 5498`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `raf.meanMs: 42.99`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1099.9`
- `longTasks.count: 8`
- `longTasks.totalMs: 5803`
- `longTasks.maxMs: 3443`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Focused motion-overlay proof on the same runtime still reports:

- initial state on `browserSectionDefault`, `promptSectionDefault`, and `languageServer`:
  - `hiddenHeaderControlsCount: 0`
  - `hiddenBodyCount: 0`
  - each section kept `childElementCount: 2` and `display: block`
- during one checked zoom interaction:
  - `hiddenHeaderControlsCount: 45`
  - `hiddenBodyCount: 45`
  - each checked section flipped to `childElementCount: 0` and `display: none`
- after settle:
  - `hiddenHeaderControlsCount: 0`
  - `hiddenBodyCount: 0`
  - each checked section restored `childElementCount: 2` and `display: block`

## Interpretation

- This is a bounded whole-scene reducer on the per-section retained-canvas measurement lane that the hotspot handoff called out as a credible shared `EventDispatch` / GC source.
- The dense canary stayed in the current best `~43ms` band while lowering long-task total to `5803ms`, so keep the gating as safe shared fanout cleanup rather than claiming a new motion breakthrough.
- Close this measurement-plan gating slice here instead of continuing to polish the same backdrop lane by inertia; the next default pass should move to the next trace-backed shared reducer or a broader graph-surface ownership step.

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before test collection, not by this slice
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-026/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.0m)`
- Chrome DevTools MCP:
  - verified in a fresh headless DevTools sub-agent after consuming a fresh bootstrap URL from `./scripts/dev-runtime-info.sh`
  - normalized to `/settings` with `All Settings` active and `fit view` applied
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` were visible on the graph surface
  - no obvious blank graph or detached shell/body artifact was visible
