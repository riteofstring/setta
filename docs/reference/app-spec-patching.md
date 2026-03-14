# App Spec Patching

Setta currently has two patch/update paths for app definitions, plus an
app-generation mode contract that decides whether generation is in-pane streaming
or chat-driven tool execution.

Project Chat is the primary prompt surface for app generation. Built-in slash
commands `/app-json`, `/app-image`, `/app-prompt`, and `/app-mcp` carry fixed
baseline prompts, optionally append user suffix text, and submit chat requests
with an explicit `appGenerationMode`. App Config remains the advanced workbench
for previewing, validating, saving, and manually editing the resulting app
definition.

## 1) Persistent Updates: JSON Merge Patch

Used by:

- `BaseProjectManager.update_app_definition()` (`backend/setta/project_state/base_project_manager.py`)

This applies a **JSON Merge Patch** to the stored app definition/spec. Use this
for non-streaming, persisted edits (for example: "set this one field" or "apply
this config change").

## 2) Streaming Preview / Generation: JSONL JSON-Pointer Patch Ops

Used by:

- `/api/streamAppSpec` (`backend/setta/routers/app_spec_streaming.py`)
- `setta__stream_app_definition` (`backend/setta/mcp/tools/app_tools.py`)

This consumes **newline-delimited JSON (JSONL)** where each line is an operation
using JSON Pointer paths (for example: `{"op":"set","path":"/elements/foo", ...}`).

This format is designed for progressive UI updates while a model is generating a
spec, and matches streaming UI contracts (for example `@json-render/react`'s
`useUIStream`).

### `/api/streamAppSpec` generation mode inputs

`StreamAppSpecRequest` now accepts:

- `mode`: `"json_render" | "json_render_with_image" | "prompt_builder" | "mcp_server" | null`
- `referenceImageUrl`
- `referenceImageNotes`

Current behavior:

- `referenceImageUrl` / `referenceImageNotes` are only applied when
  `mode="json_render_with_image"`.
- Image mode validates that the selected model supports vision before issuing the
  LLM request.
- `referenceImageUrl` and `referenceImageNotes` are hard-limited by backend
  guards (see `backend/setta/routers/app_generation_limits.py`).

### Patch Op semantics

- `Spec.root` is a string; the empty/rootless spec is represented as `""`.
- Nested element patches like `/elements/<key>/props/...` require the element to
  already exist. Only `/elements/<key>` may create a new element (as a full
  element object).

## 3) Chat-driven app generation (`/api/getLLMResponse`)

`GetLLMResponseRequest` includes app-generation hints that are appended to the
effective system prompt when `appGenerationMode` is provided:

- `appGenerationMode`
- `appSpecStreamingEnabled`
- `appGenerationReferenceImageUrl`
- `appGenerationReferenceImageNotes`

Project Chat built-in app-generation slash commands use this route directly.
Each command provides its own fixed baseline prompt text and can append a single
user-authored suffix after that baseline.

Mode behavior:

- If `appGenerationMode` is omitted, no app-generation system prompt is injected
  (even when `appSpecStreamingEnabled=true`).
- For `json_render` / `json_render_with_image` / `prompt_builder`, the prompt
  steers tools toward Setta app-definition persistence.
- For `mcp_server`, the prompt steers MCP-first design flows (including
  Figma-oriented workflows) and then persistence back into Setta.
- Streaming toggle determines whether prompt guidance prefers
  `setta__stream_app_definition` or `setta__set_app_definition`.
- Reference image context is only included for `json_render_with_image`.

## When to use which

- Use **JSON Merge Patch** when you need targeted persisted edits.
- Use **`/api/streamAppSpec` JSONL patch ops** for in-pane generation and live
  preview (`json_render`, `json_render_with_image`).
- Use **chat-driven mode** (`prompt_builder`, `mcp_server`) when the app pane
  should send generation requests into Project Chat and let tools perform final
  persistence.
- Use **App Config** after generation when you need to inspect the saved spec,
  preview it, validate it, or edit raw JSON/theme/assets manually.
