# LLM Chat Data Model Research

## Recommendation

Use a **small application-owned durable schema** in the Go backend, expose generated TypeScript types to the Electron/TS frontend, and treat OpenAI, Anthropic, Vercel AI SDK, LangChain/LangGraph, Bot Framework, and MCP schemas as **adapter-boundary formats**, not as your database model. The reason is that the ecosystems disagree in important ways: OpenAI has `system` and `developer` roles plus typed input/output items; Anthropic uses `user`/`assistant` messages with `tool_use` and `tool_result` content blocks rather than a tool role; Vercel separates `UIMessage` from `ModelMessage`; LangChain supports both provider-native loose content and standardized content blocks; Bot Framework `Activity` is a broad channel protocol; MCP is a tool/resource protocol, not a chat transcript model. ([OpenAI Developers][1])

The core design should be: **Conversation → Messages with typed parts → Runs → ToolInvocations → Artifacts → optional RunEvents**. Store user-facing transcript and operational run ledger separately. Make messages stable and replayable; make run events append-only, debuggable, and optionally prunable.

---

## What the major systems imply

### OpenAI

OpenAI’s current Responses API supports roles `user`, `assistant`, `system`, and `developer`; OpenAI also documents that `developer` or `system` instructions take precedence over `user` instructions, so keep `system` and `developer` distinct in your internal model even if some providers collapse them. OpenAI message content is already typed: text, image, and file input parts can appear in a message. ([OpenAI Developers][1])

OpenAI Responses returns an `output` array whose order and item types should not be assumed to be “the assistant message is first”; output items may include messages, reasoning items, function calls, and other tool-related items. Output messages have unique IDs, typed content, and text annotations such as file and URL citations. ([OpenAI Developers][1])

For tool calls, OpenAI Responses emits `function_call` output items with `call_id`, `name`, and JSON-encoded `arguments`; the application executes the tool and sends back a `function_call_output` item referencing the same `call_id`. The older Chat Completions-style pattern uses assistant `tool_calls` and subsequent `role: "tool"` messages with `tool_call_id`. ([OpenAI Developers][2])

OpenAI also has provider-managed conversation state: Conversations can persist a long-running object with a durable identifier, and they store items such as messages, tool calls, tool outputs, and other data; `previous_response_id` is another way to chain responses. For your app, do not depend on this as the durable source of truth; keep your own transcript and use provider state as an optimization or adapter detail. ([OpenAI Developers][3])

OpenAI reasoning tokens are not visible through the API, although they count toward usage and context. Treat OpenAI reasoning as either usage metadata, an optional summary, or opaque provider state—not as normal user-visible message text. ([OpenAI Developers][4])

OpenAI’s Assistants API is now legacy: the docs say it is deprecated, will shut down on August 26, 2026, and new integrations should use Responses instead. Do not copy Assistants Threads/Runs as-is, though the conceptual separation between thread, message, run, and tool step remains useful. ([OpenAI Developers][5])

### Anthropic

Anthropic’s Messages API is explicitly stateless: clients send full conversational history each time. A Claude response has an assistant role and a `content` array of blocks, commonly `text`, and Anthropic positions the Messages API as suitable for custom agent loops and fine-grained control. ([Claude][6])

Anthropic’s tool model differs from OpenAI’s: Claude emits assistant `tool_use` content blocks with `id`, `name`, and `input`; the application replies with a **user** message containing `tool_result` blocks that reference `tool_use_id`. Anthropic also requires tool results to immediately follow the corresponding tool-use message, and `tool_result` blocks must come first in the user message content array. ([Claude][7])

Anthropic streaming is content-block-oriented: streams contain `message_start`, content block start/delta/stop events, top-level `message_delta`, and `message_stop`; tool-use argument deltas arrive as partial JSON strings that are accumulated into a final object. This strongly argues for treating streaming events as a run/event-log concern, not as the durable message shape itself. ([Claude API Docs][8])

