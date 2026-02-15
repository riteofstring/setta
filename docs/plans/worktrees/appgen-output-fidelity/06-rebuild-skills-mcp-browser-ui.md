# Rebuild Skills/MCP Browser UI

## Goal
Rebuild the previously reverted skills/MCP browser UI with architecture that avoids the prior JSON-render assumption.

## Scope
- In scope: browser UI surface, data/state architecture, interaction behavior.
- Out of scope: reproducing reverted implementation internals.

## Plan
1. Capture required UX from prior branch behavior and desired improvements.
2. Design a new data flow decoupled from JSON-render-specific assumptions.
3. Implement browser UI with clear loading/error/empty states.
4. Validate compatibility with app-gen and chat orchestration entry points.

## Acceptance Criteria
- Skills/MCP browser UI is restored and usable.
- Implementation no longer depends on the invalid prior JSON-render model.

## Verification
- Add unit tests for browser state and data adapters.
- Add Playwright flows for browse/select/use operations.
- CDP visual check for layout and interaction quality.

## Implementation Notes (February 14, 2026)
- Added backend skills browser routes:
  - `GET /api/getAppGenSkills`
  - `POST /api/getAppGenSkillContent`
- Added skill discovery/content helpers with root scoping and path traversal protection.
- Rebuilt frontend Skills/MCP Browser in App Config:
  - skill list/filter/preview
  - MCP tool discovery/filter
  - refresh and error state handling
- Implementation is mode-agnostic and does not assume JSON-render-only behavior.

## Verification Notes
- Backend tests: `tests/routers/test_app_gen_extensions_routes.py`.
- Playwright coverage: `frontend/tests/e2e/overview/app-config-mcp-mode.spec.ts`.
- CDP check was run to validate layout and interaction state.
