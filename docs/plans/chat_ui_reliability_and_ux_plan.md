# Chat UI Reliability And UX Plan

## Goal

Make the chat transcript and composer reliably present Codex and Setta activity
as useful, inspectable, typed UI instead of leaking raw tool implementation
names, unhelpful placeholders, invisible failures, transport crashes, unstable
scroll behavior, or missing prompt-recall affordances.

This plan is also the source of truth for image attachment variant work,
transcript scroll stickiness, and composer prompt history because they are the
same class of product problem: the renderer is using contracts that are too
vague for the surfaces it is drawing. The long-term fix is to make chat
activity, attachments, tool results, diffs, failures, scrolling intent, and
composer recall explicit contracts with stable renderer behavior.

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
- Transcript scrolling must respect user intent: if the user scrolls away from
  the live tail, new output must not steal the viewport; if the user returns to
  the bottom, streaming output must reliably stay pinned to the latest content.
- The composer must support shell-style prompt recall: when the composer has
  focus and no popup owns arrow navigation, Up/Down should cycle through
  previously sent user-authored inputs without overwriting unrelated drafts or
  breaking multiline cursor movement.

## Non-Goals

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
- Do not force-scroll the transcript on every stream delta regardless of user
  scroll position.
- Do not add backward-compatibility shims, legacy support paths, migrations,
  transitional adapters, dual-read/write paths, old-field aliases, or silent
  compatibility fallbacks.
- Do not manually edit generated TypeScript outputs.

## Existing System Boundaries

This is not greenfield work. The plan must extend the systems already in the
repo:

- `RunLiveness` already models active run attachment with
  `attached`, `reconciling`, `lost`, and `terminal`, plus reasons such as
  `stream_resync`, `user_retry`, `provider_restarted`, and
  `provider_unavailable`. Stream-disconnect work must extend this model, not
  add a second provider-lifecycle state machine.
- `RunItem` is currently a flat catch-all record with optional presentation
  fields such as `Command`, `Cwd`, `ExitCode`, `FilePaths`, `ServerName`,
  `ToolName`, `DiffSummary`, `ProcessID`, and `Details`. Each activity family
  must cut over atomically: when its typed details branch lands, the
  corresponding flat fields are removed from `RunItem` in the same slice. The
  plan must not create a second readable or writable source of truth beside
  those fields.
- MCP tool calls already have typed details through
  `RunItemMCPToolCallDetails`, and `RunActivityDetailsProjection` already
  exposes a partial details layer. The immediate MCP label issue is mostly a
  display-contract decision, not a missing-ingestion problem.
- New tagged-union branches must be registered in
  `cmd/generate-contracts/contract_registry.go` before regeneration; otherwise
  generated renderer decoders can fail before UI code sees the payload.
- `service.go` is already large enough that implementation slices should prefer
  focused files/helpers instead of adding more lifecycle logic there.
- `ChatTranscript` already uses `react-virtuoso`, `followOutput={false}`, and a
  local `pinned` state. Scroll-follow work should consolidate that existing
  logic, not add unrelated scroll effects.
- `ChatInput`, `ChatMessage`, and message parts are already Go-owned typed
  contracts. Composer history should project from those contracts instead of
  reparsing transcript text or keeping a renderer-only sent-message log.
- `ChatComposer` currently owns draft text, attachments, slash command palette
  routing, model/permission pickers, and submit/queue/steering key handling.
  Prompt-history keys must compose with those existing owners: popups keep
  ArrowUp/ArrowDown while open, and history navigation only runs when the
  textarea state says arrow recall is intended.

## Current Issues

### 1. Tool Names Leak Implementation Details

Setta already stores structured MCP details and can render server/tool identity,
but the primary transcript label can still read like low-level implementation
plumbing. A row such as `node_repl.js` or an overly literal `server.tool` label
is accurate enough for diagnostics, but it is not the right product headline for
normal chat transcript reading. This also differs from the Codex CLI
experience, where many implementation details are hidden behind purpose-specific
activity presentation.

The principled fix is not to special-case `node_repl`. Setta should preserve the
real server/tool in details and render a typed product label from explicit
provider or Setta display metadata. For MCP calls, the default headline should
identify the MCP server rather than an implementation file name. If Codex later
exposes a better display label, Setta can consume that field at the protocol
boundary rather than adding renderer heuristics.

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

