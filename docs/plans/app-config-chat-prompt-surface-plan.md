# App Config / Chat Slash Command Simplification Plan

## Goal
Simplify app-generation UX by making Project Chat the primary prompt surface and removing the saved-prompt/template work from this phase.

The new direction is:
- built-in appgen slash commands carry their own fixed prompt baselines,
- App Config narrows toward an advanced app-definition workbench,
- custom slash commands remain the escape hatch for prompt customization.

## Intended Use
App Config should have one clear purpose: it is the advanced source-of-truth workbench for the app definition.

That means:
- Project Chat is where users initiate app generation and iterate conversationally.
- App Config is where users inspect, preview, validate, save, and manually edit the resulting app definition when needed.

The pane should not try to be all of these at once:
- the main prompting surface,
- the advanced JSON editor,
- and the infra/settings surface.

The intended audience split is:
- normal appgen user:
  - mostly uses Project Chat.
- power user:
  - occasionally uses App Config to inspect or edit the app spec.
- maintainer / advanced user:
  - can access metadata and deeper controls when needed.

This is the core product simplification:
- Chat owns prompting and appgen initiation.
- App Config owns the app-definition workbench.

## Product Decision

### 1. No saved-prompt system work in this phase
- Do not build prompt-template binding for appgen commands.
- Do not add prompt pickers, prompt folders, prompt groups, or chooser UX.
- Do not change prompt-template storage format in this phase.

If a user wants a different prompt, they can create their own custom slash command for now.

### 2. Built-in appgen slash commands become opinionated
The built-in appgen commands should ship with fixed, unmodifiable prompt baselines:
- `/app-json`
- `/app-image`
- `/app-prompt`
- `/app-mcp`

Each command should:
- resolve to a fixed app-generation mode,
- inject its own built-in prompt text,
- optionally append user suffix text if the user typed extra content after the command.

Example:
- `/app-json dashboard for support ops`
  - built-in baseline prompt for JSON generation
  - plus `dashboard for support ops`

### 3. Custom slash commands remain the override path
- If users need a materially different prompt, they should create a project-specific custom slash command.
- We do not need a more elaborate saved-prompt UX yet.
- This keeps the product surface small while preserving flexibility.

### 4. App Config becomes narrower
- App Config should primarily own:
  - app-spec preview,
  - validation,
  - save,
  - raw JSON/theme/assets editing,
  - app-definition metadata,
  - JSON-generation-specific behavior that truly benefits from in-pane preview/patching.
- App Config should stop acting like a second prompt composer for chat-driven flows.

## Code Quality Bar
- The implementation must be clean, readable, and obviously written by a strong engineer.
- Do not write sloppy “just get it done” glue code.
- Do not spread command/prompt resolution across multiple components.
- Prefer one clear source of truth for built-in appgen command definitions.
- Keep naming crisp, state small, and behavior explicit.
- Avoid heuristics when a deterministic mapping is available.

## Delivery Rule: Tests First
- Write tests first for each phase.
- Start with failing tests.
- Implement production code only after the expected behavior is pinned down in tests.

Required order:
1. Add or update Vitest coverage.
2. Add or update Playwright coverage.
3. Implement production code.
4. Run tests and iterate until they pass.

