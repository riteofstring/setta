# SectionSizingPolicy Plan

## Goal
Move section sizing policy into backend settings so min/max sizing rules are centralized and configurable, while keeping UI-only sizing behavior in the frontend.

## Scope
- Add `SettingsState.sectionSizingPolicy` (top-level settings field).
- Organize sizing policy by section type, with explicit special-case overrides per type.
- Keep runtime sizing logic (DOM measurements, aspect ratios, ResizeObserver, etc.) in the frontend.

## Proposed Data Model
- New Pydantic model in `backend/setta/types/settings_state.py`:
  - `SectionSizingPolicy`
    - `byType`: map of section type to policy
      - `SectionSizingPolicyByType`
        - `minHeight`, `maxHeight`, `minWidth`, `maxWidth`
        - Callable also includes `hideSearchMinHeight` and `hideParamsMinHeight`
    - `globals`: values not tied to a single section type
      - `pinnedParamsAreaMinHeight`
      - `minimizedHeight`
      - any other shared constants

## Backend Changes
- Add `SectionSizingPolicy` model to `backend/setta/types/settings_state.py`.
- Update `frontend/generation/generate_settings_state.py` to import the new model and include it in `SettingsState`.
- Run `source activate.sh && cd frontend && pnpm generate` to refresh:
  - `backend/setta/types/generated/settings_state.py`
  - `frontend/src/utils/generatedTypes.ts`

## Frontend Changes
- Consume `settings.sectionSizingPolicy` in `frontend/src/state/hooks/sectionSizes.ts`.
- Replace hard-coded min/max numbers with values from `settings.sectionSizingPolicy.byType` and `globals`.
- Keep selection logic in the frontend (e.g., choose callable min height based on `hideSearch`/`hideParams`).
- Keep UI-only behavior and helpers unchanged (aspect ratio, ResizeObserver, etc.).

## Migration/Defaults
- Provide defaults in `SectionSizingPolicy` matching current constants to preserve behavior.
- No backward compatibility required; update references in one pass.

## Testing / Verification
- Manual: create sections of each type and confirm min/max behavior matches current UI.
- Manual: toggle `hideSearch`/`hideParams` for callable sections to verify min height selection.
