# Project Configs Pane Inside View Modes Pane

## Goal
Move project configs into a dedicated pane within the view modes pane.

## Scope
- In scope: pane composition, navigation routes/state, and project config rendering placement.
- Out of scope: changing project config data model.

## Plan
1. Identify existing project config entry points and view mode pane architecture.
2. Create/add project configs as an internal pane surface within view modes.
3. Update navigation and deep-link handling to target the new location.
4. Remove/retire redundant old access points as needed.

## Acceptance Criteria
- Project configs are available from within view modes pane.
- Navigation to project configs remains discoverable and consistent.

## Verification
- Add unit tests for pane routing/state transitions.
- Add Playwright coverage for navigation into/out of project configs pane.
- CDP visual check for pane layout integration.