A provider stream disconnect is a run failure or liveness event, not a renderer
crash condition. The first implementation task is to reproduce and identify the
actual renderer throw path from the recording; this plan should not assume the
crash mechanism is already understood.

The principled fix is to route disconnects through the existing `RunLiveness`
machinery. Codex app-server already sends error notifications with `willRetry`.
When `willRetry` is true, Codex is retrying internally and Setta should surface
the run as still attached or reconciling according to actual liveness. When
`willRetry` is false, the upstream turn is dead; Setta must preserve partial
transcript state and transition the run to an honest failed or lost state.

Setta must not promise automatic mid-turn resume today. There is no known
resume-this-turn Codex API; resuming a thread can start a new turn, which is the
duplicate-turn hazard this plan is trying to avoid. Idempotent mid-turn resume
belongs in the upstream-dependency bucket until Codex exposes a stable protocol
for it.

The renderer should receive typed liveness and terminal failure events that it
can display without throwing. It should never assume an active stream will
complete cleanly.

Expected UX after the fix:

- The chat remains open.
- Partial assistant output remains visible.
- A retryable provider error can show `Codex connection retrying` while Codex
  reports `willRetry: true`.
- A non-retryable stream loss changes the active run row to `Codex stream
  failed` or `Connection lost` with a specific liveness reason.
- The user can manually retry, continue, or inspect diagnostics without
  restarting the app.

### 5. Low File Descriptor Limits Break Parallel Shell Tools

The `Too many open files` failure came from Codex trying to start several
parallel `exec_command` tools while the inherited macOS soft file descriptor
limit was low. Before the launch guard landed, Setta launched
`codex app-server` without raising or validating that limit.

The immediate Setta fix is small and independent. Since Go 1.19, the runtime
raises the process soft `RLIMIT_NOFILE` to the hard limit at startup, but it
restores the original soft limit for exec'd children unless the program
explicitly calls `Setrlimit`. That means Setta can look healthy while
`codex app-server` still inherits a low soft limit such as 256.

Setta's launch guard now requires a soft limit of at least 1024 descriptors
before starting `codex app-server`. If the host hard limit allows it, Setta
raises the soft limit to the hard limit so the child process inherits the
raised value.

The principled fix has two layers:

- Setta should raise or validate `RLIMIT_NOFILE` before launching
  `codex app-server`, using an explicit `Setrlimit` call on Unix/macOS so child
  processes inherit the raised soft limit. It should expose a clear diagnostic
  when the inherited limit remains too low.
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

### 7. Manual Return To Bottom Does Not Reliably Re-Pin

After a user scrolls up to inspect earlier messages, returning the scrollbar to
the bottom should re-enter live-tail following. Today that can miss. The current
renderer keeps its own `pinned` state around `react-virtuoso` with
`followOutput={false}`. It re-pins only when Virtuoso reports bottom or when DOM
distance from bottom is within a narrow threshold, and the pinned scroll effect
mostly watches row count and run-output maps.

That leaves several real failure shapes:

- dragging the scrollbar or trackpad inertia can look bottom-aligned while still
  missing the narrow bottom threshold;
- streaming assistant text can grow the existing last row without changing
  `rows.length`, so pinned mode has no new trigger to scroll after the row
  height changes;
- search and older-page anchor restoration issue their own scroll commands, so
  bottom-follow intent is mixed with programmatic scroll intent;
- manual scrollbar dragging away from the bottom is not treated as a detach
  action at all today: `pinned` is only cleared by upward wheel and
  ArrowUp/Home/PageUp, so dragging the thumb upward can leave auto-follow armed
  and let the next stream delta yank the viewport down.

The principled fix is a single transcript scroll-follow controller with explicit
intent states:

- `auto_follow`: the user is at the live tail; every tail content revision keeps
  the last row aligned after Virtuoso has measured the new height;
- `user_detached`: the user intentionally scrolled away; stream deltas do not
  pull the viewport down;
- `programmatic_anchor`: search and older-page loading temporarily own scroll
  restoration, then return to either detached or auto-follow based on final
  viewport position.

