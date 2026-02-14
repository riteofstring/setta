# JSON/YAML CodeMirror Theme And Syntax

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

## Status
- Completed on 2026-02-14.

## Implementation Notes
- Added JSON and YAML language resolution across shared CodeMirror extension wiring.
- Enabled syntax-mode support for both dummy editor paths and git diff overlay code blocks.
- Added `@codemirror/lang-yaml` dependency and updated lockfile.

## Verification Summary
- Vitest:
  - `frontend/src/components/Utils/CodeMirror/getExtensions.test.ts`
  - `frontend/src/components/Git/GitDiffCodeMirror.test.ts`
- Playwright:
  - `frontend/tests/e2e/git/git-diff-overlay-json-yaml-syntax.spec.ts`
- CDP visual check:
  - Opened Git diff overlays for temporary `cdp_syntax_temp.json` and `cdp_syntax_temp.yaml`.
  - Confirmed syntax-marked blocks are present via `.cm-gitdiff-syntax` in both overlays.
