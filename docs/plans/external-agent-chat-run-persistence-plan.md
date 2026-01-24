# External Agent Chat Run Persistence Plan

## Summary
Today, each external-agent chat send creates a new AgentRun and persists both
raw SDK events and streaming deltas to disk. This inflates
`setta_files/agent_runs/*.json` dramatically for short conversations. We want:
- one logical run per chat (reuse the same run ID),
- continued live streaming to the frontend,
- minimal persisted data (only what is needed to render chat history).

This plan proposes a run-as-conversation container for external agents, with
summary-only persistence and no stored streaming deltas.

## Goals
- One AgentRun per external-agent chat (per chatId + engineConfigId + projectConfigId).
- Continue streaming to the frontend in real time.
- Persist only what is necessary to render chat history:
  - conversation messages,
  - tool calls/results,
  - approvals/questions,
  - minimal metadata.
- Keep AskUserQuestion + approval flows intact.
- Preserve backward compatibility for existing run files.

## Non-goals
- Changing Claude SDK behavior or permission policies.
- Reworking the frontend streaming UI.
- Redesigning all run history UX; minor adjustments are OK.

## Current Behavior (Pain Points)
- ExternalAgentRunner.start_run always creates a new AgentRun per send.
- `_run_external_agent` records:
  - `external_event` (raw SDK events),
  - `stream_chunk` (token deltas + tool call deltas),
  which balloons run files.
- Chat history for external agents uses only the latest run; older runs are
  effectively redundant but still stored.

## Proposed Approach

### 1) One Run Per Chat (Reuse Run ID)
Treat the AgentRun as a conversation container:
- When a new external-agent send arrives, attempt to reuse an existing run
  that matches `(chatId, engineConfigId, projectConfigId)`.
- If no run exists, create one. Prefer using `chatId` as `run.id` when present
  to guarantee stable mapping. If that is too invasive, store the mapping in
  `run.outputs.metadata.chatRunId` and look it up explicitly.

Semantics:
- The run status flips `running` during active requests and `completed` when
  the turn finishes. `startedAt` remains the first request; `finishedAt` is
  updated after each turn.

### 2) Stream Live, Don’t Persist Streaming Deltas
We still emit streaming chunks to the frontend exactly as today, but:
- do not persist `external_event` (raw SDK events),
- do not persist `stream_chunk` deltas.

Instead, update `run.outputs.messages` at stable milestones so history can be
rendered without deltas.

### 3) Persist Summary-Only Run Events (Optional, Small)
To keep a minimal trace for debugging and approvals:
- keep `run_started` (only once, when the run is created),
- keep `approval_request` / `approval_response`,
- keep `tool_result`,
- keep `run_completed` / `run_failed` per turn.

No `external_event` or per-delta `stream_chunk` should be saved.

### 4) Maintain a Lightweight In-Memory Chat State
Use in-memory chat state during streaming so we can persist outputs without
recording deltas:
- On start of a turn, initialize a ChatSectionState from:
  - `run.outputs.messages` if present,
  - else `inputs.messages` (first turn).
- As streaming chunks arrive, apply them to the in-memory state.
- On `message_finalized` and `tool_result`, persist:
  - `run.outputs.messages` (full conversation so far),
  - `run.outputs.finalText`,
  - `run.outputs.metadata` (model/toolType/sessionId/etc.).

This keeps history accurate even without stored deltas.

### 5) Update Chat History Reconstruction
`build_chat_state_from_run` should prefer `outputs.messages` (as now), and set
`waiting_for_response` based on run.status even when outputs exist.
Fallback to stream-chunk reconstruction only for older runs that lack outputs.

### 6) UI Considerations
The Run Trace pane currently derives details from `run.events` and
`stream_chunk` payloads. With summary-only persistence, run trace will be
shorter. We should:
- update trace rendering to gracefully handle missing stream chunks,
- optionally add a message like “Detailed streaming trace not recorded.”

## Data Model & API Changes
- Allow creating an AgentRun with a known ID (chatId) or store a chat-run
  mapping in `outputs.metadata`.
- Add or reuse a small “event log policy” concept inside ExternalAgentRunner:
  `full` (current), `summary` (proposed), `none` (optional).
- No schema changes required for frontend chat messages.

## Backend Changes (Proposed)
1) ExternalAgentRunner
   - Add helper: find or create chat run by `(chatId, engineConfigId, projectConfigId)`.
   - Reuse run.id across sends; update status per turn.
   - Add in-memory chat state per run.
   - Persist outputs on `message_finalized` and `tool_result`.
   - Gate `_record_event` to skip `external_event` and `stream_chunk`.

2) Chat view
   - `build_chat_state_from_run`: if `outputs.messages` present, return them
     with `waiting_for_response = (run.status == running)`.

3) Routers
   - No API changes, but internal chat run lookup should use the reused run.

4) History UI
   - Adjust run trace rendering for summary-only events.

## Testing Plan
- New tests:
  - Reuse run ID for the same external chat across multiple sends.
  - No `external_event` / `stream_chunk` persisted for new runs.
  - `outputs.messages` is updated on message finalized + tool results.
  - `waiting_for_response` respects run.status when outputs exist.
- Regression tests:
  - Existing run files (with stream chunks) still render in history.

## Migration / Rollout
- No migration required; older runs still work via stream-chunk fallback.
- New runs are much smaller.
- Optionally provide a cleanup script for `setta_files/agent_runs` to remove
  legacy heavy runs.

## Open Questions
- Should run trace be disabled or just shortened for external chats?
- Do we want a runtime flag to toggle full vs summary event persistence?
- Is “run.id == chatId” acceptable everywhere, or should we store an explicit
  mapping to avoid coupling?
