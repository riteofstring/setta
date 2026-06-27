# Chronological Chat Transcript Plan

## Goal

Render chat turns in the order the assistant actually produced them:

```text
assistant text
thinking/status
command row
command row
assistant text
public reasoning summary
assistant text
```

The transcript should no longer flatten each run into one assistant message followed
by one heavy outer Activity accordion. Chronology should be owned by the backend
and delivered to the renderer as typed display blocks. The renderer should render
those blocks without interpreting raw provider or run-item protocol.

This is an ingestion, storage, projection, contract, renderer, and E2E change. It
is not a CSS-only refactor.

## Non-Goals

- Do not preserve legacy transcript storage or renderer compatibility paths.
- Do not add migrations, dual-read/write code, old-field aliases, or transitional
  adapters.
- Do not reconstruct chronology from existing accumulated assistant text.
  Development data can be recreated.
- Do not make the renderer infer transcript UI from raw `RunItem` types,
  provider item names, text contents, or keyword heuristics.
- Do not keep the current outer Activity accordion in the chronological
  transcript.

## Compatibility Policy

This plan intentionally requires a clean replacement. Implementation must not
include any backward compatibility, legacy support, migrations, transitional
code, dual-read/write paths, compatibility aliases, best-effort old-data parsing,
or silent fallbacks to the old transcript/activity model.

Development data can be recreated. If an old transcript shape is encountered
after this work lands, fail loudly and specifically rather than rendering it
through a compatibility shim.

Intermediate phases do not need to keep the app or transcript UI in a working
state. Do not retain `Transcript`, `RunActivityGroupProjection`, old generated
fields, or renderer compatibility paths solely so partially implemented phases
continue to run. Prefer removing or replacing legacy surfaces at the same time
their block-based owner is introduced, even if later phases are required before
the app is usable again.

## Current Problem

Today the service appends assistant deltas into one growing text part:

```go
message.Parts[0].Text += appendText
```

Run items are stored separately and later projected into a single
`RunActivityGroupProjection`. The renderer then shows:

```text
assistant full message
Activity accordion
  command row
  reasoning row
  command row
```

That loses event chronology. If the real stream was:

```text
assistant text -> command -> assistant text -> command -> assistant text
```

the persisted state does not record which text existed before each command. The
backend cannot accurately rebuild this after the fact. The chronological boundary
has to be captured when deltas and run-item events arrive.

The current outer accordion also becomes visually too heavy in a chronological
timeline. It was useful as a per-turn summary, but repeated wrappers between
assistant text blocks would make the transcript harder to scan.

## Product Contract

- Text, thinking, reasoning, approvals, tool calls, commands, output previews,
  file changes, and other visible activity appear in the order observed by the
  service.
- Each visible thing is a stable transcript block with a stable ID and ordinal.
- Existing blocks do not move after later blocks arrive. Text may append inside a
  text block, and status/details may update inside an existing block.
- No private or hidden reasoning text is exposed.
- Generic private reasoning does not create permanent transcript noise.
- Public reasoning summaries are visible as slim reasoning blocks, not as fake
  empty accordions.
- Commands and tool/action rows are slim by default. Only individual rows with
  details or output are expandable.
- Every activity sequence renders with a very slim fixed-height group slot above
  the first activity row. The slot is derived from adjacent typed activity
  blocks, carries the lightweight type/count label and hover/focus bulk
  expand/collapse controls, and does not require a persisted wrapper block.
- Reasoning is one stable transcript block kind. Active thinking and public
  summary display are modes of that block, not separate block kinds.
- Run item output pagination still keys off the source run item ID.
- Transcript pagination is block-aware from the first implementation.
- Streaming is push-based. Do not poll for transcript updates.

## Visual Reference

Use `docs/mockups/chronological_chat_transcript_mockup.html` as the visual
reference for the intended chronological transcript experience: slim activity
rows, the fixed-height group slot above adjacent activity rows, hover/focus bulk
expand controls, reasoning block modes, and removal of the heavy outer Activity
accordion. The mockup is illustrative design guidance; the Go-owned transcript
block contract remains the source of truth for behavior and renderer data shape.

## Target Transcript Blocks

Introduce a Go-owned, generated contract for ordered transcript blocks. The exact
Go shape can be adjusted to the generator, but the renderer-facing API should be
exhaustive by block kind.

