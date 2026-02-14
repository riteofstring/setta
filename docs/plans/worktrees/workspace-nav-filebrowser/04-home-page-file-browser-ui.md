# Home Page File Browser UI

## Goal
Provide a usable file browser UI in the home page browser section.

## Scope
- In scope: home browser panel layout, list/tree rendering, basic navigation actions.
- Out of scope: advanced editor actions unrelated to browsing.

## Plan
1. Define home-page browser section layout and information density targets.
2. Implement file/folder listing with navigation and selection behaviors.
3. Reuse shared browser primitives to avoid duplicated rendering logic.
4. Validate large directory behavior and rendering performance.

## Acceptance Criteria
- Home page exposes a functional file browser section.
- Navigation and selection are predictable and performant.

## Verification
- Add Vitest coverage for browser section state transitions.
- Add Playwright tests for folder navigation and file selection.
- CDP visual and performance check on large directories.
