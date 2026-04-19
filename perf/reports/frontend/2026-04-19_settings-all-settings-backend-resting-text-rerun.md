# Settings All Settings Backend Resting Text Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `61dfa79be7` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior retained-canvas reference: `perf/reports/frontend/2026-04-19_settings-all-settings-language-server-nested-resting-text-rerun.md`
Focused canary: `frontend/tests/e2e/settings/settings-all-settings-backend-resting-text.spec.ts`
Ranking probe: `frontend/tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Record the next dense `settings` -> `All Settings` rerun after extending the existing canvas-owned resting-text path onto the remaining backend plain text-value rows in `settings-section__backend`, so `Auto Backup Freq`, `Auto Backup Keep Last N`, and `Default Terminal Shell` stop mounting live text-value DOM at rest.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication: fresh one-shot bootstrap tokens from `./scripts/dev-runtime-info.sh`
- Commands:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-014/worktree-ai.log -- tests/e2e/settings/settings-all-settings-backend-resting-text.spec.ts --reporter=line --workers=1`
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-014/worktree-ai.log -- tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts --reporter=line --workers=1`
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-014/worktree-ai.log -- tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Focused Runtime Proof

- Canonical target section: `settings-section__backend`
- Focused proof rows:
  - `settings-codeobj__backend__backend__autobackupFreq`
  - `settings-codeobj__backend__backend__autobackupKeepLastN`
  - `settings-codeobj__backend__backend__defaultTerminalShell`
- Focused canary attachment state on the live worktree surface:
  - `lightweightRestingTextCount: 3`
  - `underlineCount: 3`
  - `liveEditorCount: 0`
  - all three target rows exposed `data-canvas-owned-resting-text-lightweight="true"` with computed `opacity: 0`
  - first-click activation on `Default Terminal Shell` mounted exactly one live editor inline
  - `remainingLightweightRestingTextCount: 2` after activation
  - the focused row rect stayed stable with no measurable change in `x`, `y`, `width`, or `height`
- Focused canary caveat:
  - Playwright emitted the known unexpected API stderr line `POST /api/setActiveIds -> 404` during the activation pass, but the canary still passed and the inline editor mounted correctly

## Fresh Ranking

- Post-slice remaining value surface:
  - `mountedSectionCount: 46`
  - `totalRowCount: 759`
  - `totalRemainingValueRowCount: 18`
  - `totalRemainingValueElementCount: 27`
- Top remaining sections after this slice:
  1. `settings-section__backend`
     - `remainingValueElementCount: 9`
     - `remainingValueRowCount: 9`
     - every listed survivor row is already `lightweightSwitch`, with only `div.section-value` still left in DOM
  2. `settings-section__gui`
     - `remainingValueElementCount: 8`
     - `remainingValueRowCount: 4`
     - all surviving rows are `lightweightColorInput` wrappers with `div.section-value.single-cell-container` plus `i.single-cell-child`
  3. `settings-section__nestedParamCodeObjDefault`
     - `remainingValueElementCount: 6`
     - `remainingValueRowCount: 3`
     - this is now the highest non-lightweight text/value survivor family

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `6704`
- Inputs: `4`
- Textareas: `1`
- Buttons: `52`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `94.22ms`
- RAF p50: `83.4ms`
- RAF p95: `183.4ms`
- RAF max: `216.7ms`
- RAF frames over `16.7ms`: `173`
- RAF frames over `33.3ms`: `152`
- Long-task count: `128`
- Long-task total: `15021ms`
- Long-task max: `222ms`

## Comparison Vs. Prior Language Server Nested Resting Text Rerun

- Total remaining value rows: down `3` (`21` -> `18`)
- Total remaining value elements: down `12` (`39` -> `27`)
- Document nodes: down `9` (`6713` -> `6704`)
- Inputs: unchanged at `4`
- Buttons: unchanged at `52`
- RAF mean: effectively flat and slightly worse (`94.13ms` -> `94.22ms`)
- RAF p95: worse (`166.8ms` -> `183.4ms`)
- Long-task total: slightly worse (`14856ms` -> `15021ms`)

## Interpretation

- This slice closes the backend plain text-value lane instead of reopening the older backend dropdown lane or widening the shared switch value-shell boundary.
- The backend section is still the top remaining local survivor, but only because of already-lightweight switch rows that still leave one `div.section-value` shell in DOM per row.
- The broader dense-scene DOM surface moved again, but dense motion did not materially improve on this pass.
- Combined with the previous language-server slice, this is now another consecutive frontier pass without a meaningful dense-scene motion win, so the plan's replan trigger is met: do not keep default automation on more family-by-family harvesting without a stronger resting-body or overlay decision.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-backend-resting-text.spec.ts`
- Playwright canary:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-014/worktree-ai.log -- tests/e2e/settings/settings-all-settings-backend-resting-text.spec.ts --reporter=line --workers=1`
- Playwright ranking probe:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-014/worktree-ai.log -- tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts --reporter=line --workers=1`
- Playwright dense probe:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-014/worktree-ai.log -- tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all commands above passed locally on 2026-04-19
- CDP visual check:
  - done in a fresh headless DevTools sub-agent
  - `/settings` loaded with `All Settings` active and no visible crash/error overlay
  - exactly one retained `canvas` was visible inside `.react-flow__section-shell-backdrop`
  - `settings-section__backend` was present on the graph surface
  - `Auto Backup Freq`, `Auto Backup Keep Last N`, and `Default Terminal Shell` all looked intact at rest
  - caveat: `Default Terminal Shell` rendered `aria-disabled` in that CDP session, so the visual pass could not safely prove inline activation there; no blank or detached jump was observed
