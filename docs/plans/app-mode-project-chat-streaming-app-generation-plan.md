# App Generation Via Project Chat + Streaming Toggle Plan

## Context (As Of 2026-02-07)

Today there are effectively two different UX flows for “AI generates an app”:

- **Project chat tool flow:** The user (or `Generate App`) guides the LLM to call `setta__set_app_definition`. The app preview updates only when the tool result arrives.
- **App pane streaming flow:** A separate “Streaming Generation” panel sends a prompt to a dedicated streaming endpoint and updates the preview progressively.

This split is confusing because the “AI” experience is fragmented across two different input surfaces, and the streaming experience is not obviously connected to the project chat.

## Goals

- **Single AI entrypoint:** App generation should be done through **Project AI Chat**. Users should be able to ask “make me an app …” and have it work without copy/paste.
- **Streaming is a mode, not a separate flow:** “Streaming mode” should be a **toggle in the App Spec pane**, not a separate prompt UI.
- **Generate App stays a helper:** The `Generate App` button should only prefill a good prompt in project chat. It should also tell the model which mode is enabled and which tool to use.
- **Live preview while generating (when streaming enabled):** The app preview should update progressively as the AI builds the spec.
- **No manual apply step:** The end state should still be a persisted app spec (same as `setta__set_app_definition` today).

## Non-Goals

- Replacing the project chat UI with a specialized app generator chat UI.
- Building a full WYSIWYG app editor.
- Guaranteeing streaming support for every engine type on day 1 (internal LLM vs external agent). Start with the managed/internal chat pipeline first.

## Proposed UX

App Config pane (`frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`):

- Replace the separate “Streaming Generation” panel with a single toggle:
  - Label: `Streaming mode` (or `Stream preview while AI generates`).
  - Behavior: determines which tool the LLM should use for app generation and whether we expect progressive preview updates.
- Keep `Generate App` as a button that navigates to Project AI Chat with a prefilled prompt.
  - The prefilled prompt includes:
    - whether streaming is enabled
    - the exact tool to call (`setta__set_app_definition` vs a new streaming tool)
    - “do not paste JSON into chat” guidance

Project AI Chat:

- User can ask for an app normally.
- When streaming mode is enabled, the assistant produces a streaming tool call that drives progressive preview updates.

Preview behavior:

- During streaming generation, the preview is driven by a temporary override (already exists via `useAppPreview.previewSpecOverride`).
- When the tool finishes successfully, the persisted app spec updates (tool result), and we clear the streaming override.

## Architecture Direction

The key constraint is: **streaming preview must be driven by the same “project chat” LLM call**, not a second hidden LLM call. That implies:

- The model must stream something we can apply incrementally.
- The transport we already have for incremental UI updates from the chat pipeline is `ToolArgumentPreviewDeltaEvent`.

Therefore, the recommended design is:

1. Add a new MCP tool that the model uses in streaming mode.
2. That tool takes a single large **string** argument containing newline-delimited JSON patch operations (json-render `useUIStream`-style patches).
3. While the model is streaming tool arguments, the backend emits `ToolArgumentPreviewDeltaEvent` deltas for that string.
4. The frontend parses/apply patches as they arrive to update `useAppPreview.previewSpecOverride`.
5. When the tool executes, it parses the patch string, materializes the final `appSpec`, validates it, persists it (same storage as today), and returns an `AppDefinitionResponse` so the existing “auto-apply tool result” behavior stays intact.

This mirrors the existing “stream into code sections while tool args stream” pattern, but for app specs.

## Backend Plan

### 1. Introduce a Streaming Tool (MCP)

Add a new `BaseProjectManager` tool (preferred) or a new `setta_tool`:

- Tool name (suggested): `stream_app_definition`
  - MCP name becomes `setta__stream_app_definition`.
- Request model (suggested minimal v1):
  - `patches: str` (newline-delimited JSON objects: `{op,path,value?}`)
  - Optional: `appSpecPath: str | None` (match `set_app_definition` behavior)
  - Optional: `catalogId/appSpecVersion/theme/assets/...` (only if we need them in v1; otherwise leave metadata unchanged and just set the spec)

Execution behavior:

- Parse `patches` into patch ops (ignore blank lines and `//...` comments).
- Apply patch ops to build a final `appSpec` (start from `{root: "", elements: {}}` or `None` then require setting `/root` + `/elements/...`).
- Validate using the same validators as `set_app_definition`.
- Persist via the same code path as `set_app_definition` (write the app spec JSON file + update `appDefinition` fields).
- Return `AppDefinitionResponse` with `structuredContent.appSpec` and `structuredContent.appDefinition`.

### 2. Enable Tool-Argument Preview For Patch Streaming

We need the backend to emit `ToolArgumentPreviewDeltaEvent` for the `patches` string while the model is composing it.

Changes:

- Extend `ToolArgumentPreviewKind` (`backend/setta/mcp/tool_metadata.py`) with a new value:
  - `appSpecPatch = "appSpecPatch"`
- Attach `tool_argument_preview` metadata to the new tool:
  - `previewValuePath`: `patches`
  - `previewKind`: `appSpecPatch`
  - `targetIdPathsByType`: ideally empty (this is not naturally tied to a section/codeObj)

Today preview emission requires at least one canonicalized target id. To support app-level streaming:

- Update `backend/setta/llm/chat_toolkit/managed/tool_argument_preview.py` to allow preview events where `targetIdPathsByType` is empty.
  - If `targetIdPathsByType` is empty, treat `target_ids_by_type` as `{}` and still emit preview deltas.

### 3. Share/Deployment Safety

