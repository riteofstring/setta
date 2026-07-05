# Workflow Agent Chat UX Plan

Date: 2026-07-05

## Scope

This plan covers the workflow-agent chat/run details UX issues observed in
`.recordings/20260705T191710Z` and `.recordings/20260705T192301Z`:

- duplicate `running` status chips in the workflow node run header
- missing model, reasoning, and permission visibility for workflow agent runs
- missing first-class permission configuration for workflow agent nodes
- generic `Model Reasoning` labels before a conversation is explicitly created
- composer draft loss when opening or applying the permission picker
- transcript scrolling that fights user attempts to move away from the bottom

This is a planning document only. It does not implement the changes.

## Compatibility Policy

Do not preserve old workflow-agent behavior for this work. The implementation
should make the new contracts and UX canonical immediately.

Specifically, do not add:

- backward compatibility paths
- legacy support
- migrations
- transitional adapters
- dual-read or dual-write behavior
- old-field aliases
- feature flags for the old UX
- silent fallbacks to previous workflow-agent settings behavior

If a backend-owned contract changes, update the owner-defined Go/httpapi
contract, regenerate TypeScript outputs, and update callers to the new shape.
Remove obsolete code instead of carrying it alongside the new path.

## Findings

The duplicate status chips are not a recording artifact. The run header renders
both the selected node status and the workflow execution status. In the observed
run both values were `running`, so the UI displayed two identical unlabeled
chips.

The workflow-agent composer does not render normal chat model or permission
controls. It is currently wired only for workflow-node steering, liveness retry,
and stop. Its session labels are placeholders, and the standard composer only
shows model/permission controls when corresponding actions are supplied.

The workflow action contract currently stores only `prompt`, `freshConversation`,
`model`, and `reasoningEffort` for Codex actions. There is no permission field
on an agent node. When model and reasoning are empty, the workflow-owned chat
falls back to chat defaults, but the run details UI does not receive or display
that resolved effective configuration as part of the workflow run snapshot.

In the latest recording, the chat pane initially had no selected conversation.
The backend returned an empty visible conversation list and no selected
conversation for the workspace. The composer therefore had no conversation
effective settings and fell back to generic labels. Clicking `New chat` created
and selected a conversation, after which effective settings were available and
the labels updated.

The draft loss is deterministic. Opening the permission picker clears the
composer draft, and applying a permission preset clears it again. The model
picker path has the same pattern. Button-driven settings changes should not
mutate unrelated draft text.

The scroll telemetry is sufficient to explain the sticky-bottom behavior. In the
latest recording, the transcript scroll controller was almost always in
`auto_follow` mode, while many upward wheel events near the bottom were followed
by programmatic scroll-to-latest decisions. User history-scroll intent was not
allowed to win consistently over pending auto-follow settle frames.

No additional logs are required for these diagnoses.

## Principles

Status should be scoped. A workflow node details pane is about the selected node,
so its primary status should be the selected node execution status. Workflow
execution status is useful context, but it should not compete as a duplicate
peer chip.

Run configuration should be explicit, visible, and immutable once a run starts.
The user should be able to inspect which model, reasoning effort, and permission
mode were used for an active or completed workflow agent run without inferring
from defaults, current app settings, or provider side effects.

Workflow agents need first-class permission configuration. A workflow can run
without a human watching each step, so permissions are part of the workflow
contract, not an incidental chat setting.

User drafts are valuable state. Opening menus, changing settings, confirming a
permission mode, or switching UI affordances must not discard typed text or
attachments unless the user explicitly submits that content or chooses a
destructive draft action.

Scroll follow must be subordinate to user intent. Auto-follow is useful while
the user is watching the tail, but any explicit history-scroll gesture should
cancel pending follow work and keep the transcript detached until the user
returns to the bottom or clicks jump-to-latest.

## Target UX

### Workflow Run Header

Show one primary status chip for the current node:

- `pending`
- `running`
- `waiting approval`
- `completed`
- `failed`
- `cancelled`

For the header, this is enough. The workflow execution status should move into
secondary metadata or the collapsible run details area. If the execution status
differs materially from the selected node status, show it as labeled text such
as `workflow running` or `workflow completed`, not as a second unlabeled chip.

### Run Settings Bar

Split the workflow-agent composer UI into two conceptual pieces:

1. A message input, visible only when steering is available.
2. A run settings bar, always visible for agent nodes with a backing run.

The settings bar should use the same visual language as the normal chat
composer controls, but disabled/read-only:

- permission mode: `Read Only`, `Ask for approval`, `Full Access`, or a custom
  profile display name
- model display name
- reasoning effort display name

For a running node, the bar can sit below the input area. For a completed node,
the input can disappear, but the bar remains attached at the bottom of the
trajectory pane or directly below the run header. The bar should not imply the
settings can be changed for a historical run.

The displayed values must come from the run snapshot, not from current global
defaults. Historical runs must remain inspectable even if defaults later change.

### Workflow Agent Permissions

Agent nodes should support explicit permission configuration. The durable model
should have an inheritance hierarchy:

