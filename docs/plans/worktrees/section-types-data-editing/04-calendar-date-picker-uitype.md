# Calendar/Date Picker UI Type

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