Anthropic extended thinking introduces another reason to keep provider-specific state separate. During tool use with extended thinking, Anthropic requires the complete unmodified thinking block to be passed back for the last assistant message to preserve reasoning continuity; conceptually, the tool loop is one continuous assistant turn even though multiple API messages are involved. ([Claude][9])

### Vercel AI SDK

Vercel AI SDK is valuable as a design reference because it explicitly separates `UIMessage` from `ModelMessage`: `UIMessage` is the source of truth for application/UI state, while `ModelMessage` is the context passed to the model. This is the same separation your app should use, but with Go-owned types rather than TS-library-owned durable types. ([AI SDK][10])

Vercel’s `ModelMessage` supports `system`, `user`, `assistant`, and `tool` message types. User content can be a string or text/image/file parts; assistant content can be text or tool-call parts; tool messages carry tool-result parts. It also recommends using a separate `system` property instead of a system message in some SDK calls to improve prompt-injection resilience, which is an SDK boundary detail rather than something your DB model should inherit. ([AI SDK][11])

Vercel’s `UIMessage` parts are a good frontend inspiration: reasoning parts, tool parts with states such as `input-streaming`, `input-available`, `output-available`, and `output-error`, source URL/document parts, file parts, and custom data parts. These are especially useful for rendering streaming tool progress, but they are too UI/TypeScript-specific to make the durable Go schema. ([AI SDK][10])

### LangChain and LangGraph

LangChain messages expose `content`, standardized `content_blocks`, `tool_calls`, message `id`, usage metadata, and response metadata. AI messages can include tool calls, and LangChain can standardize provider-specific reasoning/thinking blocks into common content-block forms. ([LangChain Docs][12])

LangChain’s `ToolMessage` has a useful `artifact` pattern: supplementary data can be stored for downstream application use without sending it into the model context. That maps well to a desktop developer tool where retrieved files, raw search results, patches, screenshots, and generated artifacts should be referenced from messages but not necessarily re-fed to the model. ([LangChain Docs][12])

LangChain also documents tool-call chunks, invalid tool calls, server-side tool calls/results, and a provider-specific escape hatch. That is a good reason to model tool calls as first-class durable entities with state, timing, raw arguments, parsed arguments, result, error, and provider metadata. ([LangChain Docs][12])

LangGraph’s persistence model is useful conceptually: it saves graph state as checkpoints organized into threads, enabling memory, human-in-the-loop, time travel, and fault tolerance. For a Go backend, imitate the idea with your own `Run`, `RunStep`/`RunEvent`, and checkpoint records rather than adopting LangGraph’s internal state schema unless you actually run LangGraph. ([LangChain Docs][13])

### Microsoft Bot Framework

Bot Framework’s `Activity` schema is a broad interoperability format. An Activity is the basic communication type for the Bot Framework protocol and includes fields for attachments, channel data, channel ID, conversation, delivery mode, activity ID, sender/recipient, reply-to ID, text, timestamp, and activity type such as message, typing, event, invoke, trace, and handoff. ([Microsoft Learn][14])

That makes Bot Framework useful if you later bridge to Teams, Slack-style channels, or enterprise bot protocols. It is not a good internal LLM chat schema for a desktop developer tool because it is channel-first rather than model/run/tool-first.

### MCP

MCP is worth supporting at the tool/resource boundary. Its official repo says the protocol schema is defined TypeScript-first and also made available as JSON Schema, which is useful for Go/TS interoperability. ([GitHub][15])

MCP content blocks include text, image, audio, resource links, and embedded resources. MCP tool results may contain unstructured content blocks, resource links, embedded resources, and structured JSON content. This supports the recommendation that your message/tool-result model should handle text, JSON, files/artifacts, and resource references—not just strings. ([Model Context Protocol][16])

---

## Core modeling decisions

### 1. Message structure

Use **typed messages with typed content parts**. Do not store message content as only a plain string. Plain text should be a derived projection for rendering, search indexing, and provider prompts.

Recommended durable message fields:

```ts
type ID = string;
type ISODateTime = string;

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type JsonObject = { [key: string]: Json };

type Role =
  | "system"
  | "developer"
  | "user"
  | "assistant"
  | "tool";

type MessageVisibility =
  | "user"      // normal transcript
  | "internal"  // hidden from normal chat UI, used for model/tool context
  | "debug";    // visible only in debug/trace UI

type MessageStatus =
  | "pending"
  | "streaming"
  | "complete"
  | "incomplete"
  | "cancelled"
  | "error";

interface Conversation {
  id: ID;
  workspaceId?: ID;
  title?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  archivedAt?: ISODateTime;
  metadata?: JsonObject;
}

interface ChatMessage {
  id: ID;                  // app-generated stable ID
  conversationId: ID;
  runId?: ID;              // run that created or consumed this message
  parentMessageId?: ID;    // optional branching/threading
  role: Role;
  author?: {
    kind: "human" | "model" | "tool" | "system";
    name?: string;
  };
  ordinal: number;         // canonical ordering within conversation
  createdAt: ISODateTime;
  updatedAt?: ISODateTime;
  status: MessageStatus;
  visibility: MessageVisibility;
  parts: MessagePart[];
  providerRefs?: ProviderRef[];
  metadata?: JsonObject;
}

interface ProviderRef {
  provider: "openai" | "anthropic" | "google" | "vercel" | "langchain" | "mcp" | string;
  kind: "message" | "response" | "conversation" | "file" | "tool_call" | "run" | string;
  id: string;
  raw?: JsonObject;        // optional, redacted if persisted
}
```

Use both `ordinal` and timestamps. Timestamps are useful for display and auditing, but `ordinal` should be the canonical deterministic order. Generate message IDs in your backend; never rely on provider message IDs as primary keys.

Recommended conversation concepts:

```ts
interface ConversationBranch {
  id: ID;
  conversationId: ID;
  rootMessageId?: ID;
  headMessageId?: ID;
  createdAt: ISODateTime;
}

interface Session {
  id: ID;
  conversationId: ID;
  kind: "window" | "agent" | "background-job";
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
}
```

For a desktop developer tool, `Conversation` is the durable chat thread. `Session` is usually runtime/window state and often does not need to be durable except for crash recovery or background jobs. `Run` is the durable execution unit for an agent response.

---

### 2. Typed content parts

Use a `parts` array. Keep it intentionally small at first, but leave escape hatches.