The controller should derive a `tailRevision` from visible transcript blocks,
message updates, run-output deltas, queued-message changes, and pending approval
footer changes, not just from row count. It should use a tolerant bottom
definition based on both scroll distance and virtual range visibility, then
schedule one coalesced post-measure `scrollToIndex({ index: "LAST", align:
"end" })` while in `auto_follow`.

Expected UX after the fix:

- Scrolling up keeps the transcript in place while new output arrives.
- Dragging, wheel-scrolling, or pressing End/PageDown back to the bottom makes
  the jump-to-latest control disappear and re-enables live following.
- While pinned, streamed text, reasoning, tool output, and approval/footer
  changes keep the viewport at the latest content without jitter.
- Loading older messages and search navigation preserve their requested anchors
  without accidentally re-enabling live following.

### 8. Composer Cannot Recall Previously Sent Messages

Codex CLI supports shell-style prompt history in the TUI. The reference
implementation is split across `codex-rs/message-history` and
`codex-rs/tui/src/bottom_pane/chat_composer_history.rs`: it appends prompt text
to a global `history.jsonl`, keeps current-session rich history in memory,
combines local and persistent entries into one offset space, lazy-loads
persistent entries by log identity plus offset, ignores stale lookup responses,
and only treats Up/Down as history navigation when the composer is empty or the
current text is the last recalled history entry at a line boundary. Recalled
entries put the cursor at the end so repeated Up/Down continues browsing
instead of turning into normal cursor movement.

Setta currently has no equivalent composer-history controller. Arrow keys are
used by the slash palette when it is open; otherwise the textarea receives them
as normal cursor movement. That means a user who wants to resend or lightly edit
a prior prompt has to scroll the transcript, select text, and copy it back into
the composer.

The principled Setta fix is not a renderer-only cache. The backend should expose
a typed composer-history projection from persisted user-authored `ChatMessage`
records in the selected conversation, and the renderer should merge that
projection with local submissions accepted during the current UI session. The
history entry payload should carry typed `ChatInput` parts, attachment metadata
needed to render composer chips, message identity, conversation identity,
ordinal, and timestamp. It must not parse rendered transcript text, raw DOM, or
run summaries. If cross-conversation or cross-workspace prompt history is
desired, it needs its own explicit product contract because attachment ownership
and workspace context are scoped.

The renderer-side controller should follow the Codex navigation contract:

- popups and pickers receive arrow keys first;
- Up recalls older history only when the composer is empty or is currently
  showing an unedited recalled entry with the caret at the first-line boundary;
- Down recalls newer history only when browsing history and the caret is at the
  last-line boundary;
- Down past the newest entry exits browsing and restores the pre-navigation
  draft snapshot, which is empty for the common empty-composer path;
- editing a recalled entry exits browsing so later arrow keys are normal
  textarea navigation;
- adjacent duplicate submissions are collapsed in the local session history;
- generated history entries preserve typed text and image parts when the current
  conversation still owns those attachments. Missing or invalid attachment
  references must produce a specific disabled/diagnostic state, not silently
  drop parts.

Expected UX after the fix:

- Empty composer, press Up: the latest sent prompt appears in the composer with
  the cursor at the end.
- Press Up again: the previous sent prompt appears. Press Down: the newer prompt
  returns. Press Down past the newest entry: the composer returns to the draft
  that was present before history browsing.
- If the slash command palette, model picker, or permission picker is open,
  Up/Down continues to move the active selection there.
- In a multiline draft, Up/Down moves the caret normally unless the draft is an
  unedited recalled history entry and the caret is at the relevant boundary.
- After reloading the app or reopening the conversation, earlier sent prompts in
  that conversation remain recallable because history comes from persisted chat
  messages.

## Architecture Direction

### 1. Use Typed Activity Details

Replace the flat `RunItem` presentation fields with a Go-owned
`RunItemDetails` discriminated union so each activity family has an explicit
payload:

- command execution;
- command start failure;
- MCP tool call;
- Setta dynamic tool call;
- file edit;
- diff update;
- approval request/response;
- provider stream lifecycle event.