Recommended block kinds:

- `user_message`: normal trigger, steering, queued, command, and system-visible
  user-side messages.
- `assistant_text`: one contiguous assistant text segment.
- `reasoning`: active thinking and public reasoning summary content. The block
  has a mode such as `thinking` or `summary`; the block kind and ID stay stable
  when public summary content arrives.
- `activity_item`: one command, tool call, file change, approval, web search,
  image operation, terminal interaction, diff, hook, notice, or structured input.
- `run_status`: two lifetimes by mode. A live-only `mode: "working"` indicator
  shown before the run has any public block — never persisted as history — plus
  permanent terminal metadata (`cancelled`, `failed`, `completed`) when it needs
  a transcript-visible row.

Suggested fields:

```go
type TranscriptBlock struct {
    SchemaVersion  int                  `json:"schemaVersion"`
    ID             string               `json:"id"`
    ConversationID string               `json:"conversationId"`
    RunID          string               `json:"runId"`
    Kind           TranscriptBlockKind  `json:"kind"`
    Ordinal        int                  `json:"ordinal"`
    Status         TranscriptBlockStatus `json:"status"`
    CreatedAt      string               `json:"createdAt"`
    UpdatedAt      string               `json:"updatedAt"`

    UserMessage    *TranscriptMessageProjection       `json:"userMessage"`
    AssistantText  *AssistantTextBlockProjection      `json:"assistantText"`
    Reasoning      *ReasoningBlockProjection          `json:"reasoning"`
    Activity       *ActivityItemBlockProjection       `json:"activity"`
    RunStatus      *RunStatusBlockProjection          `json:"runStatus"`
}
```

Prefer generated TypeScript discriminated unions if the generator supports them.
If it does not, keep the `kind` field authoritative and generate nullable branch
payloads with decoder validation that exactly one branch is populated for each
kind.

## Ordering Model

Add a unified run-local transcript ordinal. Every visible run block receives the
next ordinal when it is first created:

```text
1 assistant_text
2 reasoning(mode=thinking)
3 activity_item command A
4 activity_item command B
5 assistant_text
```

Run item updates do not create new ordinals. They update the existing block that
references the run item. Output chunks do not create transcript blocks; they
stream through output events and update the activity block only when display
metadata changes, such as first output availability, status, details, or summary.

Conversation-level sorting should use a stable composite key:

```text
run anchor conversation ordinal, run transcript ordinal
```

The trigger message anchors the run in conversation order and should render as a
`user_message` block inside that run's block stream. Steering messages sent
during an active run also receive run-local transcript ordinals at ingestion
time. That lets the visible stream show:

```text
assistant_text
activity_item command B
user_message steering
assistant_text
```

instead of sorting the steering message after the whole run merely because its
conversation message ordinal is later. Standalone messages that do not belong to
a run still sort by their conversation message ordinal.

## Storage Model

Introduce persisted run transcript blocks owned by `internal/chat`. A file-backed
store can mirror the existing message, run item, and output stores:

```text
workspaces/<workspace>/conversations/<conversation>/runs/<run>/transcript_blocks/<ordinal>_<id>.json
```

The exact path should follow local store conventions, but the important property
is that blocks are first-class persisted records, not derived from renderer state.

Recommended direct model changes:

- Keep `ChatMessage` for user, steering, queued, command, and other message
  records where it still fits.
- Stop storing active assistant output as one canonical `ChatMessage.Parts[0]`
  blob for transcript rendering.
- Store assistant output as one or more `assistant_text` transcript blocks.
- Keep run items as source records for provider activity, but add a stable link
  from each displayable run item to its transcript block ID/ordinal.
- Keep run item outputs paged by `sourceRunItemId`.
- Remove the transcript dependency on `RunActivityGroupProjection`.

`Run.AssistantMessageID` should be removed from transcript rendering
responsibility. Prefer removing it outright; retain a non-rendering assistant
envelope only if a concrete backend feature still needs one. It must not be the
source of transcript chronology or part of the renderer transcript contract.

## Ingestion Rules

Chronology is captured in `turnSink` handling while the service already has event
order.

### Assistant Text Deltas

When an assistant text delta arrives:

- If the current open block is `assistant_text` for the same run and provider
  text segment, append to it.
