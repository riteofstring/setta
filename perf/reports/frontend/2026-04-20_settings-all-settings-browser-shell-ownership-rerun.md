# Settings All Settings Browser Shell Ownership Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense checkpoint: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md`
Prior shell-motion reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-handoff-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-browser-resting-text.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`

## Goal

Promote the canonical dense-lane target `settings-section__browserSectionDefault` from resting-text-only ownership to a full canvas-owned shell frame on the retained `canvas-shell-underlay` path.

This is the first bounded browser-section graph-surface step after the viewport-interaction cleanup passes: keep first-click inline editing, but make the browser section's DOM shell transparent so the retained canvas owns the visible frame and header text at rest instead of only during motion.

## Implementation

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts`
  - adds `settings-section__browserSectionDefault` to `CANVAS_OWNED_SECTION_SHELL_IDS`
  - keeps the same section on the resting-text boundary through the shared shell id alias, so the existing retained-text measurements and motion-hidden path still apply
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - now proves the browser section is a shell-owned canary
  - explicitly proves the browser section is no longer part of the lightweight nested-children lane once the shell boundary widens
- `frontend/tests/e2e/settings/settings-all-settings-browser-resting-text.spec.ts`
  - now verifies the browser section DOM shell and inner resizable surface report `data-canvas-owned-shell="true"`
  - confirms both DOM shell backgrounds are transparent while the retained canvas still paints the browser title/resting text
  - uses the repo's real activation path (`mousedown` on the lightweight dummy input) and waits for the live CodeMirror editor to replace the dummy so first-click editing stays intact

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
- Surface:
  - `settings` -> `All Settings`
- Canonical target section:
  - `settings-section__browserSectionDefault`

## Focused Runtime Result

The live browser-section probe confirmed:

- the section root exposed `data-canvas-owned-shell="true"`
- the inner `CustomResizable` surface exposed `data-canvas-owned-shell="true"`
- both the section root and the inner resizable surface computed `background-color: rgba(0, 0, 0, 0)`
- the retained canvas still painted a non-transparent header/title pixel for the same browser section
- the hidden DOM resting-text dummy stayed lightweight:
  - `data-canvas-owned-resting-text-lightweight="true"`
  - `opacity: 0`
  - no nested syntax-highlight spans
- a synthetic left-button `mousedown` on the dummy input replaced it with one live `.cm-editor` inside the browser section, so inline editing still activates on the first interaction without needing a second click

Interpretation:

- this is a real graph-surface ownership move on the canonical dense canary, not another forwarding-only seam lift
- the browser section now hands its visible shell frame to the retained canvas even while idle, reusing the same retained text/editor handoff path that already existed on the resting-text lane
- the focused proof is intentionally browser-only for this pass; do not assume prompt/languageServer are on the widened shell boundary yet

## Dense Companion Result

Dense rerun on the same worktree runtime recorded:

- `documentNodeCount: 5490`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 46`
- `raf.meanMs: 43`
- `raf.p95Ms: 49.9`
- `longTasks.totalMs: 6052`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md`:

- `documentNodeCount: 5494 -> 5490`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 46`
- `raf.meanMs: 43.28 -> 43`
- `raf.p95Ms: 33.4 -> 49.9`
- `longTasks.totalMs: 6076 -> 6052`

Interpretation:

- the dense smoke stayed in the same improved runtime band, which is acceptable for this ownership canary
- this is not a new whole-scene perf step-change; it is a renderer ownership move that keeps the browser canary stable while widening the retained canvas frame boundary
- keep using `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md` as the clean whole-scene checkpoint rather than replacing it with this shell canary report

## Verification

- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-browser-resting-text.spec.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - result: `1 passed (27 tests)`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-016/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-browser-resting-text.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (50.6s)`
- CDP visual check:
  - result: done (fresh headless Chrome DevTools pass, `/settings` with `All Settings` active and the browser section recentered; the browser section shell frame looked present/intact with no obvious blank or detached shell/body artifact)
  - workspace chrome noise: the settings list and bottom tab bar remained visible around the graph surface during the check

## Follow-up

- Keep the canonical lane on `settings-section__browserSectionDefault`.
- The next bounded product pass should either extend the widened shell boundary to another dense-lane sibling on evidence, or land a trace-backed whole-scene renderer-main reduction; do not reopen another viewport-persistence micro-pass by inertia.
