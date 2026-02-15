# Home Page File Manager UI

## Goal
Provide a structured home-page browser UI with file navigation, project thumbnails, and selected-project details.

## Scope
- In scope: home browser layout, file tree/list rendering, project thumbnail surface, and selected-project detail panel.
- Out of scope: advanced editor actions unrelated to browsing.

## Plan
1. Implement three-column composition:
   left file browser with path/search controls, middle project thumbnails, right selected-project details.
2. Reuse shared browser primitives for folder navigation/filtering and keep behavior consistent with browser section patterns.
3. Mark folders with Setta initialization state using a Setta logo/badge indicator.
4. Validate navigation clarity and performance in larger directories/project sets.

## Acceptance Criteria
- Home page browser shows the specified three-column layout and interactions.
- Setta-initialized folders are visually distinguished in the file-browser column.
- Navigation and selection are predictable and performant.

## Verification
- Add Vitest coverage for browser section state and selection transitions.
- Add Playwright tests for folder navigation, initialized-folder indicator rendering, and project selection.
- CDP visual and performance check on large directories.
