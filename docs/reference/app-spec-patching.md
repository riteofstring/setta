# App Spec Patching

Setta currently has two low-level patch/update paths for app definitions, plus a
Project Chat app-generation mode contract that decides how chat turns should
persist app-definition work back into Setta.

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
- `setta__stream_app_definition` (`internal/mcpx/server.go` and `internal/projectstate/app_definition_stream.go`)

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

`GetLLMResponseRequest` carries the current-turn app-generation mode plus
per-message submission state for the thread:

- `appGenerationMode`
- `appGenerationByMessageId`

Project Chat built-in app-generation slash commands use this route directly.
Each command provides its own fixed baseline prompt text and can append a single
user-authored suffix after that baseline.

Mode behavior:

- If `appGenerationMode` is omitted, no app-generation system prompt is
  injected for the current turn.
- For `json_render` / `json_render_with_image` / `prompt_builder`, the prompt
  steers tools toward Setta app-definition persistence.
- For `mcp_server`, the prompt steers MCP-first design flows (including
  Figma-oriented workflows) and then persistence back into Setta.
- `appGenerationByMessageId` is the authoritative per-user-message submission
  map for the thread. It can encode both app-generation modes and explicit
  `plain_chat` turns.
- Project Chat follow-up turns inherit the latest active app-generation mode
  until a slash command explicitly submits as `plain_chat` or the user starts a
  new thread.
- `/api/getLLMChat` and `/api/getExternalAgentChat` echo
  `appGenerationByMessageId` so this per-message provenance survives hydration,
  edits, and queued replays.
- `json_render_with_image` requires at least one attached image on the current
  turn or a retained prior user turn whose message id is mapped to
  `json_render_with_image`.

## When to use which

- Use **JSON Merge Patch** when you need targeted persisted edits.
- Use **chat-driven mode** (`json_render`, `json_render_with_image`,
  `prompt_builder`, `mcp_server`) when Project Chat should drive the generation
  flow and let tools perform final persistence.
- Use **App Config** after generation when you need to inspect the saved spec,
  preview it, validate it, or edit raw JSON/theme/assets manually.
