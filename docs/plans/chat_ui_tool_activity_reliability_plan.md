# Chat UI Tool Activity Reliability Plan

## Goal

Make the chat transcript reliably present Codex and Setta activity as useful,
inspectable, typed UI instead of leaking raw tool implementation names,
unhelpful placeholders, invisible failures, or transport crashes.

This plan also keeps the image attachment variant work because it is the same
class of product problem: the renderer is using a contract that is too vague for
the surface it is drawing. The long-term fix is to make chat activity,
attachments, tool results, diffs, and failures explicit contracts with stable
renderer behavior.

## Product Contract

- Transcript rows must describe what happened in product terms, not merely which
  low-level adapter or MCP executable happened to run.
- Activity rows must be backed by typed provider or Setta contracts. The renderer
  must not infer semantics from raw command strings, JavaScript source text,
  filenames, log text, or keyword heuristics.
- Tool activity should be collapsed by default when noisy, but every hidden item
  must remain discoverable through expansion, search, focus, and failure states.
- Failed tool starts, provider protocol errors, app-server transport failures,
  and OS resource exhaustion must be visible as specific diagnostic activity or
  run failure rows.
- File update and diff rows must expose useful detail: changed paths, operation
  type, summary counts, and an expandable diff or patch reference when the
  provider supplies one.
- MCP and dynamic tool rows must preserve structured arguments, results,
  metadata, duration, and status for details panes without dumping large payloads
  inline by default.
- Image attachments must render with the variant appropriate for the current
  surface, with dimensions available before image load.
- The chat UI must recover from stream disconnects without crashing the
  frontend. It should preserve transcript state, mark the active run as failed or
  reconnecting according to the actual protocol state, and expose enough
  diagnostics to debug the failure.

## Non-Goals

- Do not remove Setta dynamic tools as part of this plan. They can remain while
  the rendering and protocol contracts are fixed.
- Do not copy Codex CLI labels by reimplementing CLI-specific formatting in the
  renderer. If CLI labels are the desired product behavior, consume or add a
  structured display field at the Codex protocol boundary.
- Do not rename tools by guessing from implementation details, such as turning a
  `node_repl.js` call into `Read <path>` because the JavaScript happened to read
  a file.
- Do not parse raw provider text, shell commands, MCP arguments, or JavaScript
  source in the renderer to infer tool kind.
- Do not add silent fallbacks for unknown provider item shapes, missing tool
  payloads, failed stream events, or invalid attachment metadata.
- Do not add backward-compatibility shims, dual-read/write paths, migrations, or
  legacy aliases unless that compatibility work is explicitly requested.
- Do not manually edit generated TypeScript outputs.

## Current Issues

### 1. Tool Names Leak Implementation Details

Setta currently renders MCP tool calls using low-level names such as
`node_repl.js`. That is accurate to the MCP server/tool pair, but it is not a
good product label for normal chat transcript reading. It also differs from the
Codex CLI experience, where many implementation details are hidden behind
purpose-specific activity presentation.

The principled fix is not to special-case `node_repl`. Setta should ingest the
Codex app-server item as structured data, preserve the real server/tool in
details, and render a typed product label from provider metadata. For MCP calls,
the default headline should identify the MCP server rather than the implementation
file name. If Codex later exposes a better display label, Setta can consume that
field at the protocol boundary rather than adding renderer heuristics.

Expected UX after the fix:

- Collapsed row: `MCP: node_repl`.
- Details: `MCP server: node_repl`, `Tool: js`, arguments, duration, result
  content, structured content, and metadata.
- If a provider-supplied display label exists later, it may replace the fallback
  only when it is explicit protocol data, not inferred from JavaScript source or
  argument text.

### 2. File Update and Diff Rows Lack Useful Detail

Rows such as `file change` and `Diff updated` currently do not expose enough
information to answer the user's natural questions: which files changed, what
kind of operation happened, and what the diff contained.

The principled fix is to represent file edits and diff updates as typed activity
details, not generic labels. The backend should store path lists, operation
types, summary counts, diff stat data, and bounded patch snippets or references
when available. The renderer should present a compact summary by default and an
expandable details view for the actual paths and diff content.

Expected UX after the fix:

- Collapsed row: `Edited 1 plan doc` or `Diff updated: 1 file, +84 -12`.
- Expanded details: file path, operation type, generated patch or diff hunk
  preview, and any provider status/error.
- Search/focus can reveal the exact row that changed a requested file.

### 3. Failed Tool Starts Can Disappear From Activity

The `Too many open files` recording showed several `exec_command` starts failing
before a normal command-execution activity row appeared. The assistant mentioned
the failure in prose, but the transcript did not show the failed command attempts
as useful activity.

The assistant prose is generated by Codex, so Setta cannot guarantee the model
will never mention the failure in text. The principled UI fix is separate: treat
tool-start failure as first-class run activity whenever Codex app-server reports
the attempted invocation and failure. If Codex currently only exposes the failure
to the model and not as a thread item or notification, the long-term fix requires
an upstream Codex protocol event for failed tool starts.

