# Settings All Settings Code-Like Shell Ownership Cluster Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense checkpoint: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md`
Prior ownership reference: `perf/reports/frontend/2026-04-20_settings-all-settings-prompt-shell-ownership-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-code-like-resting-text-cluster.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`

## Goal

Widen the retained canvas shell boundary from the browser/prompt canaries to the existing code-like cluster by promoting `settings-section__buttonParamCodeObjDefault` and `settings-section__codeSectionDefault` to full shell ownership on the `canvas-shell-underlay` path while keeping the current lightweight resting-text/editor handoff intact.

## Implementation

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts`
  - adds `settings-section__buttonParamCodeObjDefault` and `settings-section__codeSectionDefault` to `CANVAS_OWNED_SECTION_SHELL_IDS`
  - keeps both sections on the existing resting-text lane by aliasing their resting-text ids to the widened shell ids instead of opening a new renderer branch
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - now proves the button/code cluster belongs to the shell-owned set
  - now proves that same cluster no longer routes through the lightweight nested-children lane once the shell boundary widens
- `frontend/tests/e2e/settings/settings-all-settings-code-like-resting-text-cluster.spec.ts`
  - now verifies the button/code/prompt cluster exposes `data-canvas-owned-shell="true"` on both the section root and `CustomResizable`
  - now verifies both DOM shell layers stay transparent while the retained canvas still paints a non-transparent header pixel for each section
  - keeps the existing lightweight resting-text counts and focus-to-live-editor checks for the same cluster

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
- Surface:
  - `settings` -> `All Settings`
- Canonical target section for this slice:
  - `settings-section__buttonParamCodeObjDefault`
- Sibling proof sections:
  - `settings-section__codeSectionDefault`
  - `settings-section__promptSectionDefault`

## Focused Runtime Result

The live code-like cluster probe confirmed:

- `settings-section__buttonParamCodeObjDefault`
  - `data-canvas-owned-shell="true"` on both the section root and inner `CustomResizable`
  - section and shell backgrounds both computed as `rgba(0, 0, 0, 0)`
  - header pixel on the retained canvas stayed non-transparent: `16,20,27,255`
  - lightweight resting-text counts stayed intact: `lightweightRestingTextCount 9`, `underlineCount 9`, `liveInputCount 0`
- `settings-section__codeSectionDefault`
  - `data-canvas-owned-shell="true"` on both shell layers
  - section and shell backgrounds both computed as `rgba(0, 0, 0, 0)`
  - header pixel on the retained canvas stayed non-transparent: `16,20,27,255`
  - lightweight resting-text counts stayed intact: `lightweightRestingTextCount 9`, `underlineCount 9`, `liveInputCount 0`
- `settings-section__promptSectionDefault`
  - remained shell-owned on the same path and stayed visually consistent with the widened cluster

The same focused probe also kept the existing cluster activation smoke green:

- focusing the canonical lightweight dummy input for each of the button/code/prompt rows still swapped in one live editor for that row

Interpretation:

- this is a broader graph-surface ownership step than the earlier single-section shell canaries because the retained canvas now owns the idle shell frame for the existing code-like cluster instead of only the prompt sibling
- the widened shell boundary reused the same retained-text/editor handoff path, so the implementation stayed bounded and did not open another renderer seam

## Dense Companion Result

Dense rerun on the same worktree runtime recorded:

- `documentNodeCount: 5498`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `raf.meanMs: 43.56`
- `raf.p95Ms: 50`
- `longTasks.totalMs: 6069`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md`:

- `documentNodeCount: 5494 -> 5498`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 43.28 -> 43.56`
- `raf.p95Ms: 33.4 -> 50`
- `longTasks.totalMs: 6076 -> 6069`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-prompt-shell-ownership-rerun.md`:

- `documentNodeCount: 5496 -> 5498`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 43 -> 43.56`
- `raf.p95Ms: 50 -> 50`
- `longTasks.totalMs: 6013 -> 6069`

Interpretation:

- the dense smoke stayed in the same improved runtime band, which is acceptable for this ownership expansion
- this is not a new whole-scene perf step-change; it is a retained-scene ownership move that keeps the canonical dense lane stable while widening the canvas-owned shell boundary
- keep using `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md` as the clean whole-scene checkpoint rather than replacing it with this cluster shell report

## Verification

- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-code-like-resting-text-cluster.spec.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - result: `1 passed (27 tests)`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-021/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-code-like-resting-text-cluster.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (51.4s)`
- CDP visual check:
  - result: done (fresh headless DevTools pass normalized to `All Settings` with `fit view`; `buttonParamCodeObjDefault`, `codeSectionDefault`, and `promptSectionDefault` were present on the graph surface with no obvious blank or detached shell/body artifact)
  - workspace chrome noise: normal Setta frame only, including the top menu/args bar, left navigation rail, right tool strip, and bottom view tabs

## Follow-up

- Keep the canonical dense whole-scene lane on `settings-section__browserSectionDefault`.
- Treat `settings-section__buttonParamCodeObjDefault` as the canonical target for this bounded shell-ownership cluster expansion.
- The next default frontier should return to a broader trace-backed renderer-main JS / GC reducer or the stronger graph-surface step rather than reopening another shell sibling by inertia.
