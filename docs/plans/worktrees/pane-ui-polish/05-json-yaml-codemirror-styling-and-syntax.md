# JSON/YAML CodeMirror Styling And Syntax

## Goal
Apply correct CodeMirror styling and syntax highlighting behavior for JSON and YAML files.

## Scope
- In scope: language extension wiring, editor theme tokens, syntax classes, and file-type detection.
- Out of scope: adding unrelated language modes.

## Plan
1. Confirm current file extension/type detection for JSON and YAML.
2. Ensure correct CodeMirror language packages/extensions are activated.
3. Align token colors and editor chrome with Setta styling system.
4. Validate error highlighting and bracket/indent behavior for both formats.

## Acceptance Criteria
- JSON and YAML get distinct, correct syntax highlighting.
- Editor visuals match app styling and remain legible.

## Verification
- Add/update unit tests around mode resolution by file type.
- Add Playwright test opening JSON and YAML examples and asserting syntax mode classes.
- CDP visual check for editor rendering in both file types.
