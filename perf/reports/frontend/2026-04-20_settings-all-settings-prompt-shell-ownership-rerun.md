# Settings All Settings Prompt Shell Ownership Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense checkpoint: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md`
Prior shell-motion reference: `perf/reports/frontend/2026-04-20_settings-all-settings-browser-shell-ownership-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-prompt-shell-resting-text.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`

## Goal

Promote the dense-lane sibling `settings-section__promptSectionDefault` from resting-text-only ownership to a full canvas-owned shell frame on the retained `canvas-shell-underlay` path.

This widens the retained shell boundary one real step beyond the browser canary: keep the prompt section on the same retained resting-text/editor handoff, but make the prompt section's DOM shell transparent so the retained canvas owns the visible frame and header text at rest instead of only during motion.

## Implementation

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts`
  - adds `settings-section__promptSectionDefault` to `CANVAS_OWNED_SECTION_SHELL_IDS`
  - keeps the same section on the resting-text boundary through the shared prompt shell alias, so the existing retained-text measurements and motion-hidden path still apply
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - now proves the prompt section is a shell-owned canary
  - explicitly proves the prompt section is no longer part of the lightweight nested-children lane once the shell boundary widens
- `frontend/tests/e2e/settings/settings-all-settings-prompt-shell-resting-text.spec.ts`
  - verifies the prompt section DOM shell and inner `CustomResizable` surface report `data-canvas-owned-shell="true"`
  - confirms both DOM shell backgrounds are transparent while the retained canvas still paints the prompt title/resting text
  - uses the repo's real activation path (`mousedown` on the lightweight dummy input) and waits for the live CodeMirror editor to replace the dummy so first-click editing stays intact

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
- Surface:
  - `settings` -> `All Settings`
- Canonical target section for this slice:
  - `settings-section__promptSectionDefault`

## Focused Runtime Result

The live prompt-section probe confirmed:

- the section root exposed `data-canvas-owned-shell="true"`
- the inner `CustomResizable` surface exposed `data-canvas-owned-shell="true"`
- both the section root and the inner resizable surface computed `background-color: rgba(0, 0, 0, 0)`
- the retained canvas still painted a non-transparent header/title pixel for the same prompt section
- the hidden DOM resting-text dummy stayed lightweight:
  - `data-canvas-owned-resting-text-lightweight="true"`
  - `opacity: 0`
  - no nested syntax-highlight spans
- a synthetic left-button `mousedown` on the dummy input replaced it with one live `.cm-editor` inside the prompt section, so inline editing still activates on the first interaction without needing a second click

Interpretation:

- this is a real graph-surface ownership move on a second dense-lane sibling, not another viewport-persistence cleanup or forwarding-only seam lift
- the prompt section now hands its visible shell frame to the retained canvas even while idle, reusing the same retained text/editor handoff path that already existed on the resting-text lane
- this remains a bounded shell-ownership slice; do not treat it as evidence that the broader whole-scene hotspot has moved

## Dense Companion Result

Dense rerun on the same worktree runtime recorded:

- `documentNodeCount: 5496`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `raf.meanMs: 43`
- `raf.p95Ms: 50`
- `longTasks.totalMs: 6013`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md`:

- `documentNodeCount: 5494 -> 5496`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 43.28 -> 43`
- `raf.p95Ms: 33.4 -> 50`
- `longTasks.totalMs: 6076 -> 6013`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-browser-shell-ownership-rerun.md`:

- `documentNodeCount: 5490 -> 5496`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 46 -> 47`
- `raf.meanMs: 43 -> 43`
- `raf.p95Ms: 49.9 -> 50`
- `longTasks.totalMs: 6052 -> 6013`

Interpretation:

- the dense smoke stayed in the same improved runtime band, which is acceptable for this ownership expansion
- this is not a new whole-scene perf step-change; it is a renderer ownership move that keeps the prompt canary stable while widening the retained canvas frame boundary
- keep using `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md` as the clean whole-scene checkpoint rather than replacing it with this prompt shell report

## Verification

- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-prompt-shell-resting-text.spec.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - result: `1 passed (27 tests)`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-017/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-prompt-shell-resting-text.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (57.5s)`
- CDP visual check:
  - result: done (fresh headless Chrome DevTools pass on `/settings` with `All Settings` active and `promptSectionDefault` selected; the prompt section shell/frame looked present and intact with no obvious blank or detached shell/body artifact)
  - workspace chrome noise: top nav, left sidebar, and the bottom settings tabs remained visible around the graph surface

## Follow-up

- Keep the canonical dense whole-scene lane on `settings-section__browserSectionDefault`.
- Treat `settings-section__promptSectionDefault` as a completed shell-ownership sibling, not the new canonical target.
- The next bounded product pass should either widen shell ownership to one more dense-lane sibling only if that still changes real renderer ownership, or return to a trace-backed whole-scene renderer-main reduction / stronger graph-surface step.
