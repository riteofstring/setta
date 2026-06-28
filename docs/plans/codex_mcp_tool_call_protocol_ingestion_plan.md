# Codex MCP Tool Call Protocol Ingestion Plan

## Goal

Make Setta ingest Codex MCP tool-call items according to the Codex app-server
contract, preserve their structured payloads, and project them into stable chat
activity rows without crashing the run or flattening provider data into
string-only fields.

The latest recording exposed the failure mode:

```text
codex item.result must be a string
```

That error is not a bad renderer state and not a failed `/chat/messages/steer`
request. It is a backend protocol adapter mismatch. Setta parsed a valid Codex
`mcpToolCall.result` object as if every `ThreadItem.result` were a string.

## Non-Goals

- Do not add a special-case `fmt.Sprint`, JSON stringify fallback, or best-effort
  coercion for `mcpToolCall.result`.
- Do not make the renderer infer provider semantics from raw Codex item JSON.
- Do not maintain a hand-written mirror of Codex `ThreadItem` shapes in
  TypeScript.
- Do not hide provider protocol drift by silently accepting malformed Codex
  items.
- Do not change permission controls, model settings, queueing, approvals, or
  transcript chronology except where required to correctly render MCP tool
  activity.
- Do not add compatibility shims, migrations, dual-read/write paths, old-field
  aliases, or fallback parsing for prior development data. Local development
  chat data can be recreated.

## Compatibility Policy

This work must be a clean correction to the Codex protocol boundary. There is no
backward compatibility requirement for existing local development chat data,
partially ingested run items, old transcript blocks, old MCP detail payloads, or
old generated protocol surfaces.

Forbidden implementation work:

- no backward-compatibility shims;
- no legacy support paths;
- no migrations for old chat, run-item, transcript, or protocol data;
- no transitional adapters;
- no dual-read or dual-write behavior;
- no old-field aliases;
- no runtime "try the old shape, then the new shape" parsing;
- no renderer support for both old and new MCP detail contracts;
- no broad catch-all coercion of malformed provider fields;
- no preserving old generated contracts solely to keep current local data
  renderable.

When old, partial, malformed, or mismatched data is encountered, fail loudly with
a specific error. Developers can recreate local app data or re-run the workflow.
The runtime must not silently repair, migrate, reinterpret, or tolerate legacy
MCP item shapes.

## Reference Findings

Upstream Codex app-server models thread items as a typed union. The relevant MCP
variant is:

- `mcpToolCall`: `{id, server, tool, status, arguments, appContext,
  mcpAppResourceUri?, pluginId, result?, error?, durationMs?}`

Reference files:

- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/app-server/README.md`
  describes `mcpToolCall` as a first-class thread item with `server`, `tool`,
  `status`, `arguments`, `result`, and `error`.
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/app-server-protocol/src/protocol/v2/item.rs`
  defines `ThreadItem::McpToolCall` with `result:
  Option<Box<McpToolCallResult>>`, `error: Option<McpToolCallError>`, and
  `duration_ms`.
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/app-server-protocol/src/protocol/v2/mcp.rs`
  defines `McpToolCallResult` as structured MCP output:
  `content`, `structuredContent`, and `_meta`.
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/sdk/typescript/src/items.ts`
  keeps the higher-level SDK result structured as MCP content blocks, not a
  display string.
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/app-server/src/request_processors/thread_resume_redaction.rs`
  redacts MCP result payloads by replacing `content`, not by changing the result
  into a scalar string. That reinforces that the result object's structure is
  part of the protocol.

## Current Setta Problem

Setta has the Codex schema data, but the generated Go surface does not expose
`ThreadItem` as a typed discriminated union. `internal/codexapp/protocol_gen.go`
currently leaves it as:

```go
type ThreadItem = json.RawMessage
```

`internal/chat/codex_protocol.go` then decodes the raw item into
`map[string]any` and applies generic extraction across item types. That generic
path assumes:

```go
result, err := optionalString(item, "result", "codex item")
```

That is valid for some item families, but invalid for `mcpToolCall`, whose
`result` is an object. The same generic path also looks for `serverName` and
`toolName`, while Codex MCP items use `server` and `tool`. That does not crash,
but it causes rows to render as generic `tool call` activity instead of
`server.tool`.

There are two model-level issues:

- `RunItem.Result` is both a display/search summary and a would-be provider
  payload field.
- Provider-specific structured details are stored as untyped raw JSON, so there
  is no generated renderer contract for inspecting MCP arguments, result
  content, structured content, metadata, or app context.

## Product Contract

- A Codex MCP tool call should appear as one chronological activity row.
- The row title should be derived from the provider fields, normally
  `server.tool`.
- In-progress MCP items should show progress updates when Codex emits
  `item/mcpToolCall/progress`.
- Completed MCP items should not fail the whole chat run merely because their
  result is structured.
- Failed MCP items should render as failed activity rows using
  `error.message`. A failed tool item is not itself a Setta protocol-ingestion
  failure.
- `RunItem.Result` may contain a concise, deterministic, human-readable summary
  for search and display, but it is not the source of truth for MCP payloads.
- Full MCP payload inspection should be available through generated Setta
  details contracts, not renderer-side provider parsing.
- `_meta` and large or non-text content should not be rendered inline by
  default. They should be available in details when appropriate and bounded for
  display.

## Architecture

### 1. Generate A Typed Codex ThreadItem Surface

Extend the Codex protocol generator so `ThreadItem` is generated as a
discriminated union or an equivalent typed decoder surface instead of
`json.RawMessage`.

The generated Go surface should make this kind of code possible without
ad hoc map access:

```go
switch item.Type {
case codexapp.ThreadItemTypeMcpToolCall:
    // item.Server, item.Tool, item.Result, item.Error, ...
case codexapp.ThreadItemTypeCommandExecution:
    // command-specific fields
}
```

If the generator cannot cleanly emit a native Go union, generate a small
typed-envelope API:

- decode the raw `ThreadItem`;
- read and validate the `type` discriminator;
- expose variant-specific structs such as `McpToolCallThreadItem`;
- fail loudly for unknown discriminators or invalid required fields.

Do not hand-maintain the Codex item list in the chat adapter. The Codex protocol
schema remains the owner.

### 2. Replace Generic RunItem Parsing With Variant-Specific Projection

Replace the one-size-fits-all `runItemFromCodexItem(map[string]any, status)`
path with a projection function that switches on the generated Codex item
variant.

For `mcpToolCall`, map fields explicitly:

- `id` -> `ProviderItemID`
- `server` -> `ServerName`
- `tool` -> `ToolName`
- `status` -> `RunItemStatus`
- `durationMs` -> `DurationMs`
- `error.message` -> `Error`
- `result` -> typed MCP details payload
- deterministic result summary -> `Result`

For item variants whose result really is a string, keep string parsing in those
variant branches only.

### 3. Add A Typed Setta MCP Details Contract

Keep Setta's persisted `RunItem` as the internal activity record, but stop
using the flat string fields as the only data model for structured provider
payloads.

Add a Go-owned generated details type for MCP tool calls. The exact generator
shape can follow existing backend contract conventions, but the data should
include:

```go
type RunItemMCPToolCallDetails struct {
    ServerName        string          `json:"serverName"`
    ToolName          string          `json:"toolName"`
    Arguments         json.RawMessage `json:"arguments"`
    AppContext        json.RawMessage `json:"appContext"`
    PluginID          string          `json:"pluginId"`
    MCPAppResourceURI string          `json:"mcpAppResourceUri"`
    Result            *MCPToolResult  `json:"result"`
    Error             string          `json:"error"`
}

