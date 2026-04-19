# Settings All Settings GUI Backend Shell Ownership Cluster Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense checkpoint: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md`
Focused probes:
- `frontend/tests/e2e/settings/settings-all-settings-gui-resting-dropdown.spec.ts`
- `frontend/tests/e2e/settings/settings-all-settings-backend-resting-dropdown.spec.ts`
- `frontend/tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`

## Goal

Widen the retained canvas shell boundary from the earlier single-section canaries to the shared GUI/backend settings family by promoting `settings-section__gui` and `settings-section__backend` to full shell ownership on the `canvas-shell-underlay` path while preserving their existing lightweight nested-child, dropdown, and switch behavior.

## Implementation

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts`
  - adds `settings-section__gui` and `settings-section__backend` to `CANVAS_OWNED_SECTION_SHELL_IDS`
  - aliases the existing GUI/backend resting-dropdown and resting-text section ids to the widened shell ids instead of opening a separate renderer branch
  - preserves lightweight nested children for the new shell-owned GUI/backend family through an explicit shell-owned allowlist, matching the existing special-case treatment already used for `sectionSizingPolicy`
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - now proves the GUI/backend family belongs to the shell-owned set
  - now proves GUI/backend still keep lightweight nested children even after the shell boundary widens
- `frontend/tests/e2e/settings/settings-all-settings-gui-resting-dropdown.spec.ts`
  - now asserts the GUI section root and inner `CustomResizable` expose `data-canvas-owned-shell="true"` with transparent shell styling
  - keeps the first-click dropdown activation proof and records the new zero-live-search-input resting state on the section
- `frontend/tests/e2e/settings/settings-all-settings-backend-resting-dropdown.spec.ts`
  - now asserts the backend section root and inner `CustomResizable` expose `data-canvas-owned-shell="true"` with transparent shell styling
  - keeps the first-click dropdown activation proof and records the same zero-live-search-input resting state

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
  - Chrome DevTools MCP, headless Chromium
- Surface:
  - `settings` -> `All Settings`
- Canonical target section for this slice:
  - `settings-section__gui`
- Sibling proof sections:
  - `settings-section__backend`
  - dense-lane canary remains `settings-section__browserSectionDefault`

## Focused Runtime Result

The live GUI/backend ownership probes confirmed:

- `settings-section__gui`
  - section root and inner `CustomResizable` both exposed `data-canvas-owned-shell="true"`
  - outer and inner shell backgrounds computed as `rgba(0, 0, 0, 0)`
  - the inner shell pseudo-border width collapsed to `0px`
  - the old always-live section search input count fell to `0` at rest
  - first-click activation on `gridPattern` still swapped in exactly one live search input plus one live search button for the active row
- `settings-section__backend`
  - section root and inner `CustomResizable` both exposed `data-canvas-owned-shell="true"`
  - outer and inner shell backgrounds computed as `rgba(0, 0, 0, 0)`
  - the inner shell pseudo-border width collapsed to `0px`
  - the old always-live section search input count also fell to `0` at rest
  - first-click activation on `runSnapshotMode` still swapped in exactly one live search input plus one live search button for the active row
- `frontend/tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts`
  - remained green on the same runtime
  - GUI/backend switch rows still stayed on the lightweight canvas-owned switch path with `0` live `button[role="switch"]` roots in those sections at rest

Interpretation:

- this is a real shared graph-surface ownership step rather than another isolated shell-sibling canary
- the widened shell boundary removed the old always-live section search inputs from the resting GUI/backend sections while preserving first-click dropdown activation
- preserving lightweight nested children kept the family on the existing bounded row-body primitive instead of regressing onto the heavier nested wrapper path

## Dense Companion Result

Dense rerun on the same worktree runtime recorded:

- `documentNodeCount: 5493`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 46`
- `raf.meanMs: 43.14`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1100`
- `longTasks.count: 8`
- `longTasks.totalMs: 5746`
- `longTasks.maxMs: 3383`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md`:

- `documentNodeCount: 5494 -> 5493`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 46`
- `raf.meanMs: 43.28 -> 43.14`
- `raf.p95Ms: 33.4 -> 50`
- `longTasks.totalMs: 6076 -> 5746`

Interpretation:

- the dense smoke stayed in the current improved runtime band while dropping one document node, one button, and some long-task total
- this is still not the missing whole-scene perf breakthrough; it is a kept family ownership expansion that does not reopen the canonical dense lane
- keep using the earlier viewport-persistence checkpoint as the whole-scene baseline and treat this report as a shared ownership proof

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-gui-resting-dropdown.spec.ts tests/e2e/settings/settings-all-settings-backend-resting-dropdown.spec.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - result: `1 passed (27 tests)`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-030/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-gui-resting-dropdown.spec.ts frontend/tests/e2e/settings/settings-all-settings-backend-resting-dropdown.spec.ts frontend/tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `4 passed (1.4m)`
- Chrome DevTools MCP:
  - result: done (`/settings` normalized, `All Settings` active, `fit view` applied once, GUI/backend shell cluster mounted, and no obvious blank or detached shell/body artifact observed)
  - notable workspace chrome noise: persistent `Chat Window 1` panel on the right and the compact left workspace chrome/sidebar

## Follow-up

- Close the GUI/backend shell-ownership cluster here as a completed shared-family step.
- Keep the canonical dense lane on `settings-section__browserSectionDefault`.
- The next default frontier should return to a broader trace-backed renderer-main JS / GC reducer or a stronger shared ownership primitive, not another dropdown-family or single-section shell follow-up by inertia.