- Otherwise create a new `assistant_text` block with the next run transcript
  ordinal and append there.
- Publish a text delta event keyed by transcript block ID.
- Persist at the existing cadence, but persist blocks rather than one monolithic
  assistant message part.

The provider-item de-duplication rules still apply, but they must become
block-aware:

- Deltas append verbatim.
- Completed typed `agentMessage` items can reconcile the latest provider-owned
  appended suffix.
- Identical completed `agentMessage` items from distinct provider IDs should not
  duplicate final assistant text.
- False-positive cases like repeated words, bullet markers, and snapshot-looking
  deltas must remain covered.

### Run Item Created

When a new run item arrives:

- Close the current assistant text segment for chronological purposes.
- Decide displayability in Go using typed fields.
- If it is displayable activity, create an `activity_item` block linked to the
  run item.
- If it is active reasoning with a public non-generic title but no public summary
  body, create or update a `reasoning` block with `mode: "thinking"`.
- If that same reasoning item later gains public summary/progress content, update
  the same `reasoning` block to `mode: "summary"` in place.
- If a reasoning item has no visible block yet and later gains public
  summary/progress content, create a `reasoning` block at the moment the public
  content becomes visible.
- If it is private/generic reasoning only, do not create a permanent block.

Run item updates mutate the existing block. They must not create a second block
for the same provider item.

### Run Item Output Deltas

When output arrives:

- Continue emitting `chat.run_item_output.delta` or its replacement for every
  output chunk.
- Do not republish the full transcript projection for every output chunk.
- Update the activity block only when output first becomes available, status
  changes, details change, or completion changes the row presentation.
- Keep lazy output loading keyed by source run item ID.

### Reasoning Blocks

Reasoning is one stable block kind with mode-specific rendering:

- Prefer public live fields in typed order, for example `progress`, then public
  `summary`, then explicit non-generic `title`.
- Never use `HiddenText`.
- Treat generic titles like `Reasoning summary` as labels, not useful headlines.
- Active meaningful reasoning without public body renders as `reasoning` with
  `mode: "thinking"`.
- Public body renders as `reasoning` with `mode: "summary"`.
- Both modes show the same one-line headline (the derived public field above). In
  `mode: "summary"` that headline stays on the collapsed row and the full public
  summary is revealed on expand. The headline persists unchanged across the
  `thinking` to `summary` transition; the row only gains a disclosure chevron and
  an expandable body.
- The block ID and kind do not change when the mode changes.
- When `mode: "summary"` supersedes a `thinking` block that is no longer the live
  tail, it must render collapsed so the in-place update keeps the same one-line
  height. Updating a non-tail block must never change its collapsed height, or it
  shifts every block below it.
- A `reasoning` block may be removed only while it is still the live tail and no
  later block has been emitted beneath it.
- Once a later block exists below a `reasoning` block, do not silently remove it
  from the middle of the transcript. Resolve or update it in place.

### Live Working Indicator

Generic/private-only reasoning stays silent after the run already has visible
public blocks. The one exception is liveness before any public block exists. If
an active run has no visible transcript block yet, the backend should project a
minimal live-tail `run_status` block such as `Working`. This prevents the chat
from looking dead during a long private setup phase.

That live working indicator is not a permanent reasoning block. It can disappear
or be replaced when the first real visible block is created, because it is still
the only live-tail block and no later transcript content can shift beneath it.
The `working` mode is live-only transcript state and is never persisted as
historical content, unlike the terminal `run_status` modes (`cancelled`,
`failed`, `completed`), which are permanent records.

## Projection And Events

Replace page-level `TranscriptTurn` activity rendering with ordered transcript
blocks.

Suggested block-aware page contract:

```go
type MessagePage struct {
    Conversation       Conversation       `json:"conversation"`
    Blocks             []TranscriptBlock  `json:"blocks"`
    Messages           []ChatMessage      `json:"messages"`
    Queue              QueueState         `json:"queue"`
    Goal               *ChatGoalState     `json:"goal"`
    HasMoreOlder       bool               `json:"hasMoreOlder"`
    OlderBeforeBlockOrdinal int           `json:"olderBeforeBlockOrdinal"`
}
```

