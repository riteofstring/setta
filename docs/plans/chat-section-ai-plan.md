# Chat section AI port plan

## Goals
- Make Chat sections fully functional for LLM chat (streaming, tools, history).
- Reuse the ProjectLevelAI chat UI to avoid duplicate logic.
- Keep per-section configuration in section configs.
- Allow each Chat section to select its own LLM config.
- Persist chat section sessions across reloads.

## Current state
- `frontend/src/components/Section/Layouts/ChatArea.tsx` is a stub and references `useAllSectionArtifacts`, which does not exist.
- `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx` returns null (no config UI).
- `backend/setta/types/section_impls.py` defines `ChatSectionImpl` with only size metadata.
- Project-level chat is the only working LLM UI (`frontend/src/components/Panes/Overview/ProjectLevelAI`).

## Proposal
- Extract shared chat UI primitives (message list + input + tool call rendering) from ProjectLevelAI.
- Rebuild Chat sections to use those shared components and the existing AI store/actions.
- Store per-section settings (LLM config id, deep think, optional display toggles) on `ChatSectionImpl`.
- Persist chat session IDs per section (recommended: `setta_files/chat_sections.json` keyed by projectConfigId + sectionId).

## Plan
1. Backend: chat section settings + mapping
   - Extend `ChatSectionImpl` with `llmConfigId` and `deepThink` (and optional UI toggles if needed).
   - Ensure `llmConfigId` is used per section when sending chat requests.
   - Add `chat_sections.json` helpers to `backend/setta/database/db_objs.py`.
   - Add project-manager request types and handlers for updating chat section config.
   - Add routes to get/set chat section chat IDs (create, attach, clear).
   - Clean up mapping when chat sections are deleted.
2. Frontend: shared chat UI and ChatArea rebuild
   - Extract message rendering + tool call UI + input into shared components.
   - Update `ProjectChatCore` to use shared components.
   - Reimplement `ChatArea` to:
     - Load the section chat ID mapping.
     - Fetch chat details via `getLLMChat`.
     - Submit messages via `submitMessage`.
3. Frontend: Chat section config UI
   - Implement `ChatAreaSettings` with LLM config selection and deep-think toggle.
   - Persist config changes via generated endpoints.
   - Add a "New chat" action to reset the section's chat ID mapping.
4. Codegen + sync
   - Run `source activate.sh && cd frontend && pnpm generate` after backend changes.
   - Ensure frontend uses generated endpoints for new chat-section routes.
5. Validation
   - Manual: create a Chat section, pick an LLM, send messages, refresh to confirm persistence.
   - Manual: create multiple Chat sections and verify they keep separate chat sessions.

## Open questions
- Should `chatId` live in `ChatSectionImpl` instead of `chat_sections.json`?
- Should Chat sections expose chat history selection, or keep history in the Project-level AI pane only?
