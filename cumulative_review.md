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