type MCPToolResult struct {
    Content           []json.RawMessage `json:"content"`
    StructuredContent json.RawMessage   `json:"structuredContent"`
    Meta              json.RawMessage   `json:"_meta"`
}
```

If a broader `RunItemDetails` discriminated union is introduced, `mcp_tool_call`
should be one branch of that union. This is preferable long term because command
execution, dynamic tool calls, approvals, web search, image operations, and MCP
calls all have different real payloads.

Generated TypeScript should come from these Go-owned Setta contracts. The
renderer should not duplicate the contract by maintaining its own handwritten
MCP interfaces.

### 4. Derive Display Summaries Deterministically

Add a backend helper that derives `RunItem.Result` for MCP calls from the typed
MCP result:

- concatenate text content blocks up to a bounded display limit;
- for non-text content blocks, report stable content kinds and counts;
- include `structuredContent` only as a bounded summary or presence indicator,
  not by dumping arbitrary JSON into the transcript;
- never inspect arbitrary words to infer semantics.

This preserves `RunItem.Result` as a useful summary without pretending it is the
provider payload.

### 5. Update Renderer Activity Details

Renderer changes should consume generated Setta fields only.

Activity row behavior:

- title: `server.tool` when both are present, otherwise `tool`;
- status: in progress, completed, failed, or cancelled from `RunItemStatus`;
- compact body: progress, result summary, or error message;
- details: arguments, content blocks, structured content, app context, plugin id,
  and metadata behind explicit expand/copy surfaces.

The renderer should not parse raw Codex `ThreadItem` payloads or know that Codex
calls the provider fields `server` and `tool`.

### 6. Preserve Fail-Loud Protocol Semantics

The fix must distinguish valid provider data from provider drift:

- Valid `mcpToolCall.result` object: accept and project.
- `mcpToolCall.result` scalar string: reject as malformed provider data.
- Missing required MCP fields: reject with a specific protocol error.
- Unknown Codex item discriminator: reject with a specific unsupported-item
  error.
- MCP item status `failed`: store a failed activity item, not a protocol
  ingestion failure.

This keeps Setta strict without crashing on valid structured MCP output.

## Implementation Phases

### Phase 1: Characterize And Pin Fixtures

- Add focused protocol fixture data for a completed MCP tool call with:
  - `server`;
  - `tool`;
  - JSON `arguments`;
  - status transition from `inProgress` to `completed`;
  - object `result` with text content, structured content, and `_meta`.
- Add a failed MCP fixture with `error.message`.
- Add a progress fixture for `item/mcpToolCall/progress`.
- Confirm the existing latest-recording failure is covered by the completed MCP
  fixture.

### Phase 2: Generate Typed Codex Item Decoding

- Update the Codex protocol generator inputs and generator logic so
  `ThreadItem` is no longer raw at the chat adapter boundary.
- Regenerate affected Codex protocol output.
- Keep generated files generated. Do not manually edit generated outputs.
- Remove the old raw-map adapter path when the typed decoder lands. Do not keep
  it behind a fallback or compatibility branch.
- Add narrow Go tests that verify the generated decoder accepts valid
  `mcpToolCall` payloads and rejects malformed ones.

### Phase 3: Project MCP Items Into Setta Run Items

- Replace generic string result extraction with per-variant projection.
- Delete any obsolete shared parsing that assumes every item can expose
  `result` as a string.
- Populate `ServerName`, `ToolName`, `DurationMs`, `Error`, and details for MCP
  calls.
- Add the deterministic MCP result summary helper.
- Ensure failed MCP tool calls create failed activity items without failing the
  run unless Codex also sends a terminal run failure.

### Phase 4: Generate Renderer Details Contracts

- Add Go-owned Setta details types for MCP tool calls.
- Regenerate backend TypeScript contracts.
- Update transcript activity rendering to use the generated details shape.
- Remove old renderer assumptions that inspect only `RunItem.Result`,
  `serverName`, or `toolName` as the complete MCP data model.
- Keep large or non-text payload rendering bounded and explicit.

### Phase 5: End-To-End Verification

- Add or update deterministic Electron workflow coverage through production
  Electron/main/preload/renderer/HTTP/store paths.
- The E2E should open a temporary workspace, start a chat, receive an MCP
  tool-call item with structured result, and verify:
  - the run does not fail;
  - the activity row title includes the server/tool name;
  - the structured result is available in details;
  - a failed MCP item renders as a failed row without causing a protocol error.
- If local Codex CLI ChatGPT auth is available, run the live Codex E2E coverage
  as required for provider protocol handling changes. Do not use
  `OPENAI_API_KEY` for live Codex tests.

## Test Requirements

Narrow checks first:

- Go unit tests for generated `ThreadItem` decoding.
- Go unit tests for MCP projection into `RunItem`.
- Go unit tests for deterministic MCP result summary derivation.
- Existing transcript ingestion tests covering activity row status and detail
  projection.

Broader required checks before finishing implementation:

- `./scripts/format.sh`
- `./check_quality.sh --git-changes`
- deterministic Electron E2E through production app paths;
- live Codex E2E when ChatGPT auth is available, otherwise report the narrow
  live-provider skip.

Because this touches Codex harness behavior, provider protocol handling, event
streaming, generated backend contracts, renderer chat state, and transcript UI,
unit-only or HTTP-only coverage is insufficient.

## Acceptance Criteria

- A valid Codex `mcpToolCall` with object `result` no longer fails a Setta chat
  run.
- The transcript activity row shows a meaningful MCP label, normally
  `server.tool`.
- The MCP result payload is preserved structurally in Setta-owned details.
- `RunItem.Result` remains a bounded display summary, not the provider payload.
- Failed MCP tool calls display as failed tool rows with `error.message`.
- Malformed provider shapes still fail loudly with specific protocol errors.
- Renderer TypeScript surfaces are generated from Go-owned Setta contracts or
  generated Codex protocol contracts, not manually mirrored.
- No backward-compatibility, migration, transitional, dual-read/write, alias, or
  fallback path remains for the old MCP item/result shape.
