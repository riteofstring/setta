# CSV/XLSX View And Basic Edit

## Goal
Allow CSV/XLSX files to be viewed and lightly edited with a styleable grid/table library.

## Scope
- In scope: file load, tabular rendering, basic cell edit, save/update workflow.
- Out of scope: spreadsheet-level advanced formulas/macros.

## Plan
1. Evaluate and select a styleable table/grid library compatible with app constraints.
2. Implement CSV/XLSX parse -> table model -> render pipeline.
3. Add basic cell editing and save-back flow with validation.
4. Ensure large-sheet performance and virtualization where needed.

## Acceptance Criteria
- CSV/XLSX files are viewable in a tabular UI.
- Basic edits can be made and persisted where supported.

## Verification
- Add unit tests for parser/serializer behavior.
- Add Playwright flow for open/edit/save common CSV/XLSX files.
- CDP visual and performance check on large tables.
