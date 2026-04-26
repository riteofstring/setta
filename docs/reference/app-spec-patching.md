# App Spec Patching

Setta currently has two low-level patch/update paths for app definitions, plus a
Project Chat app-generation mode contract that decides how chat turns should
persist app-definition work back into Setta.

The app-definition runtime is contributed by the active app-subsystem provider.
For the first-party JSON Render provider (`setta-json-render-app-gen`), Setta
stores document-level app-definition metadata in `project.json` at
`pluginData["setta-json-render-app-gen"]`, and stores app-spec JSON files under
`plugins/setta-json-render-app-gen/app_specs/`. The default app-spec path is
`plugins/setta-json-render-app-gen/app_specs/app.json`.

Project Chat is the primary prompt surface for app generation. Built-in slash
commands `/app-json`, `/app-image`, `/app-prompt`, and `/app-mcp` carry fixed
baseline prompts, optionally append user suffix text, and submit chat requests
with an explicit `appGenerationMode` when the active app-subsystem provider
contributes app-generation chat modes. App Config remains the advanced
workbench for previewing, validating, saving, and manually editing the
resulting app definition.

Manual App Config edits use the persisted Setta app-spec shape. A minimal root
element includes `key` and `type`, child elements are stored in top-level
`children`, and props must match the catalog component names and fields:

```json
{
  "key": "app-root",
  "type": "Card",
  "props": {
    "title": "Plugin render smoke test",
    "description": "If you can see this card, JSON Render is working."
  },
  "children": [
    {
      "key": "smoke-text",
      "type": "Text",
      "props": {
        "text": "This is a simple app-subsystem render check."
      }
    }
  ]
}
```

## 1) Persistent Updates: JSON Merge Patch

Used by:

- Go-owned app-definition writes in `internal/appsubsystem/appdefinition/service.go`
- HTTP reads/writes registered by `internal/appsubsystem/appdefinitionhttp/routes.go`

This applies a **JSON Merge Patch** to the stored app definition/spec. Use this
for non-streaming, persisted edits (for example: "set this one field" or "apply
this config change").

## 2) Streaming Persistence: JSONL JSON-Pointer Patch Ops

Used by:

- `setta__stream_app_definition`, registered by
  `internal/appsubsystem/mcptools/registrations.go` and persisted through
  `internal/appsubsystem/appdefinition/service.go`
- Patch parsing/application in `internal/appsubsystem/appspec/patch_stream.go`

This consumes **newline-delimited JSON (JSONL)** where each line is an operation
using JSON Pointer paths (for example: `{"op":"set","path":"/elements/foo", ...}`).

This format is designed for progressive UI updates while a model is generating a
spec, and matches streaming UI contracts (for example `@json-render/react`'s
`useUIStream`).

App Config and Project Chat generation use `/api/getLLMResponse` plus
`/ws/frontend` tool-preview updates and the Go-owned app-subsystem
`stream_app_definition` MCP tool.

### Current app-generation mode inputs

The app-generation input contract centers on:

- `mode`: `"json_render" | "json_render_with_image" | "prompt_builder" | "mcp_server" | null`
- `referenceImageUrl`
- `referenceImageNotes`

Current behavior:

- `referenceImageUrl` / `referenceImageNotes` are only applied when
  `mode="json_render_with_image"`.
- Image mode validates that the selected model supports vision before issuing the
  LLM request.
- `referenceImageUrl` and `referenceImageNotes` are hard-limited by the
  current Go send/prompt normalization path in `internal/managedchat` and
  `internal/externalagents`.

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
