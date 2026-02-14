# Slash Commands GUI And Autocomplete

## Goal
Support agent-style slash commands in chat, with GUI affordances for common commands and codemirror-style autocomplete.

## Scope
- In scope: slash command parser, command palette/list, autocomplete in input, common command GUI actions.
- Out of scope: supporting every provider-specific command initially.

## Plan
1. Define common cross-agent command set and provider-specific mappings.
2. Implement slash parser and command suggestion/autocomplete pipeline.
3. Add GUI shortcuts for highest-frequency commands.
4. Ensure command execution feedback is clear in chat thread.

## Acceptance Criteria
- Users can run supported slash commands from chat.
- Autocomplete/suggestions appear while typing slash commands.

## Verification
- Add unit tests for command parsing and completion candidates.
- Add Playwright tests for slash input, selection, and command execution.
- CDP visual check for command suggestion UI.