This union must replace existing fields such as `Command`, `Cwd`, `ExitCode`,
`DurationMs`, `FilePaths`, `PatchStatus`, `ServerName`, `ToolName`, `Progress`,
`Result`, `Error`, `NoticeKind`, `NoticeMessage`, `DiffSummary`, `Namespace`,
`ProcessID`, `RequestID`, `ReviewID`, and raw `Details` where the information
belongs to a typed branch. It must start from the existing
`RunItemMCPToolCallDetails` branch rather than replacing it with a parallel MCP
shape.

The cutover is per activity family and atomic. For example, if command execution
gets a typed details branch, command execution stops reading and writing the
flat command fields in that same implementation slice. Do not keep flat fields
and union fields alive together for the same activity family. If one slice is
too large, split by activity family, not by adding a transitional dual path.

There is no backward compatibility for stored records. Persisted `RunItem`
records written before a family's cutover are not migrated, dual-read, or
silently coerced: after cutover, loading a record whose activity family lacks
the required typed details branch is a fail-loud validation error, the same as
any other corrupt state. It is acceptable that conversations recorded before
the cutover can no longer be loaded.

The work touches storage records, Codex transcript ingest, scripted harness
fixtures, showcase/mockup fixtures, run-activity projection, and the
background-terminal marker path because all of those construct or project
`RunItem` values today.

Generated TypeScript should come from the Go-owned contract. Renderer components
should switch exhaustively on the detail kind and fail typechecking when a new
kind lacks presentation logic.

### 2. Separate Display Labels From Raw Provider Identity

Store raw provider identity in details:

- MCP server and tool;
- Codex item type and provider item ID;
- command argv or shell command;
- Setta dynamic tool identifier.

Render labels from the same typed display contract for MCP and Setta dynamic
tools:

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

### 4. Extend RunLiveness Instead Of Adding Provider Lifecycle State

Backend chat state should route Codex app-server disconnects through
`RunLiveness`. Do not add a parallel connected/streaming/disconnected state
machine.

Unexpected stream termination should transition the run into a visible
`RunLiveness` state and emit the existing typed liveness/run events. If the
current fields are insufficient, extend `RunLiveness` with explicit attempt or
diagnostic metadata rather than adding a second lifecycle model. The
provider-restart reason already exists but the trigger is not currently fired;
that gap should be fixed in this slice.

Automatic retry is limited to provider-confirmed retryability. `willRetry: true`
means Codex is handling retry internally. `willRetry: false` should become an
honest terminal or lost state with partial transcript preserved and a manual
retry affordance. Idempotent mid-turn resume stays blocked on upstream Codex
protocol support.

### 5. Add File Descriptor Guardrails

Setta should measure and explicitly raise the soft FD limit early on Unix/macOS
before starting Codex app-server. The explicit `Setrlimit` call matters because
otherwise Go can restore the original soft limit for exec'd children. The
app-server launch path should fail loudly if the limit remains below the
documented 1024-descriptor minimum.

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

### 7. Make Transcript Scroll Following An Intent State

Replace scattered pinned-scroll checks with a small controller owned by
`ChatTranscript` or a focused hook. The controller should:

- distinguish user-detached, auto-follow, and programmatic-anchor modes;
- set detached mode for upward wheel, keyboard, pointer/thumb drag, and any
  scroll event that leaves the tolerant bottom zone;
- set auto-follow mode when the user reaches the tolerant bottom zone or clicks
  Jump to latest;
- consume a `tailRevision` that changes for any visible tail content or footer
  update that can affect scroll height;
- coalesce scroll-to-latest work into one post-measure animation frame while in
  auto-follow;
- avoid re-enabling auto-follow after search or older-page anchor restoration
  unless the restored viewport is actually at the bottom.

The hook should expose debuggable state for E2E assertions: mode, distance from
bottom, last visible virtual row index, tail revision, and pending scroll count.
Expose that state through cheap refs or an explicit E2E/debug snapshot read, not
React state that re-renders on every scroll event.

### 8. Add A Typed Composer Prompt-History Controller

Add a Go-owned projection for composer history rather than deriving from
rendered transcript rows:

```go
type ComposerPromptHistoryEntry struct {
    MessageID      string            `json:"messageId"`
    ConversationID string            `json:"conversationId"`
    Ordinal        int               `json:"ordinal"`
    CreatedAt      string            `json:"createdAt"`
    Input          ChatInput         `json:"input"`
    Attachments    []ImageAttachment `json:"attachments"`
}
```

