# Workflow Node Trajectory Liveness and Details UI

Date: 2026-07-04

## Decision

Replace the metadata-first workflow node details surface with a trajectory-first
inspector. For agent nodes, the agent trajectory is the surface: one transcript
scroll area, one composer, and no nested chat viewer. Workflow run details move
into a compact full-width details dock attached directly below the workflow node
header. The dock uses the same collapsible affordance family as background
terminals and task lists, but it is pane chrome, not a transcript event.

Fix trajectory liveness by making workflow-node trajectory state event-driven.
The pane must not rely on clicking the node button again, remounting the pane, or
periodically re-reading the trajectory endpoint. A snapshot seeds the state, then
typed chat and workflow events update the scoped trajectory live.

No backward compatibility work is part of this plan. Do not add legacy aliases,
dual render paths, feature flags, migrations, compatibility shims, transitional
adapters, or polling fallbacks. If a contract changes, update the owner-defined
Go/httpapi contract and regenerate generated TypeScript surfaces. Remove the old
metadata-first implementation instead of keeping both.

## Evidence

The latest recording at `.recordings/20260705T052157Z` shows both issues:

- `05:23:04`: clicking `Line counter` opens the details pane and triggers two
  `workflow:read-node-trajectory` calls. The returned trajectory has only two
  blocks and no activity items.
- `05:23:14` through `05:24:46`: the backend forwards hundreds of chat stream
  events for the agent run, including transcript deltas, transcript block
  updates, run item events, and final run completion.
- No trajectory read happens during that stream. The next trajectory read is
  another `Line counter` click at `05:24:28`, which jumps to twenty blocks and
  twenty-five activity items. A later click at `05:24:49` jumps again to the
  completed trajectory.
- The screenshots show run metadata and node execution fields before the agent
  trajectory. The trajectory is framed inside the details page, which creates
  competing scroll surfaces and makes the most important content secondary.

The current code matches the recording. `useWorkflowRunInspection` in
`workflow-node-details-surface.tsx` reads execution, workflow events, and node
trajectory once when the target changes. It only reloads after explicit actions
such as approval, steering, liveness retry, or stop. It does not subscribe to the
chat or workflow event streams.

## Target UX

The run view for an agent node should be shaped like this:

1. A compact, fixed workflow header:
   - node label
   - node/run status
   - short run and version identifiers
   - stop/retry controls when available
2. A full-height `AgentTrajectorySurface` body:
   - the trajectory scroller is the only vertical scroll owner
   - transcript messages begin with the user prompt and agent work
   - the composer remains attached to the bottom when steering is available
   - no outer `overflow-auto` wrapper around the trajectory
3. A full-width `Workflow run details` dock attached below the workflow header:
   - collapsed by default unless the pane was opened from an activity focus that
     targets a detail row
   - contains run context, node execution, result, branch state, token flow, and
     workflow events
   - uses inspection UI data, not transcript block data
   - is visually attached to the top pane UI, not the trajectory
4. Subtle workflow styling:
   - use a workflow accent rail, status chip, or header tint to distinguish the
     pane from a normal chat
   - do not recolor every transcript bubble or make the transcript visually
     foreign

For non-agent nodes, keep a simple details view. The no-nested-scroll rule still
applies: one primary scroll container per pane.

## Liveness Design

Create a scoped workflow-node trajectory state owner. This may be a hook or a
store, but it must be keyed by the workflow node execution identity:

- `workspaceId`
- `executionId`
- `nodeExecutionId`
- `conversationId`
- `runId`

The selected main chat conversation must not control this state. Workflow agent
runs use their own backing conversations, so the global chat store only updating
the selected conversation is insufficient.

The state owner loads a snapshot from `ReadWorkflowNodeTrajectory`, then applies
events:

- chat events matching `workspaceId`, `conversationId`, and `runId`
- workflow events matching `workspaceId`, `executionId`, and the target
  `nodeId` or `nodeExecutionId`
- chat resync events or explicit workflow stream resync events by discarding
  incremental state and loading a fresh snapshot

Do not infer liveness from timestamps, DOM mutation, visible text, or activity
labels. Use typed event metadata and exact ids.

## Snapshot Cursors

The snapshot and event subscription need a deterministic race boundary. Add
explicit cursors to the backend-owned trajectory contract if the existing data is
not sufficient:

