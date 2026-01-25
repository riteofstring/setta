# Codex app-server migration plan

This plan replaces the current Codex SDK integration with the Codex app-server
protocol. We will delete all Codex SDK code and move to the app-server
JSON-RPC stream over stdio.

## Goals
- Use Codex app-server for full-fidelity streaming, approvals, and item events.
- Remove all Codex SDK code paths, sidecars, and dependencies.
- Keep Setta's existing agent-run lifecycle and chat history model intact.
- Preserve Codex config file management via CODEX_HOME.

## Non-goals
- Backward compatibility with Codex SDK adapters or tests.
- Supporting both SDK and app-server in parallel.
- Building a full Codex configuration editor.

## External requirements (from Codex docs)
- `codex app-server` speaks JSON-RPC 2.0 over JSONL stdio. Requests use
  `method`, `params`, and `id`; notifications omit `id`. Initialization requires
  `initialize` followed by `initialized` before any other request is accepted.
- Threads and turns are driven via `thread/start` (or `thread/resume`) and
  `turn/start`, then we listen to `turn/*` and `item/*` notifications.
- Turn overrides include `model`, `effort`, `summary`, `approvalPolicy`,
  `sandboxPolicy`, `cwd`, and `outputSchema`.
- Items include `agentMessage`, `reasoning`, `commandExecution`, `fileChange`,
  `mcpToolCall`, `webSearch`, etc., with `item/started`, `item/completed`, and
  item deltas (`item/agentMessage/delta`, `item/reasoning/*`,
  `item/commandExecution/outputDelta`, `item/fileChange/outputDelta`).
- Approvals arrive as server-initiated JSON-RPC requests:
  `item/commandExecution/requestApproval` and `item/fileChange/requestApproval`.
  The client replies with `{ decision: "accept" | "decline" }` (and optional
  `acceptSettings` for command approvals).
- CLI config still governs defaults like `approval_policy` and `sandbox_mode`.
  App-server is a CLI subcommand and respects config/flags.

## Scope of removal (no backward compatibility)
- Delete `backend/setta/agentic/external_adapters/codex_sdk.py`.
- Delete the JS sidecar `backend/setta/agentic/external_adapters/sidecars/codex_sdk_runner.mjs`.
- Remove `@openai/codex-sdk` from `backend/setta/agentic/external_adapters/sidecars/package.json`
  and update `pnpm-lock.yaml` accordingly.
- Remove Codex SDK preflight checks and tests (unit + integration) that reference
  the SDK.

## New architecture

### 1) New adapter: `CodexAppServerAdapter`
- Implement a Python adapter that spawns `codex app-server` via
  `asyncio.create_subprocess_exec` and talks JSONL over stdin/stdout.
- Maintain per-chat server processes (one app-server per `chatId`) to preserve
  thread context and avoid mixing streams.
- Track per-process state:
  - `initialized` flag
  - `next_request_id`
  - `pending_requests` (request id -> Future)
  - `thread_id`
  - `stderr_lines` (for debugging)
- Store the app-server process in `ExternalAgentRunHandle.process` so we keep
  the same lifecycle as other CLI-backed adapters.

### 2) JSON-RPC handshake + request flow
- On process spawn:
  - Send `initialize` with clientInfo (e.g. `setta`, version string).
  - Await response; then send `initialized` notification.
- On run start:
  - If no existing thread, call `thread/start`.
  - If the run has a known `threadId`, call `thread/resume`.
  - Then call `turn/start` with input + per-turn overrides.
- Use request ids to correlate responses and errors.

### 3) Turn/start mapping to Setta config
Map Setta config + run inputs to app-server fields:
- `threadId`: from previous run outputs (Setta chat history).
- `input`: build from prompt + `messages` (user history), same as current SDK
  prompt builder.
- `cwd`: from `ExternalAgentConfig.workingDirStrategy`.
- `model`: from `config.defaultModel`.
- `effort`: from inputs (new optional key) or config default.
- `summary`: from inputs (new optional key) or config default.
- `approvalPolicy`: from `config.approvalPolicy` (see mapping note below).
- `sandboxPolicy`: from `config.sandboxPolicy`.
- `outputSchema`: from inputs (existing `outputSchema`).

Approval policy mapping note:
- App-server examples use `unlessTrusted`, while CLI/config uses
  `untrusted/on-request/on-failure/never`. We should map Setta values to
  app-server equivalents and document the mapping explicitly.

### 4) Event parsing and stream mapping
- Parse JSONL lines into either JSON-RPC responses or notifications.
- For notifications, normalize `method` to an event type (replace `/` with `.`)
  and pass into a new app-server event parser.