1. node-level override
2. workflow-level default
3. workspace or app chat default

The UI should always display the resolved value and the source, for example:

- `Full Access - node override`
- `Ask for approval - workflow default`
- `Read Only - app default`

The run start path should resolve the effective model, reasoning effort, and
permission mode before launching the backing chat run, then persist that
effective configuration with the workflow/node execution snapshot. Changes to
defaults should affect future runs only.

Permission configuration should use backend-owned contract types and generated
TypeScript surfaces. Do not create renderer-only mirrors or stringly typed
permission constants. The owner boundary should remain the Go/httpapi contract.

The node editor should use the same preset vocabulary and confirmation semantics
as regular chat. Full access should remain an explicit choice with clear
danger/confirmation handling.

### Empty Chat Pane and New Chat Drafts

The chat pane should not render an enabled composer with generic `Model` /
`Reasoning` labels when no conversation is selected. Instead, it should render a
workspace-scoped draft chat context.

That draft context should:

- show effective default model, reasoning, and permission labels immediately
- preserve typed text and attachments
- allow model/reasoning/permission choices before the first message
- materialize a real conversation only when needed, such as on send or on a
  settings change that must be persisted to a conversation
- avoid creating empty persistent conversations just because the pane became
  visible

The sidebar may show a selected `New chat` draft row, but that row should be a
draft state until materialization. Users should not have to click `New chat`
just to hydrate composer settings.

### Draft Preservation

Opening a model or permission picker must preserve:

- text draft
- attachments
- caret/selection where practical
- focus
- prompt history browsing state unless the user explicitly accepts history text

Applying a model/reasoning/permission selection must also preserve the draft.
The command result message can appear in the transcript, but it should not clear
unsubmitted user text.

Slash-command behavior can remain distinct: if the user intentionally submits a
slash command draft, replacing or clearing that submitted command text is
reasonable. Button-driven pickers are not submitted user drafts and should not
reuse slash-command clearing semantics.

### Transcript Scroll Follow

Replace the current sticky-bottom behavior with a stricter state machine owned
by one controller. `react-virtuoso` should remain the transcript virtualizer and
measurement layer; the app controller should own follow/detach/programmatic
intent.

Core states:

- `following_bottom`: append, stream, resize, and tail-revision events may keep
  the transcript at the live edge.
- `free_scrolling`: append, stream, resize, and tail-revision events preserve
  the user's viewport and show a jump-to-latest affordance.
- `programmatic_to_latest`: a user-requested jump-to-latest is settling.
- `programmatic_to_message`: a search result, permalink, or explicit message
  jump is settling and should finish detached unless it lands at the bottom.

Prepend restoration can be a transient operation, but it should not be a
competing scroll authority. Older-history prepend remains a virtualizer-owned
operation coordinated through the same controller.

Rules:

- Any upward wheel event, keyboard history-scroll command, scrollbar drag upward,
  or touch/pointer history scroll immediately enters `free_scrolling` and
  cancels pending follow frames.
- Upward intent near the bottom still counts. The bottom epsilon should not
  override the user's direction or keep the controller in follow mode.
- Every scheduled scroll, including requestAnimationFrame follow work and
  programmatic settle work, must capture a generation token. User history intent
  increments the generation, and stale scheduled scrolls must no-op after
  rechecking the current generation and mode.
- Auto-follow resumes only when the user scrolls to the actual bottom, clicks
  jump-to-latest, sends a message with an explicit tail-follow action, or opens a
  different conversation/run.
- Streaming content and virtualized range changes must not reattach detached
  mode unless one of those explicit reattach events happens.
- Automatic streaming follow should use instant/auto scroll behavior, not
  repeatedly issued smooth scrolls. Smooth behavior is only appropriate for an
  explicit user command, such as jump-to-latest, and still must be cancelable by
  later user history intent.

The recording showed mostly `auto_follow` snapshots and very few
`user_detached` snapshots despite repeated upward wheel input. A correct design
should make the first deliberate upward gesture visibly detach.

### Scroller Simplification Direction

Use shadcn/ui `MessageScroller` and StackBlitz `use-stick-to-bottom` as design
references, not as an assumed drop-in replacement.

The repo's transcript is currently built on `react-virtuoso`, which provides
large-transcript virtualization and is already integrated with older-history
loading, search jumps, jump-to-latest, workflow trajectory rendering, and
recording/debug attributes. Replacing it with a plain DOM scroller would be a
larger transcript architecture change, not a small scrolling fix.

The recommended direction is to keep `react-virtuoso` as the only transcript
virtualizer and scroll measurement owner. Do not wrap Virtuoso in
`MessageScroller`, `use-stick-to-bottom`, or another bottom-lock controller. That
would create multiple scroll authorities over the same DOM and keep the class of
bugs we are trying to remove.

Simplify the existing scroll-follow hook around the same state model used by the
better external examples:

- `following_bottom`: append, stream, and resize events may pin to the live edge
- `free_scrolling`: append, stream, and resize events preserve the user's
  viewport

