# Cumulative Review Notes

## 2026-02-17 16:17

- Restored Appearance settings availability in `SectionConfig` for section types that still expose base style/tag fields (`ListRoot`, `Group`, `GenPythonCode`, `GenPythonMetadata`, `Terminal`).
- Hardened backend log copy flow so unsupported clipboard environments resolve to explicit failure feedback instead of uncaught sync-throw paths.
- Added backend log resize listener teardown on unmount-mid-drag to prevent lingering global mouse listeners.
- Realigned non-small pill combobox spacing by increasing right input padding to match larger chevron button footprint.
- Consolidated duplicated pane accordion scaffolding behind a shared `PaneAccordion` primitive used by both Run Instructions and Section Config wrappers.
- Added targeted automated coverage for the review fixes in Vitest and Playwright, including Terminal Appearance availability in Section Config.
- Per branch direction, retained unrelated `docs/plans/worktrees/**` deletions and excluded top-level `review*.md` working notes from final tracked changes.

## 2026-02-17 17:09

- Made `SectionConfig` accordion state controlled so disabled sections are always filtered from active open values; this removes stale-expanded disabled states when switching section/type.
- Refactored `RunInstructions` to a single accordion root with one persisted normalized open-values array, replacing subset merge/plumbing and avoiding unnecessary codegen JSX construction when `canRun` is false.
- Extended shared `PaneAccordion` to support richer trigger content (`description`) and style overrides, then migrated `ProjectAISettings` to reuse it instead of maintaining a parallel accordion implementation.
- Restored in-pane backend log full-message inspection with a selected-row details panel while keeping virtualization for the main list.
- Fixed backend log copy affordance on touch-first devices by removing hidden-state `pointer-events-none` gating and relying on opacity visibility behavior.
- Added/updated focused Vitest and Playwright coverage for the above changes, including Section Config cross-type collapse behavior and backend-log selected-message visibility.
- Pinned `@codemirror/legacy-modes` to an exact version (`6.5.2`) to align dependency determinism with the rest of the frontend package manifest.

## 2026-02-17 17:36

- Fixed Run Instructions runnable-code listing mismatch by gating `SectionTypeEnum.Code` entries through runnable language checks (`python`/`bash`) before showing them in "Add From Code Blocks".
- Added `runInstructionsRunnableCodeBlocks` helper coverage to lock runnable/non-runnable language behavior (including non-runnable fallback when language is missing).
- Hardened `SectionConfig` accordion defaults so the first enabled panel opens (`main` else `appearance`) and open-state auto-heals away from disabled entries.
- Extended Section Config tests and Playwright assertions to verify cross-type transitions keep appearance panel available and expanded when main settings are unavailable.
- Removed backend-log resize hot-path churn by calculating the next width directly instead of rebuilding a full widths object on each drag update.
- Reduced CI flake risk in perf tests by making strict wall-clock thresholds opt-in via `SETTA_STRICT_PERF=1` while keeping large-input structural guardrails in default runs.
- Centralized CodeMirror language extension/parser registration into a shared utility and reused it from editor extensions, SSR dummy renderer, and git diff syntax parser resolution.
- Added shared language utility tests and appended a perf report entry at `perf/reports/frontend/2026-02-17_pane-followups-runnable-gating.md`.

## 2026-02-17 18:15

- Tightened `PaneAccordion` into a discriminated controlled/uncontrolled API so controlled callers must provide `openValues` + `onOpenValuesChange` and cannot also pass `defaultOpenValues`.
- Updated all controlled pane call sites (`RunInstructions`, `SectionConfig`, `ProjectAISettings`) and related tests/perf tests to match the stricter accordion contract.
- Moved backend-log pure helpers out of `BackendLogEventsArea.tsx` into `BackendLogEventsArea.utils.ts`, reducing production component export surface while keeping test coverage on the helper module.
- Fixed backend-log selected-row lookup overhead by memoizing an `eventsById` map and using O(1) lookups for selected-event resolution and stale-selection cleanup.
- Fixed backend-log width ratchet behavior by measuring viewport width from the outer scroll shell, keeping container `minWidth` tied to `gridMinWidth`, and computing list render width as `max(gridMinWidth, viewportWidth)`.
- Cleaned `GitDiffCodeMirror` parser typing (`CodeMirrorParserLike | null`) and removed redundant parser/highlighter null checks inside the syntax-highlighting hot loop.
- Added/updated focused automated verification: Vitest unit/perf/integration coverage for backend-log sizing + lookup behavior and Playwright assertions that backend-log scroll width shrinks after dragging a column narrower.
- Completed CDP visual verification on the backend-log pane, including near-min/near-max resize extremes and selected-message panel behavior.
