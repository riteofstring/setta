# Starter Prompt Buttons With Python Project Flow

## Goal
Provide starter prompt buttons, including a "create project" button shown only when Python exists in the working directory.

## Scope
- In scope: conditional button visibility, preset prompt content dispatch, basic starter prompt set.
- Out of scope: full prompt-template management UI.

## Plan
1. Define starter prompt button set and saved prompt payloads.
2. Implement Python-presence detection for conditional create-project button visibility.
3. On click, dispatch preset prompt text into chat send flow.
4. Validate generated prompt includes instructions for codebase analysis, error checks, and section organization.

## Acceptance Criteria
- Starter prompt buttons appear and dispatch correct prompt text.
- Create-project button appears only when Python exists in current working directory.

## Verification
- Add unit tests for visibility conditions and prompt payload generation.
- Add Playwright test for conditional button visibility and click-send behavior.
- CDP visual check for button layout and discoverability.
