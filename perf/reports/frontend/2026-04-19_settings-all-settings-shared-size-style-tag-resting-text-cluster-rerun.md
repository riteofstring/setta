# Settings All Settings Shared Size Style Tag Resting Text Cluster Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Best clean dense checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-gen-python-resting-text-cluster-rerun.md`
Prior ranking reference: `perf/reports/frontend/2026-04-19_settings-all-settings-remaining-value-surface-ranking.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-size-style-tag-resting-text-cluster.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Move the repeated `Size` / `Height` / `Width` / `Style Color` / `Tag Color` text-value family onto the retained resting-text primitive across the top repeated settings sections instead of reopening another section-local lane.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - focused probe: Playwright Chromium, headless Linux
  - dense probe: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication:
  - probes used fresh one-shot bootstrap tokens via `./scripts/run-playwright-against-runtime.sh`
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-007/worktree-ai.log -- tests/e2e/settings/settings-all-settings-size-style-tag-resting-text-cluster.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Focused Cluster Summary

Canonical target section:

- `settings-section__stateMachineEndSectionDefault`

Sibling proof sections checked in the same slice:

- `settings-section__listRootSectionDefault`
- `settings-section__terminalSectionDefault`

Focused probe output:

- `settings-section__stateMachineEndSectionDefault`
  - canonical row: `settings-codeobj__stateMachineEndSectionDefault__stateMachineEndSectionDefault__size__height`
  - `lightweightRestingTextCount: 6`
  - `underlineCount: 6`
  - `inputOpacity: 0`
  - `lightweightOwnershipFlag: true`
  - `inputDistinctPixelCount: 5456`
- `settings-section__listRootSectionDefault`
  - canonical row: `settings-codeobj__listRootSectionDefault__listRootSectionDefault__styleColor`
  - `lightweightRestingTextCount: 6`
  - `underlineCount: 6`
  - `inputOpacity: 0`
  - `lightweightOwnershipFlag: true`
  - `inputDistinctPixelCount: 5698`
- `settings-section__terminalSectionDefault`
  - canonical row: `settings-codeobj__terminalSectionDefault__terminalSectionDefault__tagColor`
  - `lightweightRestingTextCount: 4`
  - `underlineCount: 4`
  - `inputOpacity: 0`
  - `lightweightOwnershipFlag: true`
  - `inputDistinctPixelCount: 5439`

Interpretation:

- the repeated settings value family now rides the existing retained resting-text primitive on the live surface instead of remaining fully DOM-visible
- the focused proof stayed on the real ownership boundary:
  - DOM resting text is transparent at rest
  - the retained canvas paints visible text in the same graph-space area
  - focusing the canonical `ParamInput` roots still surfaced inline editors

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `6962`
- Inputs: `4`
- Textareas: `1`
- Buttons: `52`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `99.44ms`
- RAF p50: `83.4ms`
- RAF p95: `183.4ms`
- RAF max: `250ms`
- RAF frames over `16.7ms`: `177`
- RAF frames over `33.3ms`: `158`
- Long-task count: `132`
- Long-task total: `15955ms`
- Long-task max: `236ms`

## Comparison Notes

- Versus the remaining-value ranking rerun (`7088 / 4 / 52`):
  - `documentNodeCount` moved down by `126`
  - `buttonCount` stayed flat-to-noisy on the same runtime family
  - this is a real dense mounted-surface reduction, not just a probe rewrite
- Versus the untouched-trio rerun (`7093 / 4 / 53`):
  - `documentNodeCount` moved down by `131`
- Versus the best clean checkpoint (`7670 / 2 / 39`):
  - document-level DOM remains well below that checkpoint on this runtime family
  - `input` / `button` totals still carry non-target workspace-chrome noise, so treat this report as a shared-family ownership proof plus smoke-level dense checkpoint rather than a new clean interactive-core benchmark

## Interpretation

- This slice follows the current plan checkpoint:
  - it starts from the whole-scene ranking
  - it targets the top repeated shared value family instead of another local cleanup lane
  - it keeps the change at the existing retained-text ownership boundary
- The branch goal is still open:
  - dense `All Settings` motion remains far above the `33.3ms` budget
  - the next frontier should come from the fresh remaining-value ranking after this family move, not by reopening this lane for polish by inertia

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-size-style-tag-resting-text-cluster.spec.ts`
- Playwright focused cluster probe + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-007/worktree-ai.log -- tests/e2e/settings/settings-all-settings-size-style-tag-resting-text-cluster.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused probe produced the cluster summary recorded above
  - the dense probe emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
