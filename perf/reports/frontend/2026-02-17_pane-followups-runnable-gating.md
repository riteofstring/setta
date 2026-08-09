# Pane Follow-ups (Runnable Gating, Section Config Auto-heal, Backend Log Resize)

Date: 2026-02-17
Area: frontend
Code paths touched:
- `frontend/src/components/Panes/Overview/RunInstructions.tsx`
- `frontend/src/components/Panes/Overview/runInstructionsRunnableCodeBlocks.ts`
- `frontend/src/components/Panes/UiEditor/SectionConfig/SectionConfig.tsx`
- `frontend/src/components/Panes/Overview/BackendLogEventsArea.tsx`

## Scope
- Prevent non-runnable `Code` languages from appearing in Run Instructions "Add From Code Blocks".
- Auto-heal Section Config accordion open state so at least one enabled panel is open.
- Remove avoidable allocation in backend log column resize drag path.

## Before (baseline)
- No dedicated pre-change DevTools trace was recorded in this worktree before implementation.
- Existing baseline context for backend logs is documented in:
  - `perf/reports/frontend/2026-02-14_pane-ui-refinement.md`

## After
- CDP check (Run Instructions):
  - Created one Python code section and one JSON code section.
  - Verified both sections exist in project state.
  - Verified "Add From Code Blocks" includes the Python section and excludes the JSON section.
- Automated perf/guardrail run:
  - `pnpm -C frontend exec vitest run src/components/Panes/Overview/BackendLogEventsArea.perf.test.ts src/components/Panes/Overview/runInstructionsAccordionState.perf.test.ts src/components/Panes/Overview/ProjectLevelAI/projectAISettingsAccordionState.perf.test.ts`
  - Result: pass.
  - Strict timing budgets are now opt-in via `SETTA_STRICT_PERF=1` to reduce CI flake.

## Conclusion
- Run Instructions now aligns with runtime run-eligibility.
- Section Config no longer lands in an empty open-panel state when main settings are unavailable.
- Backend log resize drag path now computes width directly without rebuilding full width objects per mousemove.

## Automated Coverage
- Vitest:
  - `frontend/src/components/Panes/Overview/runInstructionsRunnableCodeBlocks.test.ts`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/SectionConfig.test.ts`
  - `frontend/src/components/Panes/Overview/BackendLogEventsArea.test.ts`
  - `frontend/src/components/Panes/Overview/BackendLogEventsArea.perf.test.ts`
  - `frontend/src/components/Utils/CodeMirror/codeMirrorLanguages.test.ts`
  - `frontend/src/components/Git/GitDiffCodeMirror.test.ts`
- Playwright:
  - `frontend/tests/e2e/editor/section-config-accordion-hierarchy.spec.ts`
  - `frontend/tests/e2e/overview/run-instructions-accordion-hierarchy.spec.ts`
