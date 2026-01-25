# Chat file attachments plan

Add arbitrary file attachments to every chat surface (project chat, chat sections, chat toolkit) with a single attachment model, shared upload/storage pipeline, and consistent UI.

## Goals
- Let users attach arbitrary files to chat messages in Project Chat and Chat sections.
- Preserve attachments in chat history (stored with messages) and make them accessible to listeners.
- Reuse the existing artifacts pipeline for storage (upload, delete, share mode, size limits).
- Map attachments into LLM requests for managed chat, including images and text-based files.
- Keep the chat toolkit API ergonomic for listeners (attachments exposed in send events + helpers).

## Non-goals
- Legacy/backward compatibility for old chat payload shapes (explicitly not required).
- Full document parsing for every binary format in v1 (PDF/Docx/etc can be phased).
- A new standalone file viewer UX (simple list + download/preview is enough).

## Current architecture summary (what we are extending)
- Chat messages are `MessageContent` blocks (`text`, `image_url`, `thinking`) in `backend/setta/types/chat_messages.py`.
- Managed chat sends `UserChatMessage` to `route_get_llm_response` and uses `AgentRunner` to build LLM payloads.
- Scriptable chat emits realtime `ChatSendEvent` payloads containing only `text`.
- File uploads already exist via artifacts (`route_update_artifacts`, `route_import_files_to_artifacts`) and dropzone helpers.

## SDK multimodal inputs (official docs)
- **LiteLLM**: `messages[].content` supports content blocks including `text`, `image_url`, `input_audio`, `video_url`, `file`, and `document`. Reference: https://docs.litellm.ai/docs/completion/input
- **Claude Agent/Code SDK**: streaming JSON input is **text-only** in the SDK docs. For file handling, Anthropic’s Files API supports `file_id` references in message content blocks. References: https://docs.anthropic.com/s/claude-code-sdk , https://docs.anthropic.com/en/docs/build-with-claude/files
- **Codex app-server**: `turn/start` accepts input items of type `text`, `image` (URL), and `localImage` (local path). Reference: https://developers.openai.com/codex/app-server
- **OpenCode SDK**: the SDK is generated from the server OpenAPI spec (served at `/doc` when running `opencode serve`). The CLI supports `--file <path>` attachments, but SDK-level multimodal fields must be confirmed from the OpenAPI schema. References: https://opencode.ai/docs/server/overview/ , https://opencode.ai/docs/cli/
  - From the live OpenAPI spec (0.0.3): `/session/{sessionID}/message` and `/session/{sessionID}/prompt_async` accept `parts` with `TextPartInput`, `FilePartInput`, `AgentPartInput`, `SubtaskPartInput`. `FilePartInput` requires `{ type: "file", mime, url }` and optionally `filename` + `source`.
  - URL strategy decision (recommended): use a temporary HTTP endpoint (tokenized, short TTL) served by Setta to stream artifact bytes to the OpenCode server. Data URLs risk payload size limits; `file://` only works if OpenCode server shares the same filesystem and has access to the artifact path.

## Data model changes
1) **Chat attachment schema**
   - Add `ChatFileAttachment` (or reuse `DropzoneFileAttachment`) with fields: `id`, `name`, `mimeType`, `size`.
   - Add `attachments: list[ChatFileAttachment]` to `ContentChatMessage` (or at minimum to `UserChatMessage`).
   - Default `attachments` to `[]` so newly built messages are valid without extra fields.
   - Update `BaseChatMessageUnion` generation after schema change (run `pnpm generate`).

2) **Chat send event**
   - Extend `ChatSendEvent` in `backend/setta/types/chat_toolkit.py` to include `attachments`.
   - Update `on_chat_send_event` to parse attachments from realtime payloads.

3) **Constants/limits**
   - Centralize attachment limits (max files, max bytes, allowed mime types) in one place:
     - Backend: new constants in `backend/setta/utils/constants.py` or a new `chat_attachments.py`.
     - Frontend: generated constants in `frontend/src/utils/c.ts` + a small helper in `frontend/src/utils/attachments.ts`.
   - Align with dropzone defaults (25MB file size, stateful uploads) unless we decide to tighten for chat.

## Backend work
1) **Attachments in chat messages**
   - Update `backend/setta/types/chat_messages.py` to include attachments in message models.
   - Ensure `to_openai_format()` does **not** emit raw `attachments` fields (strip or transform).

2) **LLM request mapping (managed chat)**
   - Add an attachment resolver in `backend/setta/llm/agent_runner.py`:
     - Load file bytes from artifact id (use `Artifacts.read_file_from_disk` or equivalent path resolver).
     - For `image/*`: convert to `image_url` content using data URLs.
     - For text-like formats: inline as `MessageTextContent` blocks with filename headers.
     - For binary/unsupported types: decide on a v1 policy (reject with clear error, or pass a placeholder + metadata).
   - Apply resolver in `_build_llm_request_payload()` before sending to provider.

3) **External agent adapters**
   - Update external adapters (Claude, OpenCode, Codex app server) to accept attachments:
     - If adapter supports file inputs, map directly using that SDK’s content blocks / payload format.
     - Otherwise, reuse the same “inline text / image_url / placeholder” conversion logic.
   - Add a feature flag or config guard if any adapter cannot support attachments.
   - OpenCode-specific mapping: add `FilePartInput` entries into the `parts` array (type `file`, `mime`, `url`, `filename`) using the temporary HTTP endpoint (see above).

4) **Chat toolkit**
   - Update `backend/setta/api/chat_toolkit.py`:
     - `ChatSession.open_from_event()` should include attachments in the first message.
     - Add helper builders (e.g., `message_attachment`, `user_message_with_attachments`).
   - Update `docs/chat-toolkit.md` to show attachments in event payload + examples.

