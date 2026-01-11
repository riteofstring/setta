# Chat section AI port plan

## Goals
- Make Chat sections fully functional for LLM chat (streaming, tools, history).
- Reuse the ProjectLevelAI chat UI to avoid duplicate logic.
- Keep per-section configuration in section configs.
- Allow each Chat section to select its own LLM config.
- Persist chat section sessions across reloads.
- Keep Chat sections fully scriptable so listener scripts can own or modify state.
- Provide a zero-setup "managed" mode wired to the LLM chat manager.

## Current state
- `frontend/src/components/Section/Layouts/ChatArea.tsx` is a stub and references `useAllSectionArtifacts`, which does not exist.
- `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx` returns null (no config UI).
- `backend/setta/types/section_impls.py` defines `ChatSectionImpl` with only size metadata.
- Project-level chat is the only working LLM UI (`frontend/src/components/Panes/Overview/ProjectLevelAI`).

## Proposal
- Treat Chat sections like other section types at the core: fully scriptable state + listener-driven updates.
- Add an optional "managed" mode that wires the section to the LLM chat manager with sensible defaults.
- Extract shared chat UI primitives (message list + input + tool call rendering) from ProjectLevelAI.
- Rebuild Chat sections to use those shared components and the existing AI store/actions.
- Store per-section settings (managed mode flag, LLM config id, deep think, optional display toggles) on `ChatSectionImpl`.
- Persist chat session IDs per section (recommended: `setta_files/chat_sections.json` keyed by projectConfigId + sectionId).

### Managed vs scriptable behavior
- Scriptable mode: listener scripts can read/write chat section state just like other sections.
- Managed mode: section config enables LLM chat manager integration; state updates come from LLM chat store/actions.
- Listener scripts can still modify state in managed mode, but managed actions should be considered the default driver.

## Plan
1. Data model and config shape (backend types)
   - Extend `ChatSectionImpl` with:
     - `managed` (bool) to toggle LLM integration.
     - `llmConfigId` (string or null) for managed mode.
     - `deepThink` (bool).
     - Optional UI toggles (show tools, show system prompts, etc) if needed.
   - Document how listener scripts are expected to read/write chat section state.
2. Backend: chat manager integration (managed mode)
   - Ensure `llmConfigId` is used per section when sending chat requests.
   - Add `chat_sections.json` helpers to `backend/setta/database/db_objs.py`:
     - get/set mapping: `projectConfigId` + `sectionId` -> `chatId`.
     - clean up on section delete.
   - Add project-manager request types and handlers for:
     - Updating `ChatSectionImpl` settings (managed/llmConfigId/deepThink).
     - Creating/attaching/clearing chat IDs for managed mode.
3. Backend: scriptable state surface
   - Define the chat section state payload (messages, input text, status, etc) so listeners can modify it.
   - Add/confirm listener hooks for chat section state changes without requiring LLM manager.
4. Frontend: shared chat UI primitives
   - Extract message rendering + tool call UI + input into shared components.
   - Update `ProjectChatCore` to use shared components.
5. Frontend: ChatArea rebuild
   - For managed mode:
     - Load the section chat ID mapping.
     - Fetch chat details via `getLLMChat`.
     - Submit messages via `submitMessage`.
   - For scriptable mode:
     - Render from section state and delegate actions to listener-driven updates.
6. Frontend: Chat section config UI
   - Implement `ChatAreaSettings` with:
     - Managed mode toggle.
     - LLM config selection.
     - Deep-think toggle.
   - Persist config changes via generated endpoints.
   - Add a "New chat" action to reset the section's chat ID mapping in managed mode.
7. Codegen + sync
   - Run `source activate.sh && cd frontend && pnpm generate` after backend changes.
   - Ensure frontend uses generated endpoints for new chat-section routes.
8. Validation
   - Manual: create a Chat section in managed mode, pick an LLM, send messages, refresh to confirm persistence.
   - Manual: create a Chat section in scriptable mode and verify listeners can alter the state.
   - Manual: create multiple Chat sections and verify they keep separate chat sessions.

## Open questions
- Should `managed` be the default for new Chat sections, or be opt-in via templates?
- Should listeners be able to intercept/transform outbound messages before they hit the LLM manager?
- Should `chatId` live in `ChatSectionImpl` instead of `chat_sections.json`?
- Should Chat sections expose chat history selection, or keep history in the Project-level AI pane only?