The important behavior to copy is that deliberate user history intent wins
immediately. Upward wheel input should release follow mode before the browser
has moved far enough to leave the bottom threshold. Pending programmatic
scroll-to-bottom frames should be canceled on that intent.

Virtuoso `followOutput` can be evaluated as part of the simplification, but it
must not become a second independent policy engine. It mainly covers item count
changes; streamed token output often changes the height of an existing row. The
controller still needs a governed path for `totalListHeightChanged`,
tail-revision, resize, range, and explicit `scrollToIndex` events. All of those
events should go through the same mode and generation checks before moving the
viewport.

The implementation should remove the current scattered scroll scheduling model:

- no independent "scroll to latest on every tail revision" effect outside the
  controller state machine
- no queued requestAnimationFrame scroll that can survive user history intent
- no content/range/resize handler that reattaches while the controller is
  `free_scrolling`
- no smooth streaming auto-follow loop

If a third-party scroller is still considered, require a short prototype against
the real transcript constraints before accepting it:

- virtualized transcript size comparable to existing worst cases
- prepend older history without visual jumps
- stream token/content growth without fighting upward scroll
- search and message jump behavior
- jump-to-latest affordance
- recorder/debug visibility for deterministic E2E assertions
- no `ResizeObserver` loop instability during streaming

If the prototype wins, replace the current controller outright. Do not keep the
old controller behind a feature flag or compatibility path.

## Contract Direction

Add an effective workflow-agent run settings object to the backend-owned
trajectory/read contracts. It should include display-ready values and stable raw
values:

- model id
- model display name
- reasoning effort raw value
- reasoning effort display name
- permission preset or profile id
- permission display label
- approval policy
- permissions profile id/string used for the provider
- source of each value: node, workflow, or default

The renderer should consume this object for display. It should not recompute
effective settings from current defaults.

Add permission configuration to the workflow Codex action configuration or to a
shared workflow-agent settings object owned by the orchestrator contract. Prefer
a structured object over additional loose strings if more than one setting is
being carried.

## Implementation Phases

1. Contract audit:
   - identify the minimal Go-owned workflow-agent settings contract
   - decide where node-level and workflow-level defaults live
   - define effective run settings in the trajectory/read response

2. Backend resolution:
   - resolve settings before workflow-agent run start
   - pass resolved model/reasoning/permission into the chat start path
   - persist the effective settings with the node execution/run snapshot

3. Workflow run UI:
   - collapse header status to one node-scoped status chip
   - render a disabled run settings bar for active and completed agent nodes
   - keep input visibility separate from settings visibility

4. Chat draft context:
   - introduce a workspace-scoped new-chat draft state
   - render effective defaults before a persistent conversation exists
   - materialize without losing draft text or attachments

5. Picker/draft behavior:
   - remove button-picker draft clearing
   - preserve drafts through picker open, confirmation, and selection
   - keep slash-command draft clearing scoped to actual slash submissions

6. Scroll follow:
   - keep `react-virtuoso` as the transcript virtualizer and measurement owner
   - use shadcn/ui `MessageScroller` and `use-stick-to-bottom` as references for
     state semantics, not as nested controllers
   - simplify the local controller to one following/free-scrolling/programmatic
     state machine
   - make history-scroll intent immediately cancel pending auto-follow through a
     generation token
   - route tail revision, resize, range, total-height, at-bottom, search jump,
     and jump-to-latest events through the same controller
   - add explicit reattach events
   - cover bottom-epsilon, queued-frame, and programmatic-settle edge cases

## Verification Plan

Because the eventual implementation touches chat behavior, workflow run
lifecycle, provider settings, event streaming, renderer chat state, and
transcript UI, it needs deterministic Electron end-to-end coverage through the
production main/preload/renderer/HTTP/store paths.

Focused tests should cover:

- one node status chip in the workflow node run header
- disabled settings bar visible for active and completed workflow agent runs
- workflow agent permission inheritance and effective run snapshot persistence
- no generic model/reasoning labels in a no-conversation chat pane
- draft and attachments preserved across model and permission picker flows
- upward scroll input detaches from auto-follow immediately, including near the
  bottom threshold and during pending programmatic settle frames

When the local Codex CLI is signed in with ChatGPT auth, run the live Codex E2E
tests as well. Do not use `OPENAI_API_KEY` for live-provider tests. If ChatGPT
auth is unavailable, record the live-provider skip and do not treat it as proof
of provider integration.

Before committing implementation changes, run `./scripts/format.sh` and
`./check_quality.sh --git-changes`. If contracts or generated inputs change,
regenerate affected outputs before cleanup and before final verification.

## Non-Goals

Do not add backward compatibility, legacy support, migrations, transitional
code, compatibility shims, dual-read/write paths, old-field aliases, or
renderer-only mirrors of backend settings constants.

Do not infer settings from visible transcript text, command labels, timestamps,
or current global defaults.

Do not add polling to keep the settings bar or scroll state fresh. Use typed
snapshots and event-driven updates.
