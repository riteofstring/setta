# Claude Python SDK migration plan

This plan replaces the Claude JS SDK sidecar with the Claude Python SDK for
`ExternalAgentToolType.claude_code`. Codex and OpenCode JS sidecars stay as-is.
No backward compatibility is required.

## Goals
- Use the Claude Python SDK directly from the backend (no Node sidecar).
- Preserve Setta's internal stream/event schema so the frontend stays stable.
- Keep tool approval/tool response behavior equivalent to the current Claude SDK
  integration.
- Make thinking blocks reliably available for tests when the model supports them.

## Non-goals
- Changes to Codex or OpenCode SDK integrations.
- Maintaining the old Node-based Claude SDK path.
- Redesigning the chat stream schema.

## Current state (baseline)
- `backend/setta/agentic/external_adapters/claude_sdk.py` spawns
  `claude_sdk_runner.mjs` which calls `@anthropic-ai/claude-agent-sdk`.
- The Node sidecar emits JSON lines which `_ClaudeSdkEventParser` converts into
  internal `LLMStreamingResponse` events.
- `external_agent_preflight.py` checks Node and npm packages for all SDK tools,
  including Claude.
- Tests require Node + the npm SDK package.

## Proposed architecture
- Replace the Node sidecar with a Python SDK client used directly inside
  `ClaudeSdkAdapter`.
- Keep `_ClaudeSdkEventParser` (or a slim replacement) that maps Python SDK
  stream events into existing `MessageStart/Delta/Stop`, `ToolCallDelta`,
  `ToolResultEvent`, and `MessageThinkingDelta` events.
- Store any SDK client/session objects in `ExternalAgentRunHandle.metadata`
  instead of a subprocess handle.

## Workstreams

### 1) Dependency and environment updates
- Add the Claude Python SDK package to `pyproject.toml` dependencies.
- Remove `@anthropic-ai/claude-agent-sdk` from
  `backend/setta/agentic/external_adapters/sidecars/package.json` and update the
  lockfile.
- Keep Node dependencies for Codex/OpenCode intact.
- Update docs/scripts that mention installing the Claude JS SDK.

### 2) Claude SDK adapter refactor (core)
- Replace subprocess launch in `ClaudeSdkAdapter.start_run` with a Python SDK
  client + streaming call.
- Decide on the integration mode:
  - Preferred: in-process async iterator from the Python SDK.
  - If the SDK is blocking, run it in a background task and forward events via
    an async queue.
- Store per-run objects in `ExternalAgentRunHandle.metadata`:
  - SDK client/session handle
  - Async task/queue for streaming
  - Approval/tool response state
- Update `cancel_run` to cancel tasks and close SDK sessions cleanly.

### 3) Stream/event mapping
- Map Python SDK stream events into the existing internal events used by
  `ExternalAgentRunner`.
- Ensure the mapping covers:
  - message_start / message_delta / message_stop
  - content_block_start/delta/stop for text, tool_use, tool_result
  - thinking blocks and thinking summaries
- Keep compatibility with existing UI expectations (e.g., `MessageThinkingContent`)
  and run metadata fields.

### 4) Tool approvals and tool responses
- Re-implement the approval flow using the Python SDK’s tool permission hooks
  (exact API to be confirmed).
- Maintain the ability to respond to approval requests and tool results via
  `send_approval_response` and `send_tool_response`.
- Preserve the existing `approvalPolicy` behavior (`allow`, `ask`, `deny`, `plan`).

### 5) Config + preflight changes
- Update `external_agent_preflight.py`:
  - For Claude, replace Node/npm checks with a Python package import/version check.
  - Decide whether the Claude CLI check is still needed; remove it if not required
    by the Python SDK.
- Decide how `commandPath` is interpreted for Claude:
  - Option A: repurpose to mean Python executable path.
  - Option B: ignore it for Claude and always use the active Python env.
- Update example configs and user-facing docs to match the new expectation.

### 6) Tests and fixtures
- Update `tests/agentic/test_claude_sdk_adapter_integration.py`:
  - Replace Node/npm checks with a Python SDK import/version check.
  - Ensure thinking blocks are requested and validated from Python SDK output.
- Add/adjust unit tests for event parsing if the Python SDK event schema differs.

### 7) Cleanup
- Remove `backend/setta/agentic/external_adapters/sidecars/claude_sdk_runner.mjs`.
- Remove any claude-specific JS sidecar scaffolding or references.
- Update `pyproject.toml` build artifacts if they include Claude sidecar paths
  that are no longer needed.

## Implementation sequence (suggested)
1) Confirm Python SDK API surface (streaming, tool use, thinking support).
2) Add Python dependency and preflight checks.
3) Implement adapter refactor + stream mapping in `claude_sdk.py`.
4) Update tests to use Python SDK and verify thinking blocks.
5) Remove JS sidecar and dependency cleanup.
6) Update docs/examples and run a full integration pass.

## Open questions
- Exact PyPI package name/version for the Claude Agent SDK (confirm before
  dependency change).
- Python SDK stream event schema parity with JS SDK (do we need a new parser?).
- How approvals/tool permissions are implemented in the Python SDK.
- Whether the Python SDK supports MCP config and how it is passed.
- Whether the Python SDK currently emits thinking blocks and if any flags are
  required to enable them.

## Risks
- Event schema divergence could require frontend changes if we can’t map to the
  existing structure.
- Missing thinking block support in the Python SDK could keep the current test
  failing until the SDK is updated.
- Tool permission/approval flow may differ and require UX changes.

## Validation checklist
- Claude runs produce streaming events with text, tool use, tool results, and
  thinking (when enabled) in the same internal format as before.
- `ExternalAgentRunner` can send approvals and tool responses successfully.
- Integration tests pass without Node/npm dependencies for Claude.
- Codex/OpenCode runs remain unchanged.