- Enforce IDE-only semantics for the streaming tool, same as the prior streaming endpoint intent.
  - Either guard inside the tool (check share mode) or rely on the existing share-mode tool allowlist (prefer an explicit guard so the behavior is obvious).

### 4. Consolidate Patch Parsing/Apply Logic

We already have patch parsing logic in `backend/setta/routers/app_spec_streaming.py`.

Plan:

- Extract shared helpers to a small module (example):
  - `backend/setta/app/spec_patch_stream.py`
  - Functions: `parse_patch_lines(str) -> list[PatchOp]`, `apply_patch_ops(spec, ops) -> spec`
- Reuse those helpers in:
  - the new MCP tool
  - (optional) the existing `/streamAppSpec` endpoint until we delete it

### 5. Update System Prompt / Guidance

Update `backend/setta/mcp/system_prompt.md` (App mode section) to:

- Mention the streaming tool and when to use it.
- Clarify output format for streaming tool:
  - Provide patch ops in `patches` (string) rather than pasting JSON in chat.

## Frontend Plan

### 1. Replace Streaming Panel With Toggle

In `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`:

- Delete the dedicated Streaming Generation prompt UI (`Generate (Streaming)` button, prompt textarea, Apply/Discard).
- Add a toggle in the App Spec pane:
  - Store preference in local storage (likely `useLocalStorage`) so it persists across reloads.
  - Default: off.

### 2. Update Generate App Helper Prompt

In `handleGeneratePrompt()`:

- Read the streaming toggle state.
- If streaming is **off**:
  - Keep current instruction: call `setta__set_app_definition` with `appSpec`.
- If streaming is **on**:
  - Instruct: call `setta__stream_app_definition` and provide newline-delimited JSON patch ops in the `patches` string argument.
  - Include the same catalog + sections summaries.
  - Continue to forbid pasting JSON into the chat body.

Optional upgrade:

- Include a short “tool selection rule” in the prompt:
  - “Streaming mode is ON, so you MUST use `setta__stream_app_definition`.”

### 3. Apply Streaming Patch Deltas To App Preview

Extend `frontend/src/state/actions/ai.ts` preview handling:

- Update `applyToolArgumentPreviewDeltaToPreviewStore()` to handle the new `preview_kind`:
  - Accumulate incoming `preview_value_delta` into a per-tool-call buffer.
  - Parse complete newline-delimited patch JSON objects as they become available.
  - Apply them to an in-memory `Spec` accumulator (start empty).
  - Update `useAppPreview.previewSpecOverride` on each applied patch batch so the preview updates progressively.

Recommended implementation detail:

- Keep accumulator state in a dedicated store keyed by `projectConfigId` + `toolCallId`:
  - `bufferText` (for partial line buffering)
  - `spec` (current accumulated spec)
  - `isStreaming` flag
- Clear accumulator state on:
  - tool result for `setta__stream_app_definition`
  - message stop/finalized
  - explicit user “Stop” actions (if we add them later)

### 4. Tool Result Handling

We already auto-apply tool results for:

- `setta__set_app_definition`
- `setta__update_app_definition`

Extend the allowlist in `frontend/src/state/actions/ai.ts` so tool results for:

- `setta__stream_app_definition`

also flow into `maybeApplyAppDefinitionToolResult(...)` (or a parallel handler).

### 5. Cleanup / Deprecation

- After the chat-driven streaming flow is stable, delete the old direct streaming UI and potentially remove the `/streamAppSpec` endpoint if it is no longer used.
  - If we keep the endpoint, keep it as an internal debug path only and remove the App pane entrypoint.

## Testing Plan

### Backend (pytest)

- Unit test: patch parsing ignores blank lines and `//` comments and rejects invalid ops/paths.
- Unit test: patch apply builds a valid spec from a patch stream.
- Integration test: `setta__stream_app_definition` tool persists a spec and returns `AppDefinitionResponse`.
- Safety test: tool is denied in share mode if applicable.

### Frontend (Vitest)

- `AppConfigPane` prompt generation:
  - streaming toggle off -> prompt references `setta__set_app_definition`
  - streaming toggle on -> prompt references `setta__stream_app_definition`
- Streaming preview reducer:
  - feeding `ToolArgumentPreviewDeltaEvent` (appSpecPatch) updates `useAppPreview.previewSpecOverride` progressively
  - tool result clears override and sets persisted app spec via existing handler

### Frontend (Playwright)

E2E test that proves “project chat streaming updates preview” without using the removed panel:

1. Open App pane, enable preview.
2. Enable streaming toggle.
3. Simulate a streaming tool argument preview delta stream by POSTing to `/emitChatStreamDelta`:
  - Send multiple `tool_argument_preview_delta` chunks with `preview_kind: "appSpecPatch"` and patch lines split across deltas.
  - Assert that a UI element in App Preview appears/changes before the final tool result event is emitted.
4. Emit a final `tool_result` for `setta__stream_app_definition` with structuredContent containing the final `appSpec`.
5. Assert final preview matches the persisted spec.

## Rollout Steps

1. Add streaming tool + preview kind + frontend patch application.
2. Add the App Config toggle and update the Generate App helper prompt.
3. Add tests (backend, Vitest, Playwright) and stabilize.
4. Remove the old Streaming Generation panel.
5. Decide whether to delete `/streamAppSpec` entirely or keep it as a debug-only route.

## Open Questions

- Should the streaming tool update only `appSpec`, or also allow streaming updates to `theme/assets/actions/dataBindings`?
- Should patch streams be “build from scratch” only, or optionally diff from current persisted spec?
- Do we need a user-facing “Stop streaming generation” control in chat, and if so, what is the cancellation model?