```ts
type MessagePart =
  | TextPart
  | AttachmentPart
  | ToolCallPart
  | ToolResultPart
  | ReasoningPart
  | ErrorPart
  | StatusPart
  | DataPart;

interface BasePart {
  id: ID;
  createdAt?: ISODateTime;
  providerRefs?: ProviderRef[];
  metadata?: JsonObject;
}

interface TextPart extends BasePart {
  type: "text";
  text: string;
  format?: "plain" | "markdown";
  annotations?: TextAnnotation[];
}

type TextAnnotation =
  | CitationAnnotation
  | EntityAnnotation
  | DiagnosticAnnotation;

interface CitationAnnotation {
  type: "citation";
  start: number;
  end: number;
  source: SourceRef;
}

interface EntityAnnotation {
  type: "entity";
  start: number;
  end: number;
  label: string;
  ref?: SourceRef;
}

interface DiagnosticAnnotation {
  type: "diagnostic";
  start: number;
  end: number;
  severity: "info" | "warning" | "error";
  message: string;
}

type SourceRef =
  | { type: "url"; url: string; title?: string; accessedAt?: ISODateTime }
  | { type: "artifact"; artifactId: ID; title?: string; page?: number; byteRange?: [number, number] }
  | { type: "provider-file"; provider: string; fileId: string; title?: string }
  | { type: "mcp-resource"; serverId: ID; uri: string; title?: string };

interface AttachmentPart extends BasePart {
  type: "attachment";
  artifactId: ID;
  purpose: "user-upload" | "model-input" | "model-output" | "context" | "display";
  displayName?: string;
}

interface ToolCallPart extends BasePart {
  type: "tool-call";
  toolCallId: string;       // model-visible call ID
  invocationId: ID;         // app-visible durable ToolInvocation ID
  toolName: string;
  serverId?: ID;            // local tool server, MCP server, provider tool, etc.
  input?: Json;
  inputText?: string;       // raw/partial args when streaming or invalid JSON
  state:
    | "input-streaming"
    | "pending"
    | "running"
    | "succeeded"
    | "failed"
    | "denied"
    | "cancelled";
}

interface ToolResultPart extends BasePart {
  type: "tool-result";
  toolCallId: string;
  invocationId: ID;
  toolName: string;
  output?: ToolOutput;
  isError?: boolean;
  error?: ToolError;
}

type ToolOutput =
  | { type: "text"; text: string }
  | { type: "json"; value: Json }
  | { type: "artifacts"; artifactIds: ID[] }
  | { type: "content"; parts: Array<TextPart | AttachmentPart | DataPart> };

interface ToolError {
  code?: string;
  message: string;
  details?: JsonObject;
  retryable?: boolean;
}

interface ReasoningPart extends BasePart {
  type: "reasoning";
  visibility: "internal" | "debug";
  format: "summary" | "encrypted" | "signature" | "redacted";
  text?: string;            // only summaries, never hidden chain-of-thought by default
  providerState?: JsonObject;
}

interface ErrorPart extends BasePart {
  type: "error";
  code?: string;
  message: string;
  details?: JsonObject;
  retryable?: boolean;
}

interface StatusPart extends BasePart {
  type: "status";
  level: "info" | "warning" | "success";
  text: string;
}

interface DataPart extends BasePart {
  type: "data";
  name: string;
  data: Json;
}
```

For reasoning/thinking, store only summaries or opaque provider-required state. Do not expose raw hidden reasoning as ordinary transcript text. Anthropic may require unmodified thinking blocks for continuity, while OpenAI reasoning tokens are not visible through the API; your internal model should support both by separating displayable summaries from opaque provider state. ([Claude][9])

---

### 3. Tool call modeling

Recommended rule:

**Assistant tool calls should be represented as assistant message parts, but tool execution should also be a first-class `ToolInvocation` row. Tool results may be represented as `tool` messages or as result parts linked to the invocation, depending on view.**

That gives you the best mapping:

| System                        | How it maps                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI Responses              | `function_call` output item → `ToolCallPart` + `ToolInvocation`; `function_call_output` → `ToolResultPart` / tool result input item.               |
| OpenAI Chat Completions style | assistant `tool_calls` → `ToolCallPart`; `role: tool` message → `ToolResultPart`.                                                                  |
| Anthropic                     | assistant `tool_use` block → `ToolCallPart`; internal `tool` result is converted by adapter into a `user` message containing `tool_result` blocks. |
| Vercel AI SDK                 | assistant `ToolCallPart` and tool-message `ToolResultPart` map closely.                                                                            |
| LangChain                     | `AIMessage.tool_calls` and `ToolMessage(tool_call_id)` map closely.                                                                                |

OpenAI, Vercel, and LangChain all have a clear call/result ID linkage, while Anthropic uses `tool_use.id` and `tool_result.tool_use_id` inside user/assistant content blocks with strict adjacency requirements. Your durable schema should preserve call IDs but should not hard-code one provider’s role semantics. ([OpenAI Developers][2])

Use this durable object:

```ts
interface ToolInvocation {
  id: ID;
  conversationId: ID;
  runId: ID;
  assistantMessageId?: ID;
  resultMessageId?: ID;

  toolCallId: string;       // model-visible call ID
  providerCallId?: string;  // provider-specific item ID if different

  server: {
    kind: "local" | "builtin" | "mcp" | "provider";
    id?: ID;
    name?: string;
  };

  toolName: string;
  toolVersion?: string;

  input?: Json;
  inputText?: string;
  inputSchemaHash?: string;

  state:
    | "created"
    | "waiting-approval"
    | "running"
    | "succeeded"
    | "failed"
    | "denied"
    | "cancelled";

  startedAt?: ISODateTime;
  completedAt?: ISODateTime;
  durationMs?: number;

  output?: ToolOutput;
  error?: ToolError;
  artifactIds?: ID[];

  approval?: {
    required: boolean;
    approvedBy?: string;
    approvedAt?: ISODateTime;
  };

  providerRefs?: ProviderRef[];
  metadata?: JsonObject;
}
```

For a developer tool, first-class tool invocations are important because tools may edit files, run shell commands, inspect the workspace, call MCP servers, generate artifacts, fail, be cancelled, or require user approval. A simple message-only model becomes painful once tools have side effects, progress, retries, and generated files.

---

### 4. Transcript vs run/trajectory/event log

Keep these separate:

```ts
interface Run {
  id: ID;
  conversationId: ID;
  triggerMessageId?: ID;

  kind: "chat" | "agent" | "background" | "retry" | "resume";
  status:
    | "queued"
    | "running"
    | "waiting-for-tool"
    | "waiting-for-user"
    | "completed"
    | "cancelled"
    | "failed";

  agentId?: ID;
  model: {
    provider: string;
    name: string;
    version?: string;
  };

  requestMessageIds: ID[];
  responseMessageIds: ID[];

  startedAt: ISODateTime;
  completedAt?: ISODateTime;
  cancelledAt?: ISODateTime;

  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
    costMicros?: number;
  };

  error?: ToolError;

  options?: JsonObject;
  providerRefs?: ProviderRef[];
  metadata?: JsonObject;
}

interface RunEvent {
  id: ID;
  runId: ID;
  seq: number;
  ts: ISODateTime;

  type:
    | "model-request-created"
    | "model-response-started"
    | "message-created"
    | "message-delta"
    | "part-created"
    | "part-delta"
    | "tool-call-created"
    | "tool-call-delta"
    | "tool-started"
    | "tool-output"
    | "tool-failed"
    | "artifact-created"
    | "retry"
    | "cancelled"
    | "error"
    | "completed";

  messageId?: ID;
  partId?: ID;
  toolInvocationId?: ID;
  artifactId?: ID;

  payload?: JsonObject;
  persist: "audit" | "debug" | "ephemeral";
}
```

The **chat transcript** should contain stable semantic messages and parts. The **run ledger** should contain operational facts: model requests, model responses, stream deltas, retries, tool execution lifecycle, cancellation, errors, token usage, and provider raw payload references. Anthropic’s streaming event model and LangChain’s streaming chunks/checkpoints show why it is better to accumulate streaming deltas into final messages rather than persist raw deltas as the primary transcript. ([Claude API Docs][8])

Persist durably by default:

| Persist                                             | Why                                                |
| --------------------------------------------------- | -------------------------------------------------- |
| Conversations, messages, final parts                | User-visible history and replayable context        |
| Runs                                                | Auditability, retry/resume, model usage, debugging |
| Tool invocations                                    | Side effects, timing, approvals, failures          |
| Final tool inputs/outputs                           | Needed for replay and provider continuation        |
| Artifacts and artifact metadata                     | Files/images/screenshots/generated outputs         |
| Final provider request/response envelopes, redacted | Debugging migrations and adapter bugs              |
| Usage/cost/stop reasons                             | Product analytics and cost control                 |

Treat as ephemeral or TTL/debug-only:

| Usually ephemeral                       | Why                                                          |
| --------------------------------------- | ------------------------------------------------------------ |
| Token-by-token deltas                   | Large, noisy, reconstructable from final parts               |
| UI spinner/progress text                | View state, not domain state                                 |
| Optimistic frontend-only draft messages | Backend should assign authoritative IDs                      |
| Partial invalid tool JSON               | Keep only if needed for debugging or failed-call diagnostics |
| Raw unredacted provider payloads        | Privacy/security risk                                        |