- Update the parser to handle the app-server item shapes:
  - `item/agentMessage/delta` -> `MessageDeltaEvent` with text
  - `item/reasoning/summaryTextDelta` and `item/reasoning/textDelta` ->
    `MessageThinkingDelta` (summary + thinking)
  - `item/started` and `item/completed` with `reasoning` items -> populate
    thinking blocks even if deltas are missing
  - `commandExecution` and `fileChange` items -> tool call + tool result
  - `mcpToolCall` items -> tool call + tool result
- Preserve existing message assembling logic in `apply_stream_delta`.

### 5) Approval request handling
- When an app-server approval request arrives, convert it into Setta's
  `approval_request` event and store mapping:
  - approval_id = JSON-RPC request id
  - include `toolName`, `command`, `diff`, or `parsedCmd` in the payload
- On `respond_to_approval`, send the JSON-RPC response:
  - `{ id, result: { decision: "accept" | "decline", acceptSettings? } }`.
- When the turn continues, expect `item/completed` to finalize the item status.

### 6) Error handling
- Handle `turn/completed` with `status: failed` as a failed run.
- Surface `error` payloads from app-server into `run_failed` with `cliStderr`
  fallback for debugging.

## Configuration + environment
- Keep current Codex settings file generation (`config.toml`) and
  `CODEX_HOME` wiring so app-server inherits the same policies.
- Replace SDK version preflight with CLI version checks (e.g., `codex --version`).
- Document that app-server is launched via `codex app-server`.

## Run mode decision
We will add a new explicit run mode: `app_server`.

Required changes:
- Extend `ExternalAgentRunMode` enum with `app_server`.
- Update validation, UI, and serialization to treat `app_server` as local CLI
  (no `baseUrl` requirement).
- Update preflight to check for `codex` CLI + app-server availability.
- Remove old Codex SDK preflight messages.

## Tests

### Replace SDK integration tests
- New integration tests for app-server:
  - stream message + threadId persistence
  - thread reuse across chats
  - outputSchema enforcement
  - commandExecution item -> tool call + tool result
  - reasoning/thinking blocks via `item/reasoning/*`
  - approval request flow for commandExecution and fileChange
- Remove all SDK-specific tests and sidecar checks.

### Parser unit tests
- Add unit tests for parsing app-server notifications:
  - `item/agentMessage/delta` -> text deltas
  - `item/reasoning/summaryTextDelta` -> thinking summary
  - `item/commandExecution/requestApproval` -> approval request
  - `item/fileChange/requestApproval` -> approval request
  - `item/completed` with `commandExecution` -> tool result

## Migration steps

1) **Scaffold new adapter**
   - Add `CodexAppServerAdapter` with JSON-RPC framing + request/response routing.
   - Implement initialize + thread/start/resume + turn/start flow.

2) **Event parser + approvals**
   - Implement app-server event parsing (items + deltas + approvals).
   - Wire approval responses to JSON-RPC replies.

3) **Plumb config + inputs**
   - Map Setta config into `turn/start` fields (`model`, `effort`, `summary`,
     `approvalPolicy`, `sandboxPolicy`, `cwd`, `outputSchema`).

4) **Delete Codex SDK code**
   - Remove Python SDK adapter, JS sidecar, and npm dependency.
   - Remove SDK-specific preflight checks.

5) **Update tests**
   - Replace `test_codex_sdk_adapter_integration.py` with app-server coverage.
   - Update unit tests to assert app-server event handling.

6) **Docs + cleanup**
   - Update developer docs to state Codex uses app-server.
   - Ensure `setta_files` cleanup instructions remain valid.

## Risks / mitigations
- **Protocol changes**: App-server docs note it is primarily for development and
  may change without notice. Mitigate by generating and pinning JSON schema for
  the Codex CLI version we ship against.
- **Approval policy mismatch**: Ensure explicit mapping between Setta policy
  values and app-server `approvalPolicy` values.
- **Tool item shape drift**: Keep parser tolerant and rely on `item/completed`
  as the authoritative final state.

## Open questions
- Which app-server `approvalPolicy` string maps 1:1 with Setta’s
  `approvalPolicy` values? (Docs show `unlessTrusted` while CLI uses `untrusted`.)
- Do we want to store a single source of truth for approval policy mappings,
  or keep it local to the Codex adapter?
- Do we want to add first-class support for `effort` + `summary` inputs in the UI,
  or keep them hidden until needed?
- Should we store the app-server JSON schema in-repo for version pinning?

## References
- https://developers.openai.com/codex/app-server
- https://developers.openai.com/codex/cli/reference
