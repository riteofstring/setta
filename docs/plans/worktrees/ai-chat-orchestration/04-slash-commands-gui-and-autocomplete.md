# Slash Commands GUI and Autocomplete

## Goal
Support agent-style slash commands in chat, with GUI affordances for common commands and CodeMirror-style autocomplete.

## Scope
- In scope: slash command parser, command suggestion list, autocomplete in chat input, and GUI shortcuts for common commands.
- Out of scope: supporting every provider-specific command initially.

## Plan
1. Define canonical cross-agent command set (for example `/new`, `/resume`, `/model`) and provider-specific mappings.
2. Implement parser and completion pipeline that supports inline suggestion while typing `/...`.
3. Add GUI entry points for most common command actions.
4. Ensure command execution and error feedback are explicit in the chat thread.

## Acceptance Criteria
- Users can run supported slash commands from chat.
- Autocomplete suggestions appear while typing slash commands and can be accepted via keyboard/mouse.

## Verification
- Add unit tests for command parsing and completion candidates.
- Add Playwright tests for slash input, suggestion selection, and command execution.
- CDP visual check for command suggestion UI.
