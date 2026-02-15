# Overview Pane AI Activity Indicator

## Goal
Show real-time state in the overview pane when AI is actively working on a section.

## Scope
- In scope: activity-state propagation, section-level overview indicator rendering, and completion/idle transitions.
- Out of scope: detailed task timeline analytics.

## Plan
1. Identify canonical source for AI run lifecycle state (queued/running/completed/cancelled/failed).
2. Add section-level indicator styling in overview pane tied to that lifecycle state.
3. Update indicator transitions for start/progress/complete/cancel/fail paths.
4. Define behavior for multiple concurrent active sections so status remains readable.

## Acceptance Criteria
- Overview pane clearly identifies sections currently being worked on by AI.
- Indicator transitions and clear behavior are consistent for completion, cancellation, and failure.

## Verification
- Add unit tests for activity-state mapping.
- Add Playwright flow that triggers AI work and checks indicator changes.
- CDP visual check for indicator clarity across active and idle states.