When that event exists, Setta should store and render a failed activity row with
the attempted command, failure class, OS error, timestamp, and provider error ID.
The model may still summarize the situation in prose, but the transcript will no
longer rely on prose as the only visible record of the failed tools.

Expected UX after the fix:

- Row title: `Shell command failed to start`.
- Inline reason: `Too many open files (os error 24)`.
- Details: attempted command, cwd, sandbox/approval metadata when present, and
  provider item ID or error ID.

### 4. Codex App-Server Stream Disconnect Crashes The UI

The latest recording showed the frontend chat UI crash around:

```text
codex app-server error notification: stream disconnected before completion
```

A provider stream disconnect is a run failure or reconnection event, not a
renderer crash condition.

The principled fix is to make app-server stream lifecycle explicit in the chat
state machine. The backend should classify disconnects, preserve partial
transcript/run state, and automatically retry reconnecting to the same run up to
three times before marking the run failed. Retry must be tied to stable
conversation/run identifiers or an idempotent resume API; it must not blindly
send the same user message again and risk duplicate model turns.

The renderer should receive typed reconnecting, retry-exhausted, and failed
events that it can display without throwing. It should never assume an active
stream will complete cleanly.

Expected UX after the fix:

- The chat remains open.
- The active run row changes to `Connection lost. Reconnecting 1/3`.
- Partial assistant output remains visible.
- If reconnect succeeds, streaming resumes in the same run.
- If all three attempts fail, the row changes to `Codex stream failed`, and the
  user can manually retry, continue, or inspect diagnostics without restarting
  the app.

### 5. Low File Descriptor Limits Break Parallel Shell Tools

The `Too many open files` failure came from Codex trying to start several
parallel `exec_command` tools while the inherited macOS soft file descriptor
limit was low. Setta currently launches `codex app-server` without raising or
validating that limit.

The principled fix has two layers:

- Setta should raise or validate `RLIMIT_NOFILE` before launching
  `codex app-server`, and expose a clear diagnostic when the inherited limit is
  too low.
- Codex should make unified exec file-descriptor aware. Parallel tool startup
  should be throttled or serialized when FD headroom is low, and `EMFILE` should
  be returned as a structured resource-exhaustion diagnostic.

Expected UX after the fix:

- Normal case: the same parallel reads run without user-visible noise.
- Low-limit case: Setta shows `Codex app-server has a low file descriptor
  limit: 256` in diagnostics before work begins.
- Runtime exhaustion case: the failed activity row says `Shell command failed to
  start: too many open files`, and the run can continue or fail according to
  provider state without crashing the UI.

### 6. Image Attachment Variants Are Too Vague

Image attachments currently expose a small thumbnail and a preview URL. The
transcript uses the small thumbnail for sent-message images, so screenshots with
text become blurry when displayed in a larger inline slot on high-DPI displays.

The principled fix is to make image variants explicit product and storage
contracts. Composer chips, transcript inline images, and previews should each ask
for the variant sized for that surface.

Expected UX after the fix:

- Composer chips remain compact and cheap.
- Sent screenshot attachments are legible in the transcript.
- Preview opens the original or a bounded large preview.
- Transcript rows reserve stable image layout before image load.

## Architecture Direction

### 1. Use Typed Activity Details

Introduce or extend a Go-owned `RunItemDetails` discriminated union so each
activity family has an explicit payload:

- command execution;
- command start failure;
- MCP tool call;
- Setta dynamic tool call;
- file edit;
- diff update;
- approval request/response;
- provider stream lifecycle event.

Generated TypeScript should come from the Go-owned contract. Renderer components
should switch exhaustively on the detail kind and fail typechecking when a new
kind lacks presentation logic.

### 2. Separate Display Labels From Raw Provider Identity

Store raw provider identity in details:

- MCP server and tool;
- Codex item type and provider item ID;
- command argv or shell command;
- Setta dynamic tool identifier.

Render labels from a separate, typed display contract:

- provider-supplied display title when available;
- Setta-owned display title for Setta-owned tools;
- deterministic fallback such as `MCP: node_repl` when no richer label exists,
  with the specific tool name shown in details.

This avoids both extremes: leaking `node_repl.js` as the primary product label
and guessing a misleading high-level action from implementation details.

### 3. Make File And Diff Activity Inspectable

File and diff activity should carry bounded structured summaries:

```go
type RunItemFileChangeDetails struct {
    Paths      []ChangedPath `json:"paths"`
    Operation  string        `json:"operation"`
    Additions  int           `json:"additions"`
    Deletions  int           `json:"deletions"`
    PatchRef   string        `json:"patchRef"`
}
```

The exact shape should follow local contract conventions, but the row must be
able to render changed paths and diff stats without reparsing provider text.

### 4. Treat Provider Lifecycle As State, Not Exceptions

Backend chat state should model Codex app-server lifecycle events:

- connected;
- streaming;
- disconnected;
- reconnecting;
- failed;
- completed.

