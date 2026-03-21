# Section Colors

This document describes section-level color customization:

- `tagColor`: a compact color marker used for labeling/filtering sections.
- `styleColor`: a full section chrome tint (header/container/panels/handles).

## Data model

Both values live on `BaseSectionImpl` and therefore apply to every section type.

- `tagColor: str | None`
- `styleColor: str | None`

`None` means no custom color.

Relevant generated/state surfaces:

- `backend/setta/types/section_impls.py`
- `backend/setta/types/generated/shared_modifier.py`
- `frontend/src/utils/generatedTypes.ts`

## Routes

Both routes are write routes guarded by deployment layout policy:

- `Route.SET_SECTION_TAG_COLOR` (`/setSectionTagColor`)
  - payload: `projectConfigId`, `sectionId`, `tagColor | null`
- `Route.SET_SECTION_STYLE_COLOR` (`/setSectionStyleColor`)
  - payload: `projectConfigId`, `sectionId`, `styleColor | null`

Backend wiring:

- `internal/httpapi/project_routes.go`
- `internal/projectstate/layout_presentation.go`

Frontend helpers:

- `frontend/src/utils/generatedEndpoints.ts`

## UI behavior

Section Config now includes:

- `Color Tag` controls
  - pick/reset section `tagColor`
  - edit reusable tag categories (`settings.gui.sectionTagColorChoices`) in IDE mode
- `Style` controls
  - pick/reset section `styleColor`
  - live preview while dragging the native color input
  - commit to backend only when the native input emits `change` (release/finalize)

Main canvas + overview behavior:

- Header shows a small tag dot when `tagColor` is set.
- Overview list rows show the same dot.
- Overview has a tag filter dropdown: `All`, `Untagged`, and configured categories.
- `styleColor` themes section chrome via CSS variables, including:
  - section background/border/outline/text
  - args/pinned/edge panels
  - param row hover/selected states
  - arg and agentic handles
- Meta-control-style sections do not apply style tinting.

Key UI files:

- `frontend/src/components/Panes/UiEditor/SectionConfig/SectionTagColorSettings.tsx`
- `frontend/src/components/Panes/UiEditor/SectionConfig/SectionStyleColorSettings.tsx`
- `frontend/src/components/Section/Container/SectionContainerCore.tsx`
- `frontend/src/components/Panes/Overview/ProjectOverview/ProjectOverview.tsx`

## Theme derivation

`styleColor` is converted to a readable theme by `deriveSectionStyleTheme`:

- input must be valid `#RRGGBB` hex, otherwise no theme is applied
- light/dark themes are derived by mixing with white/black at fixed ratios
- text color is chosen by contrast against the derived background
- results are memoized by `(darkMode, color)`

See `frontend/src/utils/sectionStyleColors.ts`.

## Permissions and constraints

- Setting/clearing section colors is disabled when:
  - section is frozen, or
  - deployment mode lacks `allowLayoutChanges`.
- Editing tag category definitions is disabled unless structure editing is allowed.

## Defaults

Default tag categories come from `SettingsGUI.sectionTagColorChoices`:

- Red `#ef4444`
- Orange `#f97316`
- Yellow `#eab308`
- Green `#22c55e`
- Cyan `#06b6d4`
- Blue `#3b82f6`
- Purple `#a855f7`
- Slate `#64748b`

Defined in `backend/setta/types/settings_state.py`.

## Tests and perf guardrails

Coverage includes:

- Unit: `frontend/src/utils/sectionStyleColors.test.ts`
- E2E:
  - `frontend/tests/e2e/editor/section-color-tags.spec.ts`
  - `frontend/tests/e2e/editor/section-style-colors.spec.ts`

Performance report:

- `perf/reports/frontend/2026-02-11_section-style-color-picker-commit.md`
