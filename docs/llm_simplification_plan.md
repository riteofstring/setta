# LLM Stack Simplification Plan

## Goals
- Reduce duplicated representations (config/presets, tool results, stream state) so behavior is easier to reason about and test.
- Make failures and cancellations explicit to the frontend; avoid UI states that require manual refresh.
- Keep the Portkey-first flow intact while trimming scaffolding from the refactor spike.

## Progress
- Workstream 1 is implemented: config/preset hydration now uses preset IDs + overrides, `_merge_*` helpers are removed, and a shared validator enforces credentials + deep_think support for both the router and orchestrator.
- Workstream 2 is implemented: streaming now uses an explicit state machine (idle/streaming/completed/canceled/error), always emits a final completion/cancel/error event with finish/error reasons, and only persists at finish/cancel/error with an optional throttle for long streams.
- Workstream 3 is implemented: tool results now live solely inside `LLMToolResultBlock` message content; the dual storage map and websocket stripping are removed so the frontend derives results from messages.
- Workstream 4 is implemented: MCP client shutdown now honors a stop flag, uses logging instead of prints, and tool access is guarded when unavailable; frontend surfacing of MCP status remains optional.
- Workstream 5 is partially implemented: backend regression tests added for config hydration round-trips, stream state transitions (success/error), tool call/result handling, and MCP client shutdown lifecycle.

## Workstream 1: Config + Preset Model Unification
- Collapse the parallel dataclasses and Pydantic payload models into one canonical model shape with a single hydration path: `payload -> hydrate presets -> normalize -> persist`.
- Replace `_maybe_set`/`_merge_*` diff logic with explicit “persist overrides” serialization: store preset IDs plus user overrides; expand to full runtime objects when loading.
- Ensure preset/model lookup keys are consistent (preset_id vs model_id) and fail loudly on collisions.
- Add a small validation helper (public) used by both API and orchestrator to validate deep_think/model support and presence of credentials.

## Workstream 2: Chat Stream State + Error Flow
- Introduce a clear stream state machine (idle/streaming/completed/canceled/error) and emit a final event on any failure so the UI never waits indefinitely.
- Stop persisting every delta. Persist only on finish/cancel/error, with an optional coarse throttle for long streams if crash recovery is required.
- Make `/getLLMResponse` call only the public validator; drop private `_build_request_params` usage in the router.
- Include finish status in `ResponseCompletedEvent` (including error_reason/canceled) and persist that alongside the chat.

## Workstream 3: Tool Result Representation
- Pick a single source of truth for tool results. Recommendation: keep `LLMToolResultBlock` inside messages, and have the frontend derive the toolResults map on load/stream without server-side stripping.
- Delete `separate_tool_results`/dual storage and simplify the websocket payload handling accordingly.

## Workstream 4: MCP Client Lifecycle and Safety
- Make `MCPClient` stoppable: honor a shutdown flag in the retry loop, switch prints to logging, and ensure tools access is guarded when the client is unavailable in tests.
- Consider surfacing MCP connection status to the frontend for early visibility when tool calls will fail.

## Workstream 5: Tests and Fixtures
- Add focused tests for: config hydration/serialization round-trips with presets and overrides; stream state transitions (success, cancel, error); tool result handling after the single-source-of-truth change; MCP shutdown/retry behavior.
- Keep existing adapter tests; adjust fixtures to use the unified config model.

## Suggested Order of Execution
1) Config/preset unification + validator.  
2) Stream state/error event cleanup (with minimal persistence throttling).  
3) Tool result representation simplification.  
4) MCP client lifecycle fixes.  
5) Backfill/adjust tests.
