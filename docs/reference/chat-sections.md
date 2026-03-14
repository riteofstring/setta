# Chat Sections

Chat sections render a chat UI inside the canvas. They can run in managed mode (Setta LLM pipeline) or scriptable mode (listener-driven). Both modes emit realtime action events so listeners can observe send/stop activity.

## Core state fields

Chat sections store the following fields on the section impl:

- `managed`: toggles managed vs scriptable mode.
- `engineConfigId`: selected engine config (managed mode only).
- `transcriptionProfileId`: selected transcription profile for provider transcription.
- `dictationMode`: transcription mode preference (`auto`, `browser`, `provider`).
- `chatId`: chat store id for managed mode (null means "new chat").
- `thinking`: toggles thinking behavior for managed mode.
- `permissionMode`: runtime permission mode (`minimal`, `yolo`, or `config_toml_custom`).
- `searchEnabled`: runtime search toggle for managed runs.
- `messages`: list of chat messages (scriptable mode state; managed mode uses chat store). Messages may include `attachments`.
- `inputText`: current input text for scriptable mode.
- `waitingForResponse`: whether the UI shows an inflight response.
- `toolCallArguments`: map of tool call ids to argument JSON text (streaming UI support).
- `activeBranchId`: active branch id for scriptable mode; `messages` mirrors this branch.
- `branches`: map of branch id -> branch metadata (`messages`, `createdAt`, `parentBranchId`, `branchFromMessageId`) for scriptable mode edits.

## Managed mode

Managed mode uses the AI routes backed by `backend/setta/routers/ai.py` and
`backend/setta/llm/agent_runner.py`:

- The UI blocks sends until `engineConfigId` is selected and at least one engine config is available.
- `submitMessage` calls `route_get_llm_response` with `chatId`, `engineConfigId`, `thinking`, plus optional `agentProfileId` and `sectionId` (Chat sections pass their section id; Project Chat passes `null`).
- Managed sends also include runtime execution settings (`permissionMode`, `searchEnabled`) and the backend injects those settings into the run prompt metadata.
- Streaming updates arrive as `LLMStreamingResponse` events with `sectionId` set, and the frontend applies them to the chat section state.
- "New Chat" sets `chatId` to `null`; the next send creates a new chat and updates `chatId` after the response returns.
- Stop requests call `route_stop_llm_chat` with the active `chatId`.
  - Response includes `alreadyStopped`, plus optional `stoppedRunId` and `stoppedMessageId` for stop-state reconciliation.

## Composer controls

The chat composer supports local slash commands and execution controls:

- Supported slash actions: `/new`, `/resume`, `/help`, `/permissions`, `/model`, `/search`.
- Availability by surface: Project Chat includes `/model`, `/permissions`, and `/search`; Managed Chat section includes `/model` and `/permissions`; Scriptable Chat section includes `/permissions` only (plus `/new`, `/resume`, `/help`).
- Project Chat also supports per-project custom prompt slash commands defined in the `Slash Commands` aux view.
- For external-agent Project Chat, the composer now separates recognized slash commands from executable slash commands. Native commands discovered from current project run metadata can be recognized before authority fully loads, return local feedback, refresh authority, and then retry resolution instead of falling through as plain chat text.
- Slash commands are handled client-side; unavailable commands return local feedback and are not sent as LLM prompts.
- Footer controls always show permission mode when execution controls are enabled; search toggle is shown only where `searchEnabled` is mutable in that surface.

## Dictation

- Chat and transcription are configured independently:
  - `engineConfigId` chooses the chat runtime.
  - `transcriptionProfileId` chooses the transcription runtime.
- Transcription profiles own the provider config reference (`transcriptionLlmConfigId`).
- Provider transcription uses session routes:
  - `POST /api/startTranscriptionSession` with `transcriptionProfileId` (+ optional `language`)
  - `POST /api/appendTranscriptionAudio` with `sessionId`, `audioPcm16Base64`, `sampleRateHz`, `channels`
  - `POST /api/stopTranscriptionSession` with `sessionId`
  - `POST /api/cancelTranscriptionSession` with `sessionId`
- Dictation mode is explicit in AI settings (`auto`, `browser`, `provider`):
  - `auto`: prefers provider dictation when the selected transcription profile resolves to a valid config, otherwise falls back to browser dictation.
  - `browser`: always uses browser dictation and never calls provider transcription.
  - `provider`: always attempts provider dictation and shows an explicit configuration error when unavailable.
- Provider transport behavior:
  - `realtime`: streams chunked PCM and receives incremental transcript deltas.
  - `file`: captures full audio and transcribes once on stop.
- Provider dictation is available for both internal and external chat engines.
- Browser dictation uses `SpeechRecognition`/`webkitSpeechRecognition` and keeps listening across `onend` events until the user stops mic capture.

## Scriptable mode

Scriptable mode keeps chat state inside the section:

- The UI updates `messages`, `inputText`, `waitingForResponse`, and `toolCallArguments` via `route_set_chat_section_state` (optimistic).
- Use listener code plus the chat toolkit to stream assistant content, append tool results, and sync the section state.
- `ChatSectionSyncClient.update_from_chat` can rebuild the section state from chat history when you want a full refresh.
- Listener chat history accepts an `engineConfigId` for internal engines, or `None` for scriptable-only chats.

## Editing and branching

