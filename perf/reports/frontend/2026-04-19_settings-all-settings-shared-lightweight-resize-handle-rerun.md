# Settings All Settings Shared Lightweight Resize-Handle Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior row-body reference: `perf/reports/frontend/2026-04-19_settings-all-settings-row-body-surface-ranking.md`
Focused canary: `frontend/tests/e2e/settings/settings-all-settings-lightweight-resize-handle-generalization.spec.ts`
Row-body ranking probe: `frontend/tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Land one shared row-chrome reduction by widening the existing single-node lightweight resize-handle primitive from the `sectionSizingPolicy` canary to the whole settings surface, instead of reopening another section-local resting-text/value cleanup.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication: fresh one-shot bootstrap tokens from `./scripts/run-playwright-against-runtime.sh`
- Commands:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-005/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-resize-handle-generalization.spec.ts --reporter=line --workers=1`
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-005/worktree-ai.log -- tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts --reporter=line --workers=1`
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-005/worktree-ai.log -- tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Focused Runtime Proof

- Canonical target section: `settings-section__chatSectionDefault`
- Sibling proof sections:
  - `settings-section__spreadsheetSectionDefault`
  - `settings-section__browserSectionDefault`
- Implementation shape:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now treats every settings section as part of the shared lightweight resize-handle lane instead of limiting the single-node handle to `sectionSizingPolicy`
  - focused proof now exists in:
    - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - `frontend/tests/e2e/settings/settings-all-settings-lightweight-resize-handle-generalization.spec.ts`
- Focused canary summary on the live worktree surface:
  - `settingsLightweightResizeHandleCount: 681`
  - `settingsLegacyResizeHandleCount: 0`
  - `sectionsWithLegacyResizeHandles: []`
  - `sectionsWithLightweightResizeHandles:` `45` mounted settings sections, including backend, browser, chat, chatWindowing, code/dropdown/text/switch param-codeobj sections, dict, draw, dropzone, globalVariables, gui, languageServer, prompt, sectionSizingPolicy, shortcuts, spreadsheet, stateMachineStart, taskBoard, terminal, textBlock, and time/date families
  - `settings-section__chatSectionDefault`: `rowCount 24`, `lightweightResizeHandleCount 21`, `legacyResizeHandleCount 0`
  - `settings-section__spreadsheetSectionDefault`: `rowCount 15`, `lightweightResizeHandleCount 14`, `legacyResizeHandleCount 0`
  - `settings-section__browserSectionDefault`: `rowCount 15`, `lightweightResizeHandleCount 14`, `legacyResizeHandleCount 0`

## Fresh Row-Body Ranking

- Whole-scene totals on the live worktree surface:
  - `mountedSectionCount: 46`
  - `totalRowCount: 759`
  - `totalRemainingRowCount: 755`
  - `totalRemainingVisibleElementCount: 1764`
  - `totalRemainingVisibleChromeElementCount: 1543`
  - `totalRemainingVisibleLabelElementCount: 215`
  - `totalRemainingVisibleValueElementCount: 6`
- Top remaining sections after the shared resize-handle rollout:
  1. `settings-section__sectionSizingPolicy`
     - `rowCount: 211`
     - `remainingVisibleElementCount: 868`
     - still dominated by nested row/article structure rather than the old nested resize-handle stack
  2. `settings-section__shortcuts`
     - `rowCount: 62`
     - `remainingVisibleElementCount: 62`
  3. `settings-section__spreadsheetSectionDefault`
     - `rowCount: 15`
     - `remainingVisibleElementCount: 35`
  4. `settings-section__languageServer`
     - `rowCount: 7`
     - `remainingVisibleElementCount: 31`
  5. `settings-section__groupSectionDefault`
     - `rowCount: 12`
     - `remainingVisibleElementCount: 29`
- New common remaining kinds across the mounted surface:
  1. `div.section-center.group-hover/arg-group:before:bg-setta-500/15.group-hover/arg-group:after:bg-setta-200.group-hover/arg-group:dark:after:bg-setta-500` (`755`)
  2. `p.section-key` (`203`)
  3. `article.section-key-value.group/arg-group.section-min-rows` (`74`)
  4. `p` (`12`)
  5. `article.section-args-nested.section-lg-value.group/arg-group.section-min-rows` (`4`)

## Captured Dense Metrics

- `documentNodeCount: 5658`
- `inputCount: 4`
- `textareaCount: 1`
- `buttonCount: 53`
- `canvasCount: 1`
- `raf.meanMs: 76.81`
- `raf.p95Ms: 133.4`
- `longTasks.totalMs: 11807`

## Comparison Vs. Prior Row-Body Ranking

- Remaining visible row-body descendants: down `1170` (`2934` -> `1764`)
- Remaining visible chrome descendants: down `1170` (`2713` -> `1543`)
- Remaining visible labels: unchanged at `215`
- Remaining visible values: unchanged at `6`
- Dominant common kinds:
  - old nested resize stack kinds `div.group/resize` (`544`) and bare child `div` (`543`) dropped out entirely
  - the surviving resize-handle cost is now the single lightweight `section-center` root per row
- Dense baseline:
  - `documentNodeCount`: down `1021` (`6679` -> `5658`)
  - `raf.meanMs`: improved (`101.3` -> `76.81`)
  - `raf.p95Ms`: improved (`183.4` -> `133.4`)
  - `longTasks.totalMs`: improved (`16263` -> `11807`)

## Interpretation

- This is a real shared row-chrome primitive, not another section-local survivor cleanup:
  - the old nested resize-handle stack is gone across the mounted settings surface
  - the row-body ranking confirms that `div.group/resize` and its nested child `div` are no longer part of the moving hotspot
  - the dense baseline improved materially on the same runtime family
- The remaining hotspot is no longer the old nested resize chrome. The next repeated DOM cost is:
  - the single lightweight `section-center` handle root that still remains interactive on each row
  - DOM-visible label/article structure such as `p.section-key` and row article wrappers
- Keep this shared resize-handle lane closed at its single-node boundary unless a future shared overlay/canvas decision can remove the remaining interactive root itself. The next default pass should target the broader label/article structure or a stronger inactive-row overlay/body primitive, not another handle-only follow-up by inertia.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-lightweight-resize-handle-generalization.spec.ts`
- Playwright focused canary:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-005/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-resize-handle-generalization.spec.ts --reporter=line --workers=1`
- Playwright row-body ranking:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-005/worktree-ai.log -- tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts --reporter=line --workers=1`
- Playwright dense probe:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-005/worktree-ai.log -- tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all commands above passed locally on 2026-04-19
  - the shared settings surface now reports `681` lightweight resize handles and `0` legacy resize handles
  - the row-body ranking and dense baseline both improved materially versus the prior row-body checkpoint
- CDP visual check:
  - done in a fresh headless DevTools sub-agent
  - `http://127.0.0.1:3068/settings` loaded through the bootstrap flow with `All Settings` active
  - no visible crash/error overlay was present
  - exactly one retained canvas was mounted under the graph surface
  - `settings-section__chatSectionDefault`, `settings-section__spreadsheetSectionDefault`, and `settings-section__browserSectionDefault` were visible and looked intact after the resize-handle rollout