- the last included chat event stream id and sequence
- the last included workflow event ordinal or workflow event cursor

The renderer flow should be:

1. Subscribe to chat and workflow events.
2. Buffer events while the snapshot request is in flight.
3. Install the snapshot.
4. Replay only buffered events newer than the snapshot cursors and matching the
   resolved trajectory scope.
5. Apply future matching events live.
6. On a detected gap, resync notification, or unsupported stream change, reload
   the snapshot.

This avoids the common bug where subscribing after the snapshot misses events, or
subscribing before the snapshot double-applies events already included in the
page.

## Renderer State

Extract the reusable transcript/run event application logic from the main chat
store into a scope-neutral reducer. The current chat store can keep its selected
conversation policy, but the reusable reducer should be able to update any
trajectory state that supplies an explicit scope.

The scoped trajectory reducer should handle at least:

- `chat.transcript_block.created`
- `chat.transcript_block.updated`
- `chat.transcript_text.delta`
- `chat.transcript_blocks.replaced`
- `chat.run.updated`
- `chat.run_liveness.updated`
- `chat.run_item_output.delta`

Raw run-item created/updated events do not need to drive transcript rendering
unless the UI starts consuming `WorkflowAgentTrajectoryPage.items`. The visible
trajectory is block-driven today.

Use the existing stream-event batching pattern so token deltas do not cause one
React update per chunk. The batching must preserve cursor ordering and resync
behavior.

Workflow events should update the accordion state:

- append matching workflow events to the local event list
- coalesce `readExecution` refreshes for status/node execution changes
- coalesce graph projection refreshes when branch state can change
- avoid periodic refreshes

## UI Implementation

Delete the old run-details ordering that renders:

1. run context
2. node execution
3. result
4. agent trajectory
5. branch state
6. token flow
7. events

Replace it with:

1. workflow header
2. full-width details dock attached to the header
3. trajectory body containing transcript messages and activity groups

The accordion should be details pane chrome, not stored as transcript blocks and
not interleaved between prompt and response messages. The transcript data model
should continue to represent only chat/run transcript content.

Remove the fixed nested trajectory frame (`h-[36rem]`, bordered subpanel) from
the run view. The pane itself gives the trajectory its dimensions.

## Verification

Required focused checks:

- reducer tests for scoped trajectory event application, including buffered
  replay after a snapshot cursor
- tests that selected main-chat conversation changes do not affect an open
  workflow-node trajectory
- tests for resync/gap handling that reload a snapshot instead of silently
  continuing
- UI tests proving the run view has a single vertical scroll owner and no nested
  trajectory scrollbar
- component tests for the details accordion default state and activity-focus
  expansion behavior

Required end-to-end checks for the actual change:

- deterministic Electron workflow test through production
  main/preload/renderer/HTTP/store paths
- fake Codex/provider run that streams multiple transcript deltas after the node
  details pane is already open
- assertion that the trajectory text grows without another node click
- assertion that completion updates the status and composer state live
- restart/reload coverage if any persistence behavior changes

Because this touches chat behavior, workflow run lifecycle, event streaming,
renderer chat state, and transcript UI, run the relevant deterministic E2E app
workflow tests. If the local Codex CLI is signed in with ChatGPT auth, also run
the live Codex E2E tests. Do not use `OPENAI_API_KEY` for live tests. If ChatGPT
auth is unavailable, record that the live-provider tests were skipped and do not
treat the skip as provider-integration proof.

Before committing the implementation, run `./scripts/format.sh` and
`./check_quality.sh --git-changes`. If the implementation changes generated
contracts, regenerate them before cleanup and run the broader checks required by
the repository guidelines.

## Acceptance Criteria

- Opening workflow node details during an active agent run shows the trajectory
  as the primary pane content.
- The trajectory updates live while the agent works, without another click,
  remount, or manual refresh.
- The run status, liveness controls, and composer state update live.
- The pane has one vertical scroll owner for the trajectory view.
- Run/node/branch/event metadata is accessible through a full-width details dock
  attached to the top UI area.
- The old metadata-first nested trajectory layout no longer exists.
- There are no compatibility paths, feature flags, migrations, polling fallbacks,
  or legacy field aliases.