---

### 5. Attachments and artifacts

Do **not** embed blobs or base64 payloads inside durable message JSON except for tiny test fixtures. Store files, screenshots, generated images, patches, logs, and downloaded resources as artifacts; message parts should reference artifact IDs.

```ts
interface Artifact {
  id: ID;
  conversationId?: ID;
  runId?: ID;
  messageId?: ID;
  toolInvocationId?: ID;

  kind:
    | "file"
    | "image"
    | "screenshot"
    | "directory"
    | "patch"
    | "log"
    | "webpage"
    | "dataset"
    | "other";

  name: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;

  storage: {
    kind: "local-file" | "content-addressed" | "sqlite-blob" | "remote-url";
    uri: string;            // backend-resolved; frontend should not assume direct FS access
  };

  preview?: {
    thumbnailArtifactId?: ID;
    textExcerpt?: string;
  };

  origin: {
    kind: "user-upload" | "model-generated" | "tool-generated" | "system" | "downloaded";
    provider?: string;
  };

  providerRefs?: ProviderRef[];

  mcpRefs?: Array<{
    serverId: ID;
    uri: string;
    name?: string;
    mimeType?: string;
  }>;

  createdAt: ISODateTime;
  metadata?: JsonObject;
}
```

OpenAI and Anthropic both support file/image references or payloads at the API boundary; OpenAI input parts include image/file IDs, URLs, and file data, while Anthropic recommends using its Files API for many images to keep request payloads small. That supports the artifact-reference approach: your app stores stable artifact IDs, and adapters convert them to provider file IDs, URLs, base64, or MCP resource links as needed. ([OpenAI Developers][1])

For MCP, keep MCP resources as references, not as your whole artifact model. MCP can return resource links, embedded resources, and structured content from tools; your artifact layer should be able to ingest or reference those without losing the original MCP URI/server identity. ([Model Context Protocol][17])

---

## Provider adapter boundaries

Keep these provider-specific fields out of the core schema except as `providerRefs`, `providerState`, or raw adapter records:

| Provider-specific detail                                        | Where to keep it                                                      |
| --------------------------------------------------------------- | --------------------------------------------------------------------- |
| OpenAI `response.id`, `previous_response_id`, `conversation` ID | `Run.providerRefs` / adapter state                                    |
| OpenAI `function_call` item IDs and `call_id`                   | `ToolInvocation.providerCallId` and `toolCallId`                      |
| OpenAI annotations                                              | Convert to `TextAnnotation`; keep raw in `providerRefs.raw` if needed |
| Anthropic thinking signatures / opaque thinking blocks          | `ReasoningPart.providerState`, private/internal                       |
| Anthropic `tool_result` adjacency requirements                  | Anthropic adapter only                                                |
| Anthropic stream event shapes                                   | `RunEvent`, not transcript                                            |
| Vercel `providerOptions` / UI states                            | frontend projection or adapter metadata                               |
| LangChain `response_metadata` / provider-native content         | adapter metadata                                                      |
| MCP JSON-RPC envelopes                                          | MCP adapter                                                           |
| MCP resource URIs                                               | `Artifact.mcpRefs` or `SourceRef`                                     |

---

## Go-owned durable state vs frontend-only view state

**Go backend should own:**

| Durable backend-owned                       |
| ------------------------------------------- |
| `Conversation`                              |
| `ChatMessage` and `MessagePart`             |
| `Run`                                       |
| `RunEvent`, at least final/audit events     |
| `ToolInvocation`                            |
| `Artifact`                                  |
| provider reference tables                   |
| schema version and migrations               |
| redaction/retention policy for raw payloads |
| generated TypeScript API/types              |

**Frontend-only or frontend-projected:**

| Frontend state                                                                       |
| ------------------------------------------------------------------------------------ |
| composer draft text                                                                  |
| file picker/upload progress before backend accepts artifact                          |
| selected message, hover, collapsed tool panels                                       |
| scroll position and viewport state                                                   |
| temporary optimistic message before backend ack                                      |
| local syntax highlighting/rendering state                                            |
| transient stream display buffers, unless backend is authoritative stream accumulator |
| UI grouping such as “show tool calls under this assistant bubble”                    |

