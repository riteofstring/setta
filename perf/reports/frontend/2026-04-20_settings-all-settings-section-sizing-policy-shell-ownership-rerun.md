# Settings All Settings Section Sizing Policy Shell Ownership Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior hotspot references:
- `perf/reports/frontend/2026-04-19_settings-all-settings-row-body-surface-ranking.md`
- `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md`
Focused proof:
- `frontend/tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts`
Dense probe:
- `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`

## Goal

Promote `settings-section__sectionSizingPolicy` from motion-only shell painting to full canvas-owned shell ownership so the largest measured row-body outlier uses the retained shell path at rest as well as during motion, while preserving the existing lightweight nested-child and first-click size-mode dropdown behavior.

## Why This Slice

- `perf/reports/frontend/2026-04-19_settings-all-settings-row-body-surface-ranking.md` ranked `settings-section__sectionSizingPolicy` as the largest remaining row-body surface on `All Settings`:
  - `rowCount: 211`
  - `remainingVisibleElementCount: 868`
- The current handoff explicitly disallows another arbitrary shell-sibling canary, but this section is the measured outlier rather than another convenience sibling.
- The retained-shell path, motion-hidden body path, and lightweight meta-control dropdown path were already in place for this section, so the bounded product step here is widening real graph-surface ownership rather than inventing a new seam.

## Implementation

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts`
  - added `SECTION_SIZING_POLICY_CANVAS_OWNED_SECTION_SHELL_ID`
  - promoted `settings-section__sectionSizingPolicy` into `CANVAS_OWNED_SECTION_SHELL_IDS`
  - kept `sectionSizingPolicy` on the lightweight nested-children lane even after shell ownership so the dense meta-control tree continues to use the existing flattened row-body primitive instead of regressing onto the heavier nested wrapper path
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - updated the shell-ownership expectation so `sectionSizingPolicy` is treated as a real shell canary
  - retained the lightweight nested-children and lightweight nested-row-body expectations for the same section
- `frontend/tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts`
  - tightened the focused proof to assert the outer section shell and inner `CustomResizable` now expose `data-canvas-owned-shell="true"` and transparent shell styling
  - kept the existing first-click size-mode dropdown activation proof intact

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
  - `settings-section__sectionSizingPolicy`
- Dense canary sibling proof:
  - `settings-section__browserSectionDefault`
  - `settings-section__promptSectionDefault`
  - `settings-section__languageServer`

## Fresh Dense Metrics

Fresh live rerun on the current worktree runtime recorded:

- `blankPanePoint: { x: 24, y: 60 }`
- `flowNodeCount: 46`
- `visibleFlowNodeCount: 46`
- `documentNodeCount: 5498`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 42.86`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1149.88`
- `longTasks.count: 8`
- `longTasks.totalMs: 5843`
- `longTasks.maxMs: 3443`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

## Interpretation

- This is a real graph-surface ownership step on the measured dense outlier, not another pure-forwarding seam lift and not another `ZoomPane` micro-pass.
- The dense canary stayed in the current improved runtime band, so the widened shell ownership appears safe rather than regressive.
- This is still not the missing whole-scene breakthrough by itself. The hotspot lane remains open on renderer-main JS / GC and broader graph-surface ownership beyond one section.
- The useful outcome of this slice is narrower and concrete:
  - `sectionSizingPolicy` now uses the retained shell path at rest
  - its large nested meta-control tree still keeps the existing lightweight nested-child flattening
  - first-click size-mode dropdown activation still works

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - result: `1 passed`, `27` tests
- Playwright focused + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-024/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-section-sizing-policy-meta-control-dropdown.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `3 passed (1.1m)`
- CDP visual check:
  - verified in a fresh headless DevTools sub-agent using a fresh one-shot bootstrap URL from `./scripts/dev-runtime-info.sh`
  - normalized to `/settings` with `All Settings` active and `fit view` applied
  - `sectionSizingPolicy` was visible on the graph surface
  - no obvious blank graph or detached shell/body artifact was visible on the checked lane
  - expected workspace chrome remained visible around the graph surface (left settings rail and a docked chat window), but it did not present as renderer noise