5) **Share deployments**
   - Extend `backend/setta/share/deployment_utils.py` to rewrite attachment artifact paths inside chat messages (similar to dropzone behavior).

## Frontend work
1) **Chat input UX (Project Chat + Chat section)**
   - Add attachment UI to `frontend/src/components/Chat/ChatInput.tsx`:
     - Attach button (file picker) + drag-and-drop target.
     - Inline list of selected files with remove buttons + file size.
     - Clear attachments on send or on explicit “remove all”.
   - Reuse dropzone helpers for reading files + uploading to artifacts (same limits + notifications).
   - Support adding files via:
     - local file picker (`<input type="file" multiple>`)
     - drag-and-drop
     - “Attach from project” using `DropzoneFilePickerModal`.

2) **Chat message rendering**
   - Extend `frontend/src/components/Chat/ChatMessages.tsx` to render attachments:
     - Image attachments as thumbnails (use `ChatImage`).
     - Non-image attachments as file pills with name + size (optional download action if we add a backend route).

3) **State + actions**
   - Update `frontend/src/state/actions/ai.ts`:
     - `submitMessage()` takes `attachments` and includes them in `UserChatMessage`.
     - Optimistic message insertion includes attachments for immediate UI feedback.
   - Update chat section state wiring in `frontend/src/components/Section/Layouts/ChatArea.tsx`:
     - Keep draft attachments alongside `inputText` (persist in section state or local state; choose one and stick with it).
     - Include attachments in realtime `ChatSendEvent` payload for scriptable mode.

4) **Generated types**
   - After backend schema changes, run `pnpm generate` (with `source activate.sh && cd frontend && pnpm generate`) to sync:
     - `frontend/src/utils/generatedTypes.ts`
     - `frontend/src/utils/generatedEndpoints.ts`

## Suggested implementation phases
0) **Phase 0 – Confirm SDK schemas**
   - Pull OpenCode OpenAPI spec from `/doc` on a running server to confirm attachment fields.
   - Validate Claude Agent/Code SDK constraints and file handling strategy (text-only streaming + Files API fallback).

1) **Phase 1 – Data + storage**
   - Add attachment fields/types.
   - Update realtime event payloads + chat toolkit parsing.
   - Implement upload + storage using artifacts (no LLM integration yet).

2) **Phase 2 – Managed chat LLM mapping**
   - Attachment resolver in `AgentRunner` (images + text-based files).
   - Policy for unsupported file types (reject or placeholder).

3) **Phase 3 – External agents**
   - Adapter-specific mapping or fallback logic.

4) **Phase 4 – UI polish**
   - Download/preview behavior (if desired).
   - Empty-state + error messaging, share-mode tweaks.

## Tests to add/update
- Backend
  - Update chat message tests to include attachments (`tests/llm/*`, `tests/agentic/*`, `tests/project_state/*`).
  - New tests for `ChatSendEvent` parsing with attachments.
  - Agent runner: verify attachments are converted into request payloads.
- Frontend
  - Add a `ChatInput` test for attachment selection/clear (new or existing tests).
  - Update any snapshot/logic tests that depend on `BaseChatMessageUnion` shape.

## Docs to update
- `docs/chat-toolkit.md` (event payload includes attachments).
- `docs/chat-sections.md` (send event contract + state notes).
- Optional: `docs/reference/listener-flows.md` if it mirrors the send payload.

## Open questions
- Should attachments be allowed on assistant/system messages or only user messages?
- What is the exact policy for unsupported/binary file types in managed chat? (Recommended: soft‑degrade with metadata placeholders, only inline known text/* and images.)
- Do we want a dedicated backend download route for attachments, or is metadata display enough?
- Should we store draft attachments in persistent section state (collab) or local component state?
- For SDKs that are text-only (Claude Agent/Code SDK streaming), do we prefer inline text extraction or file_id references via Files API?

## Recommended decisions
- **OpenCode attachment URL strategy**: implement a tokenized, short‑lived HTTP endpoint in Setta that streams artifact bytes and pass that URL in `FilePartInput.url`.
- **Unsupported/binary file policy**: soft‑degrade by adding a text placeholder block containing filename/mime/size/hash. Only inline content for text/* files and images (for image‑capable models). A strict rejection mode can be added later.

## Tokenized download route (sketch)
- **Route**: `GET /api/attachments/{token}` (or `/api/artifacts/download/{token}`).
- **Token payload**: `{ artifactId, projectConfigId, sessionId?, expiresAt }` signed with a server secret.
- **Validation**: verify signature + expiry; in share mode, validate sessionId matches the share session.
- **Response**: stream bytes with `Content-Type` set from stored metadata (fallback `application/octet-stream`) and `Content-Disposition: inline; filename="..."`.
- **Storage lookup**: resolve `artifactId` via `Artifacts` path resolver; read bytes from disk (no base64).

## Files touched (guide)
- Backend: `backend/setta/types/chat_messages.py`, `backend/setta/types/chat_toolkit.py`, `backend/setta/routers/ai.py`, `backend/setta/llm/agent_runner.py`, `backend/setta/api/chat_toolkit.py`, `backend/setta/share/deployment_utils.py`.
- Frontend: `frontend/src/components/Chat/ChatInput.tsx`, `frontend/src/components/Chat/ChatMessages.tsx`, `frontend/src/components/Section/Layouts/ChatArea.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`, `frontend/src/state/actions/ai.ts`, `frontend/src/utils/dropzone.ts`.
