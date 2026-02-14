# Overview Pane AI Working Indicator

## Goal
Show real-time indication in overview pane when AI is actively working on a section.

## Scope
- In scope: activity state propagation, overview indicators, completion/idle transitions.
- Out of scope: detailed task timeline analytics.

## Plan
1. Identify source event/state for AI task lifecycle.
2. Add overview pane indicator UI linked to active section/task.
3. Ensure indicator updates on start/progress/complete/cancel states.
4. Handle multiple concurrent section tasks clearly.

## Acceptance Criteria
- Overview pane clearly indicates when AI is actively working.
- Indicator clears promptly on completion/cancellation.

## Verification
- Add unit tests for activity-state mapping.
- Add Playwright flow that triggers AI work and checks indicator changes.
- CDP visual check for indicator clarity.
