# List/Group Child Default Section Types

## Goal
Allow list and group sections to configure default child section types.

## Scope
- In scope: config UI (dropdown/icon button), default-child type persistence, child creation flow.
- Out of scope: deep redesign of list/group architecture.

## Plan
1. Add config fields for default child section type on list/group.
2. Provide config UI affordance (dropdown and/or icon-triggered menu).
3. Apply defaults in child creation handlers.
4. Ensure defaults can be overridden when explicitly choosing a different type.

## Acceptance Criteria
- List/group sections can set a default child type.
- New children use configured default unless user overrides.

## Verification
- Add unit tests for default resolution logic.
- Add Playwright flow for configure default and add children.
- CDP visual check for config controls in pane.