- Editing a user message creates a new branch instead of mutating existing history.
- Managed mode edits start a new chat id. The backend truncates history at `branchFromMessageId`, replaces that message, and stores branch metadata on the new run (`branchParentChatId`, `branchFromMessageId`, `branchRootChatId`, `branchCreatedAt`).
- Scriptable mode edits create a new entry in `branches` with `parentBranchId` and `branchFromMessageId`. The UI switches `activeBranchId` to the new branch and mirrors its `messages`.
- The branch switcher UI uses these branch fields and metadata to navigate sibling branches.

## Attachments

- Chat inputs support file attachments (drag/drop, Attach button, and the Project picker in IDE mode).
- Attachments are stored as File artifacts; messages and send payloads carry `attachments` metadata (`id`, `name`, `mimeType`, `size`).
- Limits use the shared attachment policy scope `chat`, driven by `C.CHAT_ATTACHMENTS_MAX_FILES` (0 disables, negative = unlimited), `C.CHAT_ATTACHMENTS_MAX_FILE_BYTES`, and `C.CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES`.
- In share mode, attachments require `allowParamChanges`; the UI disables attachment actions and the backend enforces the same policy on artifact updates.
- Clients resolve download URLs via `Route.GET_ATTACHMENT_DOWNLOAD_URL(S)`; tokens expire after `C.CHAT_ATTACHMENTS_TOKEN_TTL_SECONDS`.
- The chat UI previews attachments in-place; clicking an attachment opens a preview dialog (images, text, PDF, audio, video). Large files may be truncated or show a "preview unavailable" message.
- Managed mode inlines attachments into the LLM prompt: text files are inserted as `[Attachment: ...]` blocks, supported images (JPEG/PNG/GIF/WebP) are embedded as data URLs, and other files are represented by metadata placeholders.
- Unsupported image types are rejected client-side and skipped during attachment import.
- External agents receive attachments as text blocks and/or URLs depending on adapter type. See `docs/reference/external-agents.md`.

## Agentic links

Chat sections can link to other sections and agents without touching codegen edges:

- Context sources: `Section -> Chat` edges that define context inputs.
- Scope sections: `Chat -> Section` edges that define output or scope boundaries.
- Linked agents: `Chat <-> Chat` edges for agent-to-agent relationships.

These links live on `ProjectConfig.agenticEdges`, render as a separate edge layer,
and are editable via the Chat settings "Context & Links" panel or by dragging the
agentic handles on sections.

Context sources also define how context is injected:

- `reference_only`: include label/type/id only.
- `inline_text`: include a deterministic excerpt of the section content.
- `summary`: prefer a cached summary (when available), otherwise fall back to an excerpt.

Agentic edges are also used for agentic scope enforcement: MCP tool calls made on
behalf of a scoped Chat section are restricted to the sections reachable via
these edges. If a Chat section has no edges, it effectively has no tool access.
Use Project Chat (unscoped) for full access.

Linked chat edges also back the `invoke_linked_chat` MCP tool:

- It can invoke only a directly linked target from a `chat_chat` edge.
- It requires section-scoped agentic context; unscoped Project Chat cannot call
  it implicitly.
- The target chat section reuses or persists its managed `chatId` binding before
  starting the run.
- Recursion is bounded to one nested hop and cycles are rejected explicitly.
- Runtime policy still applies: linked-chat invocation requires LLM access and
  run-start authorization.

## Realtime action events

Both modes emit `RealtimeDependencyEvent` for the chat section when the user sends or stops:

Send payload (JSON string):

```json
{
  "action": "send",
  "sectionId": "section-id",
  "messageId": "message-id",
  "text": "hello",
  "attachments": [
    {
      "id": "artifacts/01J4.../notes.txt",
      "name": "notes.txt",
      "mimeType": "text/plain",
      "size": 1203
    }
  ],
  "role": "user",
  "timestampMs": 1710000000000,
  "managed": true
}
```

`attachments` is always present (empty when none) and references artifacts for the attached files.

Stop payload (JSON string):

```json
{
  "action": "stop",
  "sectionId": "section-id",
  "timestampMs": 1710000000000,
  "managed": false
}
```

Listener tips:

- Register with the chat section dependency and `dependency_mode=ListenerDependencyMode.REALTIME_ONLY` to handle send/stop events.
- Use `on_chat_send_event`, `on_chat_stop_event`, or `on_chat_action_event` from `setta.api.chat_toolkit` to parse `ctx.events`.

## Listener example (ChatSession)

```python
from setta.api import SettaListener
from setta.api.chat_toolkit import ChatSession, ToolCallBuilder, on_chat_send_event
from setta.types.listener import ListenerDependencyMode

listener = SettaListener(project_name="Demo Project")


@listener.listen(
    deps=["Chat"],
    dependency_mode=ListenerDependencyMode.REALTIME_ONLY,
)
async def on_chat(state, ctx) -> None:
    section_id = ctx.ids.section_id("Chat")
    event = on_chat_send_event(ctx, section_id=section_id)
    if not event:
        return

    session = await ChatSession.open_from_event(
        ctx=ctx,
        section_id=section_id,
        engine_config_id="engine-llm",
        event=event,
    )

    async def normalize(chunk):
        if chunk.text:
            await session.text_delta(chunk.text)
        if chunk.tool_call:
            await session.tool_call_delta(
                ToolCallBuilder.from_name_and_args(
                    name=chunk.tool_call.name,
                    arguments=chunk.tool_call.arguments,
                ),
                arguments_delta=chunk.tool_call.arguments_delta,
            )

    await session.stream(
        provider_stream=provider.stream(event.text),
        normalize_chunk=normalize,
        run_tools=True,
    )
```

## Related docs

- `docs/reference/chat-toolkit.md`
- `docs/reference/mcp-system-overview.md`
- `docs/reference/project-chat-windowing.md`