The frontend can use a projection similar to Vercel `UIMessage`, but the source of truth should be the Go schema. Vercel’s split between UI state and model state is the right idea; for your architecture, implement that split with generated TypeScript types from Go rather than adopting a TS SDK’s internal message type as the durable database model. ([AI SDK][10])

---

## Library/schema adoption recommendation

| Option                           |     Use as durable internal schema? | Recommendation                                                                                                                                                                                                                                          |
| -------------------------------- | ----------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI Responses / SDK types     |                                  No | Use only at OpenAI adapter boundary. Good reference for `developer` role, typed content, citations, function calls, and provider-managed conversation state. Too provider-specific, and Assistants-era schemas are deprecated. ([OpenAI Developers][1]) |
| Anthropic Messages SDK types     |                                  No | Use only at Anthropic adapter boundary. Good reference for content blocks and strict tool-result ordering, but its lack of a `tool` role and thinking-block requirements should not dictate your app schema. ([Claude][6])                              |
| Vercel AI SDK `UIMessage`        |            Not as Go durable schema | Good frontend inspiration, especially if your UI is React/TS. But it is TypeScript-first and UI-centric; project your backend schema into a similar shape rather than storing it directly. ([AI SDK][10])                                               |
| Vercel AI SDK `ModelMessage`     |                 Adapter/helper only | Useful neutral-ish model boundary type in TS, but still SDK-owned and not Go-first. Good for mapping tool-call/result parts. ([AI SDK][11])                                                                                                             |
| LangChain message abstractions   | No, unless you run LangChain deeply | Good conceptual reference for `contentBlocks`, `tool_calls`, usage metadata, and artifacts. But content is intentionally loose to support many providers, which is risky as a durable app schema. ([LangChain Docs][12])                                |
| LangGraph threads/checkpoints    |      Runtime/checkpoint inspiration | Great if your agent runtime is LangGraph. If your backend is Go, copy the concepts—thread, checkpoint, run, step, replay—not the internal schema. ([LangChain Docs][13])                                                                                |
| Microsoft Bot Framework Activity |                                  No | Good external-channel protocol; too broad and channel-specific for an LLM-native desktop developer tool. ([Microsoft Learn][14])                                                                                                                        |
| MCP schemas                      |                     Boundary schema | Adopt for MCP client/server integration, tool discovery, tool result conversion, and resource references. Do not make MCP your chat transcript model. ([GitHub][15])                                                                                    |

Overall recommendation: **keep a small application-owned schema**, borrow the best ideas from Vercel and LangChain content parts, and write explicit adapters for OpenAI, Anthropic, MCP, and any agent runtime.

---

## Practical mapping rules

### To OpenAI Responses

Map:

```ts
system/developer messages -> OpenAI system/developer input messages
user text/attachments     -> input_text/input_image/input_file parts
assistant text            -> assistant message or prior response item
ToolCallPart              -> function_call item / prior output item
ToolResultPart            -> function_call_output with matching call_id
Artifact provider file    -> file_id when available; otherwise URL/base64/file_data
```

Store OpenAI `response.id`, `conversation` ID, output item IDs, file IDs, and raw response envelope as provider references, not primary app identifiers.

### To Anthropic

Map:

```ts
system/developer messages -> top-level system/developer-equivalent prompt construction
user text/attachments     -> user content blocks
assistant text            -> assistant text blocks
ToolCallPart              -> assistant tool_use block
ToolResultPart            -> user tool_result block immediately after tool_use
ReasoningPart providerState -> unmodified thinking/signature blocks when required
```

The Anthropic adapter must enforce adjacency and ordering; the durable app schema should not pretend tool results are human-authored just because Anthropic represents them in a `user` message.

### To Vercel UI