Unexpected stream termination should transition the run into a visible state and
emit a typed transcript/run event. The backend should attempt up to three
idempotent reconnect/resume attempts before transitioning to terminal failure.
The renderer should display the reconnecting or failed state instead of crashing
due to missing completion data.

### 5. Add File Descriptor Guardrails

Setta should measure and raise the soft FD limit early on Unix/macOS before
starting Codex app-server. The app-server launch path should fail loudly if the
limit remains below a documented minimum.

Codex upstream should still own runtime throttling because it knows how many
descriptors each unified exec process consumes. Setta raising the limit improves
the host environment, but Codex should not assume unlimited parallel process
startup.

### 6. Make Image Variants Explicit

Replace the single thumbnail/preview pair with typed image variants:

```go
type ImageAttachmentVariantKind string

const (
    ImageAttachmentVariantThumbnail ImageAttachmentVariantKind = "thumbnail"
    ImageAttachmentVariantInline    ImageAttachmentVariantKind = "inline"
    ImageAttachmentVariantPreview   ImageAttachmentVariantKind = "preview"
)
```

Each variant should include URL, MIME type, width, height, and byte size. The
renderer should choose by surface intent:

- composer chips use `thumbnail`;
- sent transcript images use `inline`;
- preview modal uses `preview`.

Use high-quality resampling for generated variants and keep original bytes out
of ordinary transcript rows.

## Implementation Slices

### Slice 1: Protocol Findings And Contract Shape

- Compare Setta's current activity/run-item model against Codex app-server item
  shapes for MCP calls, command execution, file changes, diff updates, and stream
  lifecycle events.
- Identify which labels and details are already present in Codex protocol data
  and which need upstream Codex protocol changes.
- Define the Go-owned `RunItemDetails` union and display-label contract.
- Regenerate affected TypeScript surfaces from Go-owned contracts.

### Slice 2: Tool And File Activity Rendering

- Project MCP and Setta dynamic tool calls into typed detail payloads.
- Render compact product labels with structured details available on expansion.
- Replace generic `file change` and `Diff updated` rows with path and diff-stat
  summaries.
- Add explicit failed-tool-start activity rows.
- Keep noisy activity collapsed by default while preserving search/focus reveal.

### Slice 3: Stream Failure Resilience

- Model app-server stream disconnects as typed lifecycle events.
- Preserve partial transcript state on disconnect.
- Automatically retry reconnecting to the same run up to three times when the
  provider state makes that retry idempotent.
- Render recoverable or terminal stream failures without throwing.
- Add retry/continue affordances only where backed by existing run state and
  provider capability.

### Slice 4: File Descriptor Reliability

- Add Unix/macOS FD-limit inspection before launching `codex app-server`.
- Raise the soft limit to a documented safe value when the hard limit allows it.
- Fail loudly with a clear diagnostic if the limit remains too low.
- Record current limit and app-server launch diagnostics in development logs.
- Track an upstream Codex fix for FD-aware unified exec throttling.

### Slice 5: Image Attachment Variants

- Add typed image variant constants and metadata in `internal/chat`.
- Generate `thumbnail` and `inline` PNG files from the original during
  attachment creation.
- Record variant dimensions, MIME type, byte size, and relative path in
  `metadata.json`.
- Extend the attachment protocol to serve explicit variant names.
- Update composer, transcript, and preview rendering to select variants by
  surface intent.

## Verification Plan

Start narrow with the changed contract owner and renderer components, then
finish with production-path app workflows because these issues cross backend,
provider, preload, renderer, and transcript state.

Required deterministic E2E coverage:

- open a workspace, create a chat, send a message, and render MCP activity with
  structured details;
- show a failed command-start activity row for a scripted provider failure;
- render file update and diff rows with useful path/stat details;
- simulate a Codex app-server stream disconnect and verify the chat UI stays
  mounted, retries reconnecting up to three times, and preserves partial
  transcript state;
- attach an image, send it, and verify the transcript uses the inline variant
  through the production Electron/main/preload/renderer path.

When implementation touches live Codex provider integration, run live Codex E2E
tests if local ChatGPT auth is available. Do not use `OPENAI_API_KEY` for those
tests. If ChatGPT auth is unavailable, record the live-provider skip explicitly.

Before committing implementation changes, run:

- `./scripts/format.sh`
- `./check_quality.sh --git-changes`

For documentation-only updates to this plan, inspect the diff. No automated
workflow is required unless executable examples, scripts, generated artifacts,
contracts, or code paths change.

## Open Questions

- Does Codex app-server already expose display labels equivalent to the Codex CLI
  activity names, or does the upstream protocol need a new display metadata
  field?
- Should Setta-owned dynamic tools have their own display metadata registry, or
  should they share the same activity display contract as MCP tools?
- What minimum FD soft limit should Setta require before launching Codex
  app-server?
- Should image `preview` continue to mean original bytes, or should a separate
  `original` variant be exposed while `preview` becomes a bounded large image?
