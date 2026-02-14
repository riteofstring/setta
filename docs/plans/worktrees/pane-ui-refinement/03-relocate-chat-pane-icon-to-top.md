# Relocate Chat Pane Icon To Top

## Goal
Place the chat pane icon at the top position in the pane icon stack.

## Scope
- In scope: icon ordering logic and any related persistence/default order behavior.
- Out of scope: changing icon visuals or creating new pane types.

## Plan
1. Locate the source of pane icon ordering (static config/store ordering rules).
2. Move chat icon to first position in default order.
3. Confirm no regressions in selection, persisted ordering, or keyboard navigation.

## Acceptance Criteria
- Chat pane icon renders first in the icon list by default.
- Existing pane switching behavior continues to work.

## Verification
- Add/adjust unit test for icon ordering.
- Add Playwright check for icon order in the pane rail.
- CDP visual check on the top nav/pane rail.

## Status
- Completed on 2026-02-14.

## Implementation Notes
- Reordered overview rail tab definitions so `Project AI Chat` is the first icon in the default stack.
- Preserved existing overview tab behavior and selection logic.

## Verification Summary
- Vitest:
  - `frontend/src/components/Panes/Overview/Overview.test.tsx`
- Playwright:
  - `frontend/tests/e2e/overview/overview-rail-chat-order.spec.ts`
- CDP visual check:
  - Overview rail order starts with `overview-tab-project-ai-chat`, then `overview-tab-overview`.
