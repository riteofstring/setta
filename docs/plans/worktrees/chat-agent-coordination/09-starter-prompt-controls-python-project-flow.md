# Starter Prompt Controls with Python Project Flow

## Goal
Provide starter prompt buttons, including a conditional "Create Project" button shown only when Python exists in the working directory.

## Scope
- In scope: starter prompt buttons, conditional Python-based visibility, and preset prompt dispatch into chat send flow.
- Out of scope: full prompt-template management UI.

## Plan
1. Define starter prompt set and canonical prompt payload text for each action.
2. Implement Python-presence detection in current working directory for conditional "Create Project" visibility.
3. On click, dispatch the preset prompt directly through standard chat send flow.
4. Ensure "Create Project" prompt explicitly requests codebase analysis, project/section setup, and error-check-first completion behavior.

## Acceptance Criteria
- Starter prompt buttons appear and dispatch correct prompt text.
- "Create Project" button appears only when Python exists in the current working directory.

## Verification
- Add unit tests for visibility conditions and prompt payload generation.
- Add Playwright test for conditional button visibility and click-send behavior.
- CDP visual check for button layout and discoverability.