The exact endpoint shape should follow the HTTP endpoint registry, but the
contract should support bounded lookup of older entries in the selected
conversation. It can be implemented as a projection over existing chat store
messages, not as a new history table. Since no backward compatibility is
desired, invalid stored messages should fail validation normally instead of being
silently rewritten for history recall.

Renderer state should live in a focused `useComposerPromptHistory` controller
or equivalent helper owned by `ChatComposer`. It should track:

- mode: idle or browsing;
- the pre-navigation draft snapshot, including typed attachments;
- current history cursor and cached entries;
- the last applied history entry key and text/input snapshot;
- pending backend lookup request identity so stale async responses cannot
  replace the current draft.

The controller should receive successful send, queue, and steering submissions
as typed `ChatInput` values after the backend accepts them. It should not record
failed submissions or speculative drafts. Key handling should run after command
palette and picker handling, before default textarea movement, and only when
`event.nativeEvent.isComposing` is false and the textarea selection/caret state
matches the history-navigation contract.

## Implementation Slices

### Slice 1: File Descriptor Reliability

- Add Unix/macOS FD-limit inspection before launching `codex app-server`.
- Explicitly raise the soft limit with `Setrlimit` when the hard limit allows
  it, so exec'd children inherit the raised value.
- Fail loudly with a clear diagnostic if the limit remains below 1024
  descriptors.
- Record current limit and app-server launch diagnostics in development logs.
- Remaining upstream dependency: Codex unified exec should become FD-aware and
  throttle parallel tool startup when descriptor headroom is low.

### Slice 2: Stream Failure Resilience

- Reproduce the renderer crash from the recording with a deterministic scripted
  harness before changing behavior.
- Route app-server stream disconnects through existing `RunLiveness` status and
  reason fields.
- Fix the provider-restart trigger so `provider_restarted` is emitted when the
  app-server restart path is the actual liveness cause.
- Fix the `ListConversations` liveness projection race: it currently projects
  active run liveness from service-owned active/liveness maps, so reads of those
  maps must happen under `service.mu` or through a locked snapshot helper.
- Preserve partial transcript state on disconnect.
- Convert non-retryable stream loss into an honest failed/lost state without
  throwing in the renderer.
- Add manual retry/continue/diagnostic affordances only where backed by existing
  run state and provider capability.
- Park automatic same-turn reconnect/resume as an upstream Codex dependency
  until there is an idempotent resume-this-turn protocol.

Status after the stream-error liveness step:

- Done: app-server session lifecycle errors route through `RunLiveness` with
  `provider_restarted` when provider reconciliation confirms the turn is still
  active. The deterministic Electron fake now streams partial assistant output
  before exit and verifies that the transcript stays mounted while the run shows
  reconnecting liveness through the production path.
- Done: `ListConversations` snapshots active-run liveness under the service lock
  so conversation list projection does not race active/liveness map updates.
- Done: Codex `error` notifications now decode through the generated app-server
  protocol type, record provider diagnostics, preserve partial assistant text,
  and route retryable stream errors through `RunLiveness` as `stream_resync`.
  Non-retryable stream-loss notifications mark the active run `lost` with
  `provider_unavailable` so the renderer stays mounted and exposes degraded run
  controls instead of crashing. Non-stream terminal provider errors still finish
  the turn through the normal failed-run path.
- Remaining: no known Slice 2 implementation gap. Slice 3 is ready to start with
  protocol findings and typed activity contract shape.

### Slice 3: Protocol Findings And Contract Shape

- Compare Setta's current activity/run-item model against Codex app-server item
  shapes for MCP calls, command execution, file changes, diff updates, and stream
  lifecycle events.
- Identify which labels and details are already present in Codex protocol data
  and which need upstream Codex protocol changes.
- Define the Go-owned `RunItemDetails` union and shared display-label contract.
- List the flat `RunItem` and `RunActivityDetailsProjection` fields each union
  branch will replace, with `RunItemMCPToolCallDetails` as the first existing
  branch to preserve.
- Register new tagged-union branches in
  `cmd/generate-contracts/contract_registry.go`.
- Regenerate affected TypeScript surfaces from Go-owned contracts.

Status after the MCP typed-details cutover:

- Done: `RunItem.details` is now a Go-owned tagged union registered with the
  contract generator, with `mcp_tool_call` as the first branch. MCP server/tool
  identity, display title, progress, duration, result summary, structured
  result, metadata, and error now live in that branch instead of the flat MCP
  fields.
- Done: the renderer presents MCP activity as `MCP: <server>` while preserving
  the tool name, arguments, result content, structured content, metadata,
  duration, progress, and error in expanded details and search.
- Done: audit follow-up verified MCP metadata search through the production
  Electron path. Search now indexes MCP result content and metadata, and focused
  activity-row expansion is idempotent so search/focus reveal does not trigger a
  renderer update loop.
- Done: raw JSON details for activity families that have not been cut over yet
  moved to `RunItem.rawDetails`; MCP items reject raw details during validation.
- Done: command execution now writes `RunItem.details.commandExecution` for
  command text, cwd, exit code, duration, provider process ID, command source,
  result, and error. Backend projection, background-terminal promotion,
  transcript details, search, and deterministic Electron chat workflows read the
  typed branch. Command-execution records with legacy flat command fields now
  fail validation instead of being dual-read. Live Codex Electron was exercised
  during this slice; the final reruns reached live chat command activity and
  then failed later in the semantic cartographer segment.
- Done: file changes now write `RunItem.details.fileChange` for patch status,
  changed paths, operation type, optional move path, additions/deletions, and a
  bounded patch snippet. Codex patch-updated notifications decode through the
  generated `changes` protocol shape instead of the legacy `changedPaths/status`
  projection. Transcript details, search, workspace activity, semantic
  cartographer summaries, deterministic Electron protocol coverage, and live
  Codex Electron coverage read the typed branch. File-change records with legacy
  flat file fields now fail validation instead of being dual-read.
- Done: diff updates now write `RunItem.details.diff` for the turn-level
  unified diff, changed paths, operation type, additions/deletions, summary, and
  bounded patch snippet. Codex `turn/diff/updated` notifications decode through
  the generated protocol shape instead of a hand-read summary field. Transcript
  details, search, semantic cartographer summaries, and deterministic Electron
  protocol coverage read the typed branch. Diff records with legacy flat
  diff/file fields now fail validation instead of being dual-read.
- Done: dynamic tool calls now write `RunItem.details.dynamicToolCall` for
  namespace, tool name, Setta-owned display title/description/category,
  duration, structured arguments, result content, success, summary, and error.
  Codex dynamic tool requests, Codex thread-item replay, scripted workflow
  fixtures, showcase data, transcript details, search, workflow-result
  extraction, semantic cartographer summaries, deterministic Electron protocol
  coverage, and live Codex workflows read the typed branch. Dynamic-tool records
  with legacy flat namespace/tool/result/error/duration/rawDetails fields now
  fail validation instead of being dual-read.
- Done: approval request and auto-review rows now write
  `RunItem.details.approval` for approval IDs, kind/status, provider request ID,
  command/cwd/file/permission/question/structured-input payloads, review status,
  action type, and provider review/action metadata. Scripted approvals, Codex
  app-server approval requests, MCP elicitation requests, auto-approval review
  notifications, showcase data, transcript details, search, deterministic
  Electron approval/protocol coverage, and live Codex workflows read the typed
  branch. Approval records with legacy flat request/review/raw details now fail
  validation instead of being dual-read.
- Done: audit follow-up fixed resolved approval statuses in the typed activity
  branch, so submitted approvals update `approvalStatus` and the activity row
  status instead of remaining pending. The scripted user-input approval workflow
  now emits the same typed `approval_request` row as the other approval
  workflows and deterministic Electron coverage asserts the answered status.
- Remaining: complete protocol findings and typed-detail cutovers for failed
  starts and stream lifecycle activity rows.

### Slice 4: Tool And File Activity Rendering

- Project MCP and Setta dynamic tool calls into typed detail payloads.
- Render compact product labels with structured details available on expansion.
- Replace generic `file change` and `Diff updated` rows with path and diff-stat
  summaries.
- Add explicit failed-tool-start activity rows where the provider reports the
  failed start; otherwise track the missing event as the upstream Codex
  dependency from issue 3.