`MessagePage` must not include page-level raw `RunItems` or `RunItemOutputs` as
transcript-rendering inputs. Detail panes and lazy output expansion should use
explicit source-run-item endpoints keyed by `sourceRunItemId`. If `Messages`
remain in the response for queue state, commands, or non-transcript surfaces,
they must not be load-bearing for transcript rendering.

Block pagination is part of the first implementation. Do not select a page by
message/run ordinal and then dump all blocks for selected runs into the renderer.
The page boundary should be a transcript block boundary, with bounded detail and
output previews attached separately.

Streaming events should be block-oriented:

- `chat.transcript_block.created`
- `chat.transcript_block.updated`
- `chat.transcript_text.delta`
- `chat.transcript_blocks.replaced` for rare per-run snapshot replacement if
  needed
- run item output delta/page events for output text

Do not trigger full block snapshot publication on assistant text deltas. Text
deltas already carry their own event.

The renderer store should upsert blocks by ID, append text deltas by block ID,
and sort by generated ordinals. It should not inspect raw run items to decide
what transcript row to render.

## Renderer Shape

Replace `TranscriptTurnRow` and `RunActivityRows` in the main transcript with a
block renderer:

```tsx
switch (block.kind) {
  case "user_message":
    return <UserMessageBlock block={block} />;
  case "assistant_text":
    return <AssistantTextBlock block={block} />;
  case "reasoning":
    return <ReasoningBlock block={block} />;
  case "activity_item":
    return <ActivityItemBlock block={block} />;
  case "run_status":
    return <RunStatusBlock block={block} />;
  default:
    return assertNever(block);
}
```

Keep `react-virtuoso` as the transcript virtualization boundary. Long assistant
text may still need chunking, but chunking should happen inside an
`assistant_text` block without moving activity blocks around it.

Before rendering, the renderer may run a deterministic grouping pass over the
already-projected ordered blocks to identify adjacent `activity_item` sequences.
This pass must use only typed transcript block fields. It must not inspect raw
run items, provider item IDs, provider text, or keyword heuristics.

## Slim Activity UI

Remove the permanent outer Activity accordion from the transcript.

Each `activity_item` row should be compact:

- icon
- title or command summary
- status/spinner
- optional chevron only when the row has details or output
- expandable details only inside that row

Examples:

```text
assistant: I will inspect the scripts.

3 commands                         [expand all on hover/focus]
$ find . -maxdepth 1 -name '*.sh'
$ sed -n '1p' ./setup.sh
$ ./check_quality.sh --git-changes

assistant: The scripts are wrappers around the pinned toolchain.
```

Single activity rows still get the same slim slot so later grouping controls and
counts never need to be inserted above an already-visible row:

```text
assistant: I will run the focused test.

command                            [expand on hover/focus]
$ ./scripts/go.sh test ./internal/chat -run TestChronological

assistant: The focused test passes.
```

### Group Labels

Consecutive activity items are grouped by the renderer from the ordered typed
block list. The group label is not a persisted backend block. The renderer always
reserves the label/control slot immediately before the first activity row in the
sequence, including live streaming, so a later second or third command only
mutates the slot text and controls in place.

The derived group has:

- stable group ID derived from the first member block ID
- count
- primary type, such as `commands`, `tools`, or `actions`
- list of member activity block IDs
- aggregate status

The label should be visually light: small muted text, no box, no parent border,
no permanent chevron, and a very small fixed height. It should read as a timeline
label, not as a container. For a single row it can say `command`, `tool`, or
`action`; for multiple adjacent rows it mutates to `2 commands`, `3 actions`,
and so on. Do not insert a new label above historical rows during normal live
streaming.

### Bulk Expand/Collapse

For adjacent activity groups:

- Show a small expand/collapse-all icon on hover and focus near the top-most row
  or group label.
- Use the same visual language as existing message hover actions.
- Include keyboard access. Hover-only controls are not sufficient.
- Only expandable member rows participate.
- Keep row expanded state local and keyed by block/source run item ID.
- If any row in the group is focused by deep link, reveal the group control and
  expand that row without expanding unrelated rows.

## Reasoning UI

Reasoning should be a first-class timeline element, not an activity accordion
placeholder.

### Active Reasoning

Use `reasoning` with `mode: "thinking"` for meaningful active reasoning titles:

```text
assistant: I will inspect the parser.

spinner Mapping parser modules

$ rg -n "parse" internal
```

