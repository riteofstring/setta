# Time Entry/Modification/Display UI Type

## Goal
Add a time-focused UI type that supports entry, editing, and formatted display options.

## Scope
- In scope: time input control, serialization/parsing, display format configuration.
- Out of scope: full calendar/date feature set.

## Plan
1. Define section schema for time value and format options.
2. Implement time input/edit UX and robust parsing/validation.
3. Add configurable display formats in section config.
4. Ensure data round-trips through existing section persistence.

## Acceptance Criteria
- Users can create/edit time values reliably.
- Time display format can be configured per section.

## Verification
- Add unit tests for parsing/format format option behavior.
- Add Playwright flow for entry/edit/configure time display.
- CDP visual check for controls in pane and canvas contexts.