- Keep noisy activity collapsed by default while preserving search/focus reveal.

### Slice 5: Image Attachment Variants

- Decide before implementation whether `preview` means a bounded large variant
  or the original bytes. If the original is exposed, name it `original` and keep
  `preview` bounded.
- Add typed image variant constants and metadata in `internal/chat`.
- Generate `thumbnail` and `inline` PNG files from the original during
  attachment creation.
- Record variant dimensions, MIME type, byte size, and relative path in
  `metadata.json`.
- Extend the attachment protocol to serve explicit variant names.
- Update composer, transcript, and preview rendering to select variants by
  surface intent.
- Include composer prompt-history recall in variant verification because
  `ComposerPromptHistoryEntry.Attachments` reuses `ImageAttachment`; recalled
  chips must render from the typed variant contract, not stale thumbnail/preview
  fields.

Status after the image attachment variant cutover:

- Done: image attachments now expose typed `thumbnail`, `inline`, `preview`,
  and `original` variants. `preview` is a bounded large PNG variant, and
  unmodified upload bytes are exposed only through the explicit `original`
  variant.
- Done: attachment storage writes variant metadata with URL, MIME type,
  dimensions, byte size, and relative path; legacy flat thumbnail/preview
  fields were removed from `ImageAttachment` and `ImagePart` without a dual-read
  compatibility path.
- Done: the Electron attachment protocol serves explicit variant names, composer
  chips request `thumbnail`, transcript rows request `inline`, and preview modals
  request `preview`.
- Done: deterministic Electron chat workflow coverage verifies the production
  attachment path and inline transcript variant rendering. Live Codex Electron
  and backend chat workflows were run because this touches chat behavior.
- Remaining: composer prompt-history recall of image attachments should be
  verified when Slice 7 introduces the typed history controller.

### Slice 6: Transcript Scroll Stickiness

- Extract the current `pinned` logic in `ChatTranscript` into a focused
  scroll-follow controller or hook.
- Define the tolerant bottom contract using scroll distance plus Virtuoso range
  visibility.
- Add a derived tail revision for transcript block/message/run-output/footer
  changes that can alter the live tail height.
- Preserve search and older-page anchor restoration as explicit
  programmatic-anchor mode.
- Keep `followOutput={false}` unless profiling proves Virtuoso-owned following
  can meet the same intent contract without duplicate scroll work.
- Add deterministic E2E coverage for scroll up, return to bottom, same-row
  streaming deltas, row-append deltas, output deltas, search, and older-page
  loading.

Status after the transcript scroll stickiness step:

- Done: `ChatTranscript` now delegates transcript tail behavior to a focused
  scroll-follow controller with explicit `auto_follow`, `user_detached`, and
  `programmatic_anchor` modes. The controller uses scroll distance plus Virtuoso
  range visibility for the tolerant-bottom contract and exposes a cheap debug
  snapshot for E2E assertions.
- Done: tail revisions now include visible tail rows, assistant text growth,
  message and queued-message updates, activity updates, run-output deltas,
  run-output page state, and active-run pending approval footer state.
- Done: manual scroll movement detaches from the live tail, Jump to latest and
  reaching the bottom re-enable following, and search plus older-page loading
  use programmatic-anchor restoration instead of mixing with live-follow intent.
- Done: deterministic Electron coverage drives the production
  main/preload/renderer/HTTP/store path for scroll-away/no-steal behavior,
  Jump-to-latest re-pinning, same-row streaming growth, row-append streaming,
  output deltas, search focus, and older-page anchor preservation after reload.
- Verification finding: during the approval-details audit, the full
  deterministic chat workflow passed the approval segment but twice timed out in
  the later transcript-scroll stickiness segment after the snapshot reported
  `auto_follow` and `atBottom`. Treat this as a Slice 6 follow-up before using
  the full chat workflow as a green broad gate.
- Remaining: investigate the repeated transcript-scroll E2E timeout. Slice 7
  was already completed; typed activity work can continue independently, but the
  scroll broad-gate failure should not be treated as proof of approval behavior.

### Slice 7: Composer Prompt History

- Define `ComposerPromptHistoryEntry` and request/response contracts in the
  Go-owned HTTP endpoint registry.