This covers the case where assistant text already exists and the assistant then
does more reasoning without tools. The status row is chronological and truthful.

Do not reuse only the old empty-message thinking placeholder as the final model.
That placeholder is insufficient because it disappears after first assistant
text. The chronological model needs a real status block that can appear after
text.

### Public Reasoning Summary

When public reasoning content exists, render the same `reasoning` block with
`mode: "summary"`. The collapsed row keeps the derived headline (the same one-line
headline shown during `mode: "thinking"`); expanding reveals the full public
summary:

```text
collapsed:  Mapping parser modules
expanded:   Mapping parser modules
            ...full public summary: request flow, retry path, bounded fix...
```

Collapse by default with a row-level chevron — and always start collapsed when
summary mode supersedes an earlier `thinking` block that is no longer the live
tail, so the in-place mode change keeps the same one-line height and never shifts
later blocks. The generic provider title `Reasoning summary` is never used as the
headline. Public reasoning should never be nested under a command group label and
should never expose hidden text.

### Private Or Generic Reasoning

Private or generic reasoning should not become a transcript block. If there is
no meaningful public title or public summary, keep it silent even while the run
is working. This avoids rows like `Thinking: Reasoning summary`, which add
motion without useful information.

If the run has no visible public block yet, show only the minimal `run_status`
working indicator at the live tail. That indicator disappears when the first real
block appears.

## Concrete Workflows

### Text, Commands, Text

Provider sequence:

```text
assistant delta: "I will inspect the shell scripts."
run item created: command A
run item created: command B
assistant delta: "They are all pinned-toolchain wrappers."
```

Transcript:

```text
assistant_text: I will inspect the shell scripts.
activity_item: command A
activity_item: command B
assistant_text: They are all pinned-toolchain wrappers.
```

Rendered activity slot:

```text
2 commands
```

### Text, Reasoning, Text, No Tools

Provider sequence:

```text
assistant delta: "The parser likely lives in internal/chat."
reasoning running: "Checking parser ownership"
assistant delta: "The parser is in internal/chat/codex_harness..."
```

Transcript:

```text
assistant_text: The parser likely lives in internal/chat.
reasoning(mode=thinking): Checking parser ownership
assistant_text: The parser is in internal/chat/codex_harness...
```

### Public Reasoning Summary

Provider sequence:

```text
reasoning completed with public summary
assistant delta
```

Transcript:

```text
reasoning(mode=summary): public summary only
assistant_text
```

### Private Reasoning Only

Provider sequence:

```text
reasoning running with generic title and hidden text only
assistant delta
```

Transcript:

```text
assistant_text
```

No permanent reasoning block is created.

### Silent Startup Liveness

Provider sequence:

```text
private reasoning starts
no assistant text yet
no public tool/activity yet
assistant delta: "I found the entry point."
```

Live transcript before the first public block:

```text
run_status(mode=working): Working
```

Final transcript:

```text
assistant_text: I found the entry point.
```

The generic working indicator is live-only and disappears before any later block
can shift beneath it.

### Steering Interleaved Mid-Run

Provider/user sequence:

```text
assistant delta: "I will inspect the scripts."
run item created: command A
user steering message: "Also check setup.sh"
assistant delta: "I will include setup.sh."
```

Transcript:

```text
assistant_text: I will inspect the scripts.
activity_item: command A
user_message(delivery=steering): Also check setup.sh
assistant_text: I will include setup.sh.
```

### Output Streaming

Provider sequence:

```text
command created
stdout chunk 1
stdout chunk 2
stdout chunk 3
command completed
```

Transcript events:

```text
activity_item created
run_item_output.delta chunk 1
activity_item updated: hasOutput true
run_item_output.delta chunk 2
run_item_output.delta chunk 3
activity_item updated: completed
```

The full transcript block projection is not republished for every output chunk.

## Implementation Phases

### Phase 0: Freeze The Intended Behavior

- Add a plan-linked deterministic fixture that emits:
  - assistant text before command
  - command
  - assistant text after command
  - reasoning after assistant text with no tool
  - public reasoning summary
  - private/generic reasoning only
  - multiple adjacent command rows
  - output streaming with multiple chunks
- Add assertions against the current UI showing the confusing behavior, then
  update them as implementation lands.
- Keep recording diagnostics for raw Codex stream, backend block events, and DOM
  block order.