Project backend messages into UI messages:

```ts
TextPart       -> text UI part
ReasoningPart  -> reasoning UI part when visible/debug-enabled
ToolInvocation -> tool UI part with state
AttachmentPart -> file/source UI part
CitationAnnotation -> source URL/document UI part
StatusPart     -> custom data/status part
```

Do not let the frontend invent durable message IDs; it may create temporary optimistic IDs, but the backend should replace them with authoritative IDs.

---

## Mistakes to avoid

1. **Copying one provider’s message schema into your database.** OpenAI, Anthropic, and Vercel disagree on roles, tool results, and reasoning state.

2. **Storing content as a single string.** Typed parts are now table stakes for files, images, citations, tool calls, tool results, and reasoning summaries.

3. **Using provider IDs as your primary IDs.** Provider IDs should be references. Your backend should generate stable app IDs.

4. **Relying on timestamps alone for order.** Use a monotonic `ordinal` or sequence number per conversation/run.

5. **Mixing transcript and stream log.** A stream delta is not a message. Accumulate deltas into stable parts, and persist raw stream events only for debug/audit.

6. **Losing tool-call linkage.** Always preserve `toolCallId`, tool name, parsed input, raw input, result, error, timing, and artifacts.

7. **Treating tool results as always text.** Support JSON, text, images/files/artifacts, structured content, and errors.

8. **Embedding blobs in message JSON.** Store artifacts separately and reference them from message parts.

9. **Displaying hidden reasoning as normal text.** Store summaries or opaque provider state; keep raw/required thinking blocks private and adapter-controlled.

10. **Letting frontend UI state become durable domain state.** The Go backend should own transcript, runs, tools, artifacts, and migrations; the frontend should own presentation state.

11. **Ignoring failed, cancelled, denied, or partial states.** Developer tools need reliable audit trails for side effects and failed tool executions.

12. **Hard-coding Anthropic or OpenAI tool semantics.** Model tool calls and results provider-neutrally, then adapt to each provider’s required wire shape.

[1]: https://developers.openai.com/api/reference/resources/responses/methods/create "Create a model response | OpenAI API Reference"
[2]: https://developers.openai.com/api/docs/guides/function-calling "Function calling | OpenAI API"
[3]: https://developers.openai.com/api/docs/guides/conversation-state "Conversation state | OpenAI API"
[4]: https://developers.openai.com/api/docs/guides/reasoning "Reasoning models | OpenAI API"
[5]: https://developers.openai.com/api/docs/assistants/deep-dive "Assistants API deep dive | OpenAI API"
[6]: https://platform.claude.com/docs/en/build-with-claude/working-with-messages "Using the Messages API - Claude API Docs"
[7]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls "Handle tool calls - Claude API Docs"
[8]: https://docs.anthropic.com/en/api/messages-streaming "Streaming messages - Claude API Docs"
[9]: https://platform.claude.com/docs/en/build-with-claude/extended-thinking "Building with extended thinking - Claude API Docs"
[10]: https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message "AI SDK Core: UIMessage"
[11]: https://ai-sdk.dev/docs/reference/ai-sdk-core/model-message "AI SDK Core: ModelMessage"
[12]: https://docs.langchain.com/oss/javascript/langchain/messages "Messages - Docs by LangChain"
[13]: https://docs.langchain.com/oss/python/langgraph/persistence "Persistence - Docs by LangChain"
[14]: https://learn.microsoft.com/en-us/javascript/api/botframework-schema/activity?view=botbuilder-ts-latest "Activity interface | Microsoft Learn"
[15]: https://github.com/modelcontextprotocol/modelcontextprotocol "GitHub - modelcontextprotocol/modelcontextprotocol: Specification and documentation for the Model Context Protocol · GitHub"
[16]: https://modelcontextprotocol.io/specification/2025-06-18/schema "Schema Reference - Model Context Protocol"
[17]: https://modelcontextprotocol.io/specification/2025-06-18/server/tools "Tools - Model Context Protocol"