- Project history entries from persisted user-authored messages in the selected
  conversation, ordered newest-to-oldest with bounded pagination or lookup.
- Regenerate affected TypeScript surfaces from the Go-owned contracts.
- Add a renderer composer-history controller that merges local accepted
  submissions with backend history and rejects stale async lookup responses.
- Integrate key handling after popup/picker routing and before default textarea
  movement.
- Restore typed text and valid current-conversation image parts into the
  composer, with explicit diagnostics for invalid attachment references.
- Add deterministic E2E coverage for empty-composer recall, Up/Down cycling,
  Down-past-newest restoration, multiline caret behavior, popup key ownership,
  accepted edit-and-send from a recalled prompt, and recall after reload.

Status after the composer prompt-history step:

- Done: `ComposerPromptHistoryEntry` and `ComposerPromptHistoryPage` are
  Go-owned contracts exposed through the HTTP endpoint registry, generated
  TypeScript backend surface, Electron main/preload IPC, and renderer API.
- Done: composer history is projected from persisted user-authored
  `ChatMessage` records in the selected conversation, newest-to-oldest, with
  bounded pagination and typed `ChatInput` plus current-conversation
  `ImageAttachment` descriptors. Invalid persisted inputs or missing image
  attachments fail loudly instead of being silently dropped.
- Done: `ChatComposer` now owns a focused prompt-history controller. It merges
  backend history with backend-accepted local send, queue, and steering
  submissions; ignores failed/speculative drafts; rejects stale async page
  responses after conversation changes; and exits browsing after manual text or
  attachment edits.
- Done: Up/Down key handling runs after slash/picker routing and before default
  textarea movement. Empty composer recall, Up/Down cycling, down-past-newest
  draft restoration, multiline caret behavior, popup key ownership, accepted
  edit-and-send, and reopened-conversation recall are covered through the
  production Electron/main/preload/renderer/HTTP/store path.
- Done: recalled image prompts restore composer chips from the typed
  `thumbnail` variant and preserve exposed `ChatImageInput` detail metadata for
  resubmission. Missing or cross-conversation image references produce explicit
  diagnostics.
- Remaining: no known Slice 7 implementation gap. Remaining plan work is the
  earlier activity typed-detail/rendering backlog: failed starts and stream
  lifecycle activity rows.

## Verification Plan

Start narrow with the changed contract owner and renderer components, then
finish with production-path app workflows because these issues cross backend,
provider, preload, renderer, and transcript state.

Required deterministic E2E coverage:

- open a workspace, create a chat, send a message, and render MCP activity with
  structured details;
- show a failed command-start activity row for a scripted provider failure;
- render file update and diff rows with useful path/stat details;
- simulate Codex app-server stream disconnects through the scripted harness and
  verify the chat UI stays mounted, preserves partial transcript state, and
  transitions through the existing `RunLiveness` projection;
- attach an image, send it, and verify the transcript uses the inline variant
  through the production Electron/main/preload/renderer path.
- stream a long assistant response, scroll away from the tail, verify new output
  does not steal the viewport, return to the bottom, and verify same-row
  streaming deltas keep the transcript pinned.
- send multiple prompts, focus the composer, cycle through them with Up/Down,
  verify popups retain arrow-key ownership, verify multiline drafts keep normal
  caret movement, and reload the app to confirm persisted prompt history still
  recalls through the production Electron/main/preload/renderer path.
- recall a sent image prompt and verify the restored composer chips render from
  the current attachment variant contract.

When implementation touches live Codex provider integration, run live Codex E2E
tests if local ChatGPT auth is available. Extend the existing liveness
regressions for active-turn reconciliation, silent upstream loss, and stale
interrupt behavior instead of adding a parallel test family. Do not use
`OPENAI_API_KEY` for those tests. If ChatGPT auth is unavailable, record the
live-provider skip explicitly. Long chat E2Es can be flaky in the sandbox; a
single `--skip-build` retry is acceptable when the first failure is an existing
workflow flake rather than the changed behavior.

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
- What exact display-title precedence should Setta use across provider display
  metadata, Setta-owned display metadata, and deterministic fallback labels?
- Before Slice 5 starts: should image `preview` continue to mean original bytes,
  or should a separate `original` variant be exposed while `preview` becomes a
  bounded large image?
