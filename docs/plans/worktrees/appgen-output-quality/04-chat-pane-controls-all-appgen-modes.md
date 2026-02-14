# Chat Pane Controls All App Gen Modes

## Goal
Allow users to trigger and control app generation flows entirely from the chat AI pane.

## Scope
- In scope: chat intent parsing/routing, hidden app-gen execution linkage, status/result feedback.
- Out of scope: removing the dedicated app-gen pane.

## Plan
1. Define chat command/intent patterns for generation mode requests.
2. Map chat intents to the same app-gen orchestration layer used by pane controls.
3. Add clear progress and completion feedback in chat and related panes.
4. Ensure chat-triggered flow can set or override generation mode explicitly.

## Acceptance Criteria
- Users can request app generation from chat and get working output.
- Chat-triggered and pane-triggered generation stay behaviorally consistent.

## Verification
- Add tests for chat intent -> mode mapping.
- Add Playwright E2E for chat-driven generation requests.
- CDP interaction check for chat/pane synchronization.