## Current State (Code Reality)
- Built-in appgen slash commands already exist but currently only switch mode:
  - `frontend/src/components/Chat/chatComposerControls.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
- Custom slash commands already support fixed prompt text plus optional suffix text:
  - `frontend/src/components/Chat/chatComposerControls.ts`
  - `frontend/src/components/Chat/ChatInput.tsx`
- App Config currently duplicates mode/prompt behavior that fits chat better:
  - `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`

## Target UX

### 1. Built-in appgen command behavior
Typing a built-in appgen command in Project Chat should behave like a first-class custom prompt command with an associated mode.

Suggested behavior:
- `/app-json`
  - set mode to `json_render`
  - submit built-in JSON-generation prompt
- `/app-image`
  - set mode to `json_render_with_image`
  - submit built-in image-guided generation prompt
- `/app-prompt`
  - set mode to `prompt_builder`
  - submit built-in prompt-builder baseline
- `/app-mcp`
  - set mode to `mcp_server`
  - submit built-in MCP-oriented baseline

If the user includes suffix text, append it after the built-in baseline prompt.

### 2. No chooser UX
- Do not open a template picker.
- Do not ask the user to pick a saved prompt.
- Do not introduce a second-stage selection flow.

The command should either:
- submit directly, or
- prefill deterministically if we decide that built-in appgen commands should remain editable before send.

This is an open implementation decision, but it should remain simple and uniform.

### 3. Customization path
- Users who want a different baseline create a custom slash command in the existing Slash Commands view.
- That custom command can have whatever prompt text they want.
- We deliberately accept this as the customization model for now.

## Architecture Direction

### 1. One shared built-in command definition source
Create one shared definition table for built-in appgen commands.

Suggested responsibilities:
- command token,
- app-generation mode,
- built-in baseline prompt text,
- execution behavior.

Suggested frontend module:
- `frontend/src/components/Chat/appGenerationSlashCommands.ts`

Do not duplicate prompt text in:
- `chatComposerControls.ts`,
- `ProjectChatCore.tsx`,
- `AppConfigPane.tsx`,
- tests.

### 2. Reuse the custom-command submission shape
Built-in appgen commands should behave similarly to custom slash commands:
- resolve command,
- resolve baseline prompt,
- append optional raw suffix,
- preserve attachments,
- submit once.

This keeps the flow understandable and reduces special-case code.

### 3. Keep mode routing explicit
The slash command definition should explicitly decide:
- which app-generation mode is set,
- whether the flow is JSON-family or chat-driven,
- which built-in baseline prompt is used.

Do not infer routing from prompt text or brittle keyword matching.

## App Config After Refactor

### Keep
- The pane’s purpose should be obvious: “advanced app-definition workbench.”
- `Show Preview`
- `Validate`
- `Save`
- `Create Default` when no spec exists
- `Catalog ID`
- `Spec version`
- `Theme mode`
- `Spec path`
- `Preview config`
- `App Spec JSON`
- `Theme JSON`
- `Assets JSON`
- JSON-generation-specific preview/persistence logic when still useful

### Remove or Reduce
- Prompt Builder and MCP Server as top-level App Config prompt-composition modes
- The generic prompt textbox as the default way to initiate appgen
- Duplicate mode-selection UI that is better owned by slash commands

### Note on raw editing
- The current code clearly intends raw editing to exist.
- We do not need to remove raw editing in this phase.
- If needed later, raw editing can be collapsed under `Advanced`, but that is a separate product decision.

### Recommended visibility split

#### Default visible
- `Show Preview`
- `Create Default` when empty
- `Validate`
- `Save`
- `App Spec JSON`
- validation output / errors

#### Collapsed under `Advanced`
- `Theme mode`
- `Theme JSON`
- `Assets JSON`
- `Preview config`
- `Catalog ID`
- `Spec version`
- `Spec path`

This keeps the pane useful without forcing normal users to stare at internal knobs.

## Implementation Plan

### Phase 0: Test Scaffolding First
- Add Vitest coverage for:
  - built-in appgen command -> mode mapping,
  - built-in appgen command -> baseline prompt mapping,
  - suffix merge behavior,
  - attachment preservation,
  - custom slash commands remaining unaffected.
- Add Playwright coverage for:
  - `/app-json` happy path,
  - `/app-image` happy path,
  - `/app-mcp` happy path,
  - reduced App Config surface behavior.

### Phase 1: Shared Built-in Command Definitions
- Add the shared appgen slash-command definition module.
- Move built-in prompt baselines into that module.
- Keep the shape small and obvious.

### Phase 2: Composer Integration
- Update slash-command execution so built-in appgen commands submit their fixed baseline prompt instead of only changing mode.
- Preserve optional suffix text exactly once.
- Preserve attachments.

### Phase 3: App Config Reduction
- Remove or reduce the duplicate prompt-composition block in App Config.
- Remove Prompt Builder and MCP Server from App Config if they are now fully chat-owned.
- Keep JSON workbench behavior intact.
- Reframe the visible UI so App Config reads as an advanced workbench rather than a general appgen launcher.
- Collapse advanced metadata/styling controls unless they are needed for the current task.

### Phase 4: Cleanup
- Delete obsolete prompt-composition plumbing from App Config.
- Update docs:
  - `docs/reference/chat-sections.md`
  - `docs/reference/app-spec-patching.md`
- Keep the final code path smaller than the current one.

## Testing Plan

### Vitest
- `frontend/src/components/Chat/chatComposerControls.test.ts`
  - built-in appgen command parsing and help output
  - fixed prompt + suffix behavior
- `frontend/src/components/Chat/ChatInput.test.tsx`
  - built-in appgen commands submit expected prompt payload
  - attachments are preserved
  - custom slash commands still work unchanged
- new shared-definition tests if needed
  - command definition completeness
  - no duplicate command tokens

### Playwright
- Add or update specs under:
  - `frontend/tests/e2e/chat/`
  - `frontend/tests/e2e/overview/app-config/`

Required journeys:
- type `/app-json` and see the expected appgen path run
- type `/app-image some extra guidance` and verify suffix handling
- type `/app-mcp` and verify chat-driven behavior
- verify App Config no longer acts like the main prompt-entry surface
- verify App Config still supports preview/save/validate/edit behavior

### CDP visual verification
- Verify the reduced App Config layout.
- Verify the default-vs-advanced visibility split if implemented.
- Verify slash-command appgen behavior in Project Chat.
- Confirm no visual regressions in chat composer feedback.

## Risks and Guardrails
- Risk: built-in prompt text becomes duplicated or drifts.
  - Guardrail: one shared definition table.
- Risk: built-in commands and custom commands diverge in behavior.
  - Guardrail: reuse the same submission mechanics where possible.
- Risk: App Config loses useful JSON-workbench functionality.
  - Guardrail: keep preview/validate/save/edit flows explicitly in scope.
- Risk: we overbuild customization.
  - Guardrail: defer saved-prompt/template work; use custom slash commands as the only override path for now.

## Open Decisions
1. Should built-in appgen slash commands:
   - submit immediately, or
   - prefill the composer and wait for Enter?
2. Should `/app-image` rely on:
   - image attachments in chat,
   - the existing structured image-reference fields,
   - or both?
3. Should raw JSON/theme/assets editing stay always visible, or move under `Advanced` later?

## Definition of Done
- Built-in appgen slash commands submit their own fixed baseline prompts.
- Users can still create custom slash commands for alternative prompts.
- App Config is no longer the primary prompt-entry surface for appgen.
- App Config remains a focused JSON workbench.
- Tests were written first and drove the implementation.
- The final code is smaller, cleaner, and more readable than the current path.