### Phase 1: Contracts And Store

- Define `TranscriptBlock` and branch payload types in Go.
- Add store read/write/list helpers for run transcript blocks.
- Add next-ordinal allocation per run.
- Add validation for block kind, branch payload, source run item references, and
  monotonic ordinals.
- Regenerate TypeScript contracts.
- Remove transcript-rendering dependence on `RunActivityGroupProjection` and
  other old transcript-rendering fields from the generated page contract. Do not
  keep them just to preserve intermediate app usability.
- Replace message/run-ordinal transcript paging with block-aware transcript
  paging.

### Phase 2: Ingestion

- Change assistant delta ingestion to create/append `assistant_text` blocks.
- Make provider text canonicalization block-aware.
- Change run item ingestion to create/update `activity_item` and `reasoning`
  blocks.
- Project a live-only `run_status` working block when an active run has no public
  transcript blocks yet.
- Assign steering messages run-local transcript ordinals when they are sent into
  an active run.
- Link run items to transcript block IDs/ordinals.
- Keep output chunks streaming separately.
- Ensure run cancellation/failure completes or marks active blocks specifically.

### Phase 3: Backend Projection And Events

- Return ordered transcript blocks from message page loading.
- Page transcript blocks by block ordinal with bounded attached preview data.
- Replace or remove `chat.run_activity.updated` for transcript rendering.
- Add block created/updated and text delta events.
- Ensure event payloads are typed and generated.
- Keep detail/pagination endpoints keyed by source run item ID.
- Avoid full projection updates on assistant text deltas and every output chunk.

### Phase 4: Renderer Store

- Normalize blocks by ID.
- Apply block created/updated events by ID.
- Apply text deltas by transcript block ID.
- Sort by generated ordering keys.
- Derive adjacent activity groups from ordered `activity_item` blocks.
- Remove transcript rendering dependence on raw run items and
  `RunActivityGroupProjection`.
- Keep raw run items only for diagnostics or explicit detail surfaces.

### Phase 5: Renderer Components

- Replace turn/group rendering with block rendering.
- Build slim activity rows from `activity_item` blocks.
- Build mode-specific `reasoning` rendering for thinking and public summaries.
- Build lightweight derived activity group labels.
- Add hover/focus bulk expand/collapse controls.
- Preserve message action buttons, copy/retry affordances, timestamps, search
  highlighting, deep links, queued messages, steering messages, and active-run
  status behavior.
- Migrate the workspace-graph node-details activity feed
  (`features/workspace-graph/workflow-node-details-*`) off the removed
  `RunActivityPage.activity` / `RunActivityGroupProjection` to the block model or
  another explicit activity source. This on-graph surface consumes the same
  removed projection but is outside the chat-transcript component set, so it is a
  required, separately-tracked part of the clean cutover (not just a chat-panel
  change).

### Phase 6: Verification And Cleanup

- Verify unused outer Activity accordion code has already been removed from the
  transcript path; delete any remnants found.
- Verify obsolete transcript activity projection tests have already been removed
  or rewritten around block projection; delete any remnants found.
- Verify `Messages` and `RunItems` are absent from transcript-rendering paths
  unless they are needed for explicit detail surfaces; delete any remnants found.
- Verify old generated fields and renderer state are gone; delete any remnants
  found.
- Run the required chat workflow gates.

## Test Plan

Focused Go tests:

- assistant deltas create separate text blocks around run items
- text block ordinals are stable and monotonic
- run item updates mutate existing activity blocks
- output chunks do not create transcript blocks
- output first availability updates the activity block once
- public reasoning produces `reasoning(mode=summary)`
- private/hidden reasoning never exposes hidden text
- meaningful active reasoning produces `reasoning(mode=thinking)`
- a reasoning block can update from `mode=thinking` to `mode=summary` without
  changing block ID or kind
- private/generic reasoning produces no transcript block
- no-public-block active runs project a live-only working `run_status`
- the live-only working `run_status` is not persisted and is absent after reload
- steering messages receive run-local transcript ordinals and interleave with
  assistant/activity blocks
- provider-item text de-duplication still handles replay and false positives
- cancellation/failure marks active blocks correctly
- reload reconstructs the same block order from store
- block-aware pagination does not load unbounded blocks from a giant run
- hundreds of command blocks and many assistant text fragments keep mounted DOM
  bounded by virtualization

