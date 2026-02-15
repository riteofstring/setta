# Calendar/Date Selector UI Type

## Goal
Add a date-focused UI type with calendar/date-picker interaction and reliable value handling.

## Scope
- In scope: date picker UI, keyboard support, parsing/formatting/persistence.
- Out of scope: complex scheduling rules.

## Plan
1. Define schema and config options for date values.
2. Implement date-picker UX with keyboard-friendly behavior.
3. Wire format/display options and persistence.
4. Validate timezone-safe handling for stored values.

## Acceptance Criteria
- Users can pick/edit dates via UI type.
- Values persist and display consistently.

## Verification
- Add unit tests for date value serialization/parsing.
- Add Playwright flow for open picker/select/edit date.
- CDP visual check for picker layout and interaction states.

## Delivery Notes (2026-02-14)
- Implemented `TextParam` date input mode via `uiType="date"` and formatter options (`iso`, `us`, `eu`, `long`) in `frontend/src/components/Params/ParamUIs/TextParamInput.tsx`.
- Added serialization/formatting logic in `frontend/src/utils/textParamDateTime.ts` with ISO normalization for storage.
- Added/updated tests: `frontend/src/components/Params/ParamUIs/TextParamInput.test.tsx`, `frontend/src/utils/textParamDateTime.test.ts`, and `frontend/src/utils/sectionTypesDataAuthoring.performance.test.ts`.
