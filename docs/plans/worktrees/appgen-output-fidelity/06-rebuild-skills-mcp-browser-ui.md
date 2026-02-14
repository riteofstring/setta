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