Renderer/store tests:

- block events upsert by ID and preserve order
- text deltas append to the right block
- stale events do not reorder blocks
- raw run item updates do not drive transcript rendering
- derived activity group labels and member IDs render correctly
- bulk expand/collapse affects only expandable rows in the group
- reasoning after assistant text renders as its own block
- reasoning mode updates keep the same block identity
- summary-mode collapsed row shows the reasoning headline; expanding reveals the
  full public summary
- live-only startup working status disappears when the first public block arrives
- summary mode superseding a non-tail thinking block renders collapsed and keeps
  the block's height stable
- private reasoning is absent
- public reasoning summary mode is collapsed/expanded correctly

Deterministic Electron E2E:

- open workspace
- create chat
- send message with text-command-text chronology
- send message with late reasoning and no tools
- send message with private startup delay before first public block
- send steering mid-run and verify it appears between adjacent run blocks
- send message with adjacent command group and bulk expand/collapse
- stream command output chunks and lazy-load output pages
- queue during active run
- steering during active run
- completion, cancellation, and failure
- reload and verify persisted block order
- verify DOM order matches backend block order and raw provider event order

Live Codex E2E:

- Run when local Codex CLI has ChatGPT auth.
- Do not use `OPENAI_API_KEY`.
- If ChatGPT auth is unavailable, skip narrowly and report the skip.
- Verify real Codex streams preserve text/activity/reasoning order and do not
  render empty accordions.

Final gates after implementation:

```sh
./scripts/go.sh test ./internal/chat
./scripts/go.sh run ./cmd/generate-contracts
./scripts/format.sh
node desktop/tests/electron/chat-workflows.test.mjs --deterministic-only --keep-artifacts
node desktop/tests/electron/chat-live-auth.mjs
node desktop/tests/electron/chat-workflows.test.mjs --live-only --keep-artifacts
./check_quality.sh --git-changes
```

## Acceptance Criteria

- The transcript visually matches provider chronology for assistant text,
  reasoning/status, and activity rows.
- There is no outer Activity accordion in the chronological transcript.
- Individual activity rows remain expandable when they have details or output.
- Every activity sequence has a very slim group slot above the first activity
  row, and adjacent activity rows can be bulk expanded/collapsed through its
  hover/focus control.
- Reasoning titles can appear after assistant text as chronological `reasoning`
  blocks.
- Public reasoning summaries appear only from public fields and use the same
  stable `reasoning` block kind as active thinking.
- Private/hidden reasoning never appears.
- Generic/private-only active thinking remains silent after public blocks exist.
- Before any public block exists, an active run shows a minimal live-only working
  indicator so the transcript does not look dead.
- Existing transcript blocks do not shift position or disappear from the middle
  after later blocks are emitted.
- Transcript history is paged by transcript block boundaries.
- Output pagination still works from source run item IDs.
- The renderer no longer infers displayability from raw run-item protocol.
- Activity grouping is derived only from ordered typed `activity_item` blocks,
  not from raw run items.
- Deterministic and live chat workflow tests cover the new behavior through the
  production Electron/main/preload/renderer/HTTP/store paths.

## Resolved Design Decisions

- Use one stable `reasoning` block kind with mode-specific presentation. Active
  thinking and public summaries are not separate discriminated-union kinds.
- In `mode: "summary"` the collapsed `reasoning` row keeps the same derived
  headline shown during `mode: "thinking"`; the full public summary is revealed on
  expand. The headline persists across the mode change.
- Derive the very slim activity group slot in the renderer from adjacent
  `activity_item` blocks. The slot exists above the first activity row from the
  start, so counts and bulk controls mutate in place instead of being inserted
  above already-visible rows.
- Keep generic/private-only thinking silent after public blocks exist. Before
  the first public block, show a minimal live-only working indicator. The
  `working` indicator is live-only `run_status` state and is never persisted as
  history; terminal `run_status` modes are permanent.
- Interleave steering messages by assigning them run-local transcript ordinals
  at ingestion time.
- Remove `Run.AssistantMessageID` from transcript rendering responsibility.
  Retain a non-rendering assistant envelope only if a concrete backend feature
  still requires one.
- Implement block-aware transcript pagination in the first chronological
  transcript slice.
