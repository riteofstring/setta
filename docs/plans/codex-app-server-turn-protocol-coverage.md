# Codex App-Server Turn Protocol Coverage Plan

## Goal

Setta should handle every Codex app-server event that can appear during a normal
Codex turn, so users can stay in the Setta chat interface without falling back to
the Codex TUI for routine work.

The immediate objective is not full app-server feature parity. The objective is
runtime protocol parity for active turns: no normal Codex run should fail,
dead-end, or hide important activity because Setta does not understand a
server request or notification.

This work should also preserve Setta's long-term harness direction. Codex is the
first concrete adapter, but Setta should eventually support Claude Code,
OpenCode, OpenHands, and other agent runtimes through the same product-facing
runtime model.

## Success Criteria

- Every Codex app-server server request that can arrive during a turn is handled
  with a deterministic response path.
- Every Codex app-server notification that can arrive during a turn is handled,
  represented, or intentionally ignored with an explicit policy.
- Unsupported future protocol drift still fails loudly with provider diagnostics.
- Known trace-only notifications do not kill otherwise healthy runs.
- The renderer can show or summarize the important activity behind command,
  process, hook, file-change, MCP, approval-review, reasoning, and request
  resolution events.
- Deterministic app workflow tests exercise the affected paths through
  Electron/main/preload/renderer/HTTP/store boundaries.
- Live Codex E2E tests run when `.env` contains `OPENAI_API_KEY`; skips are
  explicit when credentials are absent.

## Current Setta Support

Setta currently starts a fresh stdio app-server process per turn and supports the
core chat loop:

- Client calls:
  - `initialize`
  - `thread/start`
  - `thread/resume`
  - `turn/start`
  - `turn/steer`
  - `turn/interrupt`
  - `model/list`
  - `thread/settings/update`
  - `thread/goal/get`
  - `thread/goal/set`
  - `thread/goal/clear`
- Server requests:
  - `item/commandExecution/requestApproval`
  - `item/fileChange/requestApproval`
  - `item/permissions/requestApproval`
  - `item/tool/requestUserInput`
- Notifications:
  - core thread, turn, item, assistant text, command output, file patch, MCP
    progress, goal, model reroute, notices, account, and token usage events.

The turn loop currently treats unknown server requests and notifications as
provider drift. That is correct for unknown protocol, but it means newly known
Codex events can fail normal runs until Setta adds explicit support.

## In Scope

This plan covers turn-critical app-server protocol support:

- Server-initiated requests that require a response.
- Notifications that occur during normal runs.
- Backend state, run items, traces, diagnostics, approvals, and renderer
  presentation needed for those requests and notifications.
- Tests that exercise production app boundaries.
- Harness-neutral core concepts where Codex exposes behavior that future
  harnesses are likely to share.

## Out Of Scope

These are important for broader TUI parity, but should be planned separately:

- Full thread list/search/read/fork/archive/rollback/compact UX.
- Rich composer input such as images, mentions, skills, and attached context.
- Full account/config/plugin/marketplace/settings administration.
- Full MCP management UI.
- Realtime voice UX.
- Daemon, websocket, and proxy transport support.

## Compatibility Policy

Do not add backward compatibility, legacy protocol support, migrations,
transitional adapters, dual-read/write paths, old-field aliases, or compatibility
shims as part of this work.

Setta should target the current supported Codex app-server protocol for each
implementation pass. If Codex removes or replaces a method, remove or replace
Setta's corresponding adapter code instead of preserving old behavior. Durable
Setta product contracts should remain harness-neutral, but Codex adapter code
does not need to keep compatibility with older Codex releases.

## Protocol Baseline

Use `codex-cli 0.135.0` as the first implementation baseline, generated with:

```sh
codex app-server generate-ts --experimental --out <tmpdir>
```

Do not check in generated Codex protocol files. The source of truth remains the
Codex app-server protocol and Setta's explicit Go handlers.

Do not add a generator drift test that only reruns Codex generation and compares
artifacts. Instead, maintain an explicit support matrix in normal source and
exercise every supported request/notification with fixtures and app workflow
tests.

## Unsupported Turn-Critical Requests

Implement explicit handlers for:

- `item/tool/call`
- `mcpServer/elicitation/request`
- `account/chatgptAuthTokens/refresh`
- `attestation/generate`

### Request Handling Policy

Every server request must resolve exactly once:

- Accept and return the protocol response when Setta can complete the action.
- Decline or cancel with the protocol's expected shape when the user rejects or
  cancels.
- Return a specific JSON-RPC error when the request is impossible in the current
  Setta configuration.
- Persist enough run activity that the user can understand what happened.
- Clear pending approval/input state when the server reports resolution or when
  Setta sends the response.

Generic catch-all success responses are not acceptable. Unknown requests remain
provider drift.

## Request Implementation Plan

### 1. MCP Elicitation

Support `mcpServer/elicitation/request` for both modes:

- `form`
- `url`

Backend work:

- Add a typed elicitation path instead of squeezing arbitrary schema data into
  flat option strings.
- Persist elicitation metadata on the pending approval/input record.
- Preserve `serverName`, `threadId`, nullable `turnId`, mode, message, schema,
  URL, elicitation id, and `_meta`.
- Respond with `action`, `content`, and `_meta`.

Renderer work:

- Render form-mode fields from the MCP elicitation schema.
- Render URL-mode as an external action with accept/decline/cancel controls.
- Keep all submitted values structured, not stringified.

Testing:

- Deterministic app workflow test for form-mode accept.
- Deterministic app workflow test for form-mode cancel.
- Deterministic app workflow test for URL-mode decline.

### 2. Dynamic Tool Calls

Support `item/tool/call`.

Initial policy:

- Do not advertise dynamic tools until Setta has a real tool registry for them.
- If Codex sends a dynamic tool call anyway, create a run item and return a
  specific unsupported-tool error to the provider.
- When Setta later advertises dynamic tools, route calls through a typed backend
  registry and return protocol-shaped content items.

Backend work:

- Add a dynamic tool dispatcher with explicit registered tool names.
- Persist namespace, tool, arguments, call id, status, content items, success,
  duration, and error.
- Keep unknown tools as explicit errors, not silent no-ops.

Testing:

- Unit fixture for unknown dynamic tool request.
- Deterministic app workflow test for a fake registered dynamic tool once a
  registry exists.

### 3. ChatGPT Auth Token Refresh

Support `account/chatgptAuthTokens/refresh`.

Initial policy:

- For API-key-only flows, this should normally not occur.
- If Setta does not manage ChatGPT auth tokens, return a specific auth
  unavailable error and surface a user-visible account diagnostic.
- Once Setta has account management, refresh and return `accessToken`,
  `chatgptAccountId`, and `chatgptPlanType`.

Backend work:

- Send `requestAttestation: false` explicitly during `initialize` until
  attestation is implemented.
- Add an account capability boundary so the harness can distinguish API key,
  ChatGPT auth, and unavailable auth modes.
- Persist an actionable diagnostic when refresh is required but unavailable.

Testing:

- Protocol fixture for unavailable refresh.
- Live test only when a managed ChatGPT auth path exists.

### 4. Attestation

Support `attestation/generate` only after Setta has a real attestation provider.

Initial policy:

- Do not opt into attestation requests until implemented.
- If a request arrives unexpectedly, return a specific attestation unavailable
  error and emit provider diagnostics.

Implementation work:

- Add a small attestation provider interface.
- Wire platform-specific token generation behind that interface.
- Enable `requestAttestation` only when the provider is configured.

Testing:

- Unit fixture for unavailable attestation.
- Unit fixture for a fake attestation provider returning a token.

## Unsupported Notifications

Add explicit handlers or explicit ignore policies for the currently unsupported
notifications:

- `account/login/completed`
- `app/list/updated`
- `command/exec/outputDelta`
- `externalAgentConfig/import/completed`
- `fs/changed`
- `fuzzyFileSearch/sessionCompleted`
- `fuzzyFileSearch/sessionUpdated`
- `hook/completed`
- `hook/started`
- `item/autoApprovalReview/completed`
- `item/autoApprovalReview/started`
- `item/fileChange/outputDelta`
- `item/reasoning/textDelta`
- `mcpServer/oauthLogin/completed`
- `model/verification`
- `process/exited`
- `process/outputDelta`
- `serverRequest/resolved`
- `skills/changed`
- `thread/realtime/closed`
- `thread/realtime/error`
- `thread/realtime/itemAdded`
- `thread/realtime/outputAudio/delta`
- `thread/realtime/sdp`
- `thread/realtime/started`
- `thread/realtime/transcript/delta`
- `thread/realtime/transcript/done`
- `windows/worldWritableWarning`
- `windowsSandbox/setupCompleted`

## Notification Implementation Plan

### 1. Classify Notification Policies

Add an explicit policy for every known app-server notification:

- `turn_state`: updates run items, output, approvals, assistant text, or turn
  completion.
- `thread_state`: updates thread refs, thread settings, names, token usage, or
  lifecycle.
- `global_state`: account, config, MCP status, filesystem, app, skill, or
  external configuration changes.
- `trace_only`: useful to show in the run trace but not required for core state.
- `capability_ignored`: known notifications for disabled capabilities such as
  realtime voice or Windows sandbox support.

Unknown notifications remain provider drift.

### 2. Output And Process Events

Handle:

- `command/exec/outputDelta`
- `process/outputDelta`
- `process/exited`
- `item/fileChange/outputDelta`

Backend work:

- Normalize output streams into `RunItemOutput`.
- Associate process output with the correct run item by item id, process id, or
  explicit notification fields from the protocol.
- Mark process-backed items complete or failed on exit.
- Preserve stream names and exit status.

Renderer work:

- Show these outputs in the existing run activity/transcript surfaces.
- Avoid unbounded DOM growth by relying on existing output pagination and
  transcript virtualization.

### 3. Reasoning Text Delta

Handle `item/reasoning/textDelta`.

Backend work:

- Store it separately from summary deltas if Codex distinguishes full reasoning
  text from summaries.
- If product policy says full reasoning text should not be displayed, trace that
  the delta occurred without exposing hidden content.

Renderer work:

- Show summary deltas as today.
- Follow product policy for full reasoning text.

### 4. Hook Events

Handle:

- `hook/started`
- `hook/completed`

Backend work:

- Create run items or trace entries for hook executions.
- Preserve hook name, scope, status, output summary, error info, and timing.
- Do not treat failed hooks as turn failure unless Codex reports the turn as
  failed or the hook notification is explicitly fatal.

Renderer work:

- Show hook activity in run details without interrupting chat flow.

### 5. Auto-Approval Review Events

Handle:

- `item/autoApprovalReview/started`
- `item/autoApprovalReview/completed`

Backend work:

- Create trace entries linked to the reviewed item when available.
- Preserve review id, action, decision source, timing, and review payload.
- Do not duplicate user approval prompts; these are review activity, not user
  requests.

Renderer work:

- Surface auto-review state in the run activity timeline.

### 6. Request Resolution

Handle `serverRequest/resolved`.

Backend work:

- Match by request id and thread id.
- Clear any still-pending local approval/input state.
- Emit an approval/input resolved trace if Setta did not already record one.
- If the request id is unknown, emit a non-fatal diagnostic with context.

### 7. Global And Capability Notifications

Handle as trace, diagnostic, or state updates:

- `account/login/completed`
- `app/list/updated`
- `externalAgentConfig/import/completed`
- `fs/changed`
- `fuzzyFileSearch/sessionCompleted`
- `fuzzyFileSearch/sessionUpdated`
- `mcpServer/oauthLogin/completed`
- `model/verification`
- `skills/changed`
- `windows/worldWritableWarning`
- `windowsSandbox/setupCompleted`

For notifications tied to features Setta has not enabled, prefer
`capability_ignored` with a trace or diagnostic over failing an active run.

### 8. Realtime Notifications

Handle realtime notifications as disabled-capability events until Setta has a
voice/realtime UX:

- `thread/realtime/started`
- `thread/realtime/itemAdded`
- `thread/realtime/transcript/delta`
- `thread/realtime/transcript/done`
- `thread/realtime/outputAudio/delta`
- `thread/realtime/sdp`
- `thread/realtime/error`
- `thread/realtime/closed`

If Setta did not call `thread/realtime/start`, these notifications should be
diagnosed as unexpected but should not automatically corrupt the active text
turn state. Once realtime is implemented, move them to functional handlers.

## Backend Design

### Harness Boundary

Codex app-server method names, payload shapes, enum values, and protocol quirks
must stay inside the Codex harness adapter unless they are stored only as bounded
provider debug context.

Setta core should own stable agent-runtime concepts:

- `AgentRequest`: approval, structured input, auth refresh, tool call,
  attestation, or other provider request requiring Setta action.
- `AgentEvent`: assistant message delta, tool output, process output, file
  change, hook activity, diagnostic, or turn completion.
- `AgentCapability`: tools, MCP, images, realtime, approvals, reasoning,
  filesystem, process output, auth, or attestation.
- `AgentTool`: one Setta-owned tool definition that can be exposed through Codex
  dynamic tools, Setta MCP, future Claude/OpenCode/OpenHands adapters, and
  workflow runners.
- `ProviderPayload`: bounded raw provider context for debugging and drift
  diagnostics, not for normal product logic.

Avoid durable core fields such as `CodexRequestID`,
`CodexNotificationMethod`, or app-server-specific statuses outside the Codex
harness package. Prefer generic ids and statuses, with provider-specific fields
kept in adapter-owned metadata.

### Protocol Coverage Registry

Introduce one authoritative Go-owned registry for Codex app-server protocol
coverage:

- Supported client methods Setta calls.
- Supported server requests and their response handler.
- Supported notifications and their scope/policy.
- Known disabled-capability notifications.

Keep this in the Codex harness package, not in generated TypeScript or scattered
renderer constants.

### Request Lifecycle

Model server requests separately from approvals where needed:

- Approval requests remain approvals.
- User-input and elicitation requests become structured input requests.
- Dynamic tool calls become tool call run items.
- Auth and attestation requests become service capability requests.

The existing approval model can be reused for simple yes/no decisions, but MCP
elicitation and dynamic tools need structured payloads.

The Setta-facing request model should be provider-neutral. For example, Codex
`mcpServer/elicitation/request`, a future Claude human-input request, and an
OpenHands browser-login prompt should all be able to map into the same
structured input request type.

### Shared Tool Registry

Dynamic tools should not become a Codex-only feature. Codex calls this protocol
path `item/tool/call`, but the product concept is "an agent can ask Setta to do
something through a typed Setta tool."

Create a shared Setta tool registry with:

- stable tool names
- typed input schemas
- typed output schemas
- permission requirements
- audit/run item metadata
- backend handlers

Adapters can expose the same registry through their native mechanism:

- Codex app-server dynamic tools
- Setta MCP server tools
- future Claude/OpenCode/OpenHands tool APIs
- Setta workflow/state-machine action nodes

For example, a future `setta.openDiff` tool should have one Setta-owned handler
and contract. Codex, Claude Code, or a workflow runner should not each get a
separate implementation.

### Provider Account Management

Setta should own provider account management at the product level. Codex
`account/chatgptAuthTokens/refresh` is the first concrete case, but the core
model should be provider-neutral:

- Codex / ChatGPT auth
- Anthropic / Claude auth
- local model provider credentials
- GitHub or cloud-service auth used by agent tools

Provider-specific token formats and refresh behavior should stay in provider
adapters. User-facing account state, diagnostics, and reauthentication flows
should live in Setta settings/account surfaces.

### Reasoning Policy

Full reasoning text handling should be a harness policy, not a Codex-specific
assumption. Some providers may expose no reasoning, some may expose summaries,
and some may expose private reasoning text with retention or display limits.

Store full reasoning text deltas only where provider terms and product policy
allow it, keep them hidden from normal chat UI, and expose summaries or
diagnostic/audit views separately.

### Run Item Coverage

Extend `RunItem` only where the existing fields cannot accurately represent
new activity. If Go-owned contracts change, regenerate backend TypeScript
contracts before finishing implementation work.

Candidate additions:

- `Namespace`
- `ProcessID`
- `ReviewID`
- `RequestID`
- structured JSON details for tool arguments/results, if the renderer needs
  more than text summaries.

Avoid stringifying large structured objects unless they are explicitly display
summaries. Store structured values when they are part of the product contract.

### Error Policy

Use three distinct failure modes:

- Provider drift: unknown method, unsupported enum, malformed known payload.
- Capability unavailable: known method for a feature Setta intentionally has not
  enabled or configured.
- User denied/cancelled: normal product decision.

Only provider drift should force a resync-required diagnostic by default.

## Renderer Design

The renderer should make new protocol activity visible without turning the chat
surface into raw logs:

- Keep the transcript focused on user and assistant messages.
- Put command/process/hook/file/tool/review activity in the run activity
  timeline.
- Use existing output pagination for large streams.
- Add structured approval/input forms only for active requests requiring user
  action.
- Keep disabled-capability diagnostics actionable but quiet.

## Implementation Phases

### Phase 1: Coverage Registry And Fixtures

- Add the explicit server request registry.
- Add the explicit notification policy registry.
- Add unit fixtures for every currently known unsupported request and
  notification.
- For trace-only and disabled-capability notifications, verify they do not fail
  a turn.
- For malformed known payloads, verify provider drift still fails loudly.

### Phase 2: Request Responses

- Implement MCP elicitation request persistence and UI.
- Implement dynamic tool call dispatch with unknown-tool errors.
- Implement auth refresh unavailable handling.
- Implement attestation unavailable handling and provider interface.
- Add deterministic app workflow coverage for approvals, elicitation, and
  dynamic tool behavior.

### Phase 3: Output, Hook, Review, And Resolution Notifications

- Implement output/process/file-change output handlers.
- Implement hook handlers.
- Implement auto-approval review handlers.
- Implement `serverRequest/resolved`.
- Add renderer coverage for run activity display.
- Add deterministic app workflow tests for streaming output, hook traces,
  auto-review traces, and request cleanup.

### Phase 4: Global And Disabled-Capability Notifications

- Implement global trace/state handlers.
- Implement disabled realtime and Windows notification policies.
- Verify unexpected disabled-capability notifications produce clear diagnostics
  without crashing normal text turns.

### Phase 5: Live Codex Verification

When `OPENAI_API_KEY` is present in `.env`, run live workflows that cover:

- Normal command execution output.
- File edits and patch approval.
- Permission approval.
- User input request.
- MCP startup/progress plus elicitation, if a deterministic MCP server fixture
  is available.
- Model verification or reroute, when practical to trigger.

Skipped live-provider tests must explicitly say credentials or external
capability were absent.

## Verification Commands

For implementation commits touching this area:

```sh
./scripts/format.sh
./scripts/test_chat_workflows.sh
./check_quality.sh --all
```

Run live-provider workflow coverage through `./scripts/test_chat_workflows.sh`
when `.env` contains `OPENAI_API_KEY`.

If changes touch dependency manifests, lockfiles, package manager config, Go
module config, or supply-chain tooling, also run:

```sh
./scripts/check_supply_chain.sh
```

## Settled Decisions

- MCP elicitation should be represented as a structured request type distinct
  from approval. For example, a deployment MCP server asking for `{target:
  "staging" | "production", confirm: boolean}` should remain structured data
  instead of being flattened into approval text.
- Dynamic tools should live in a shared Setta tool registry usable by future
  harnesses, not in a Codex-only registry. For example, a future
  `setta.openDiff` tool should be callable by Codex, a future Claude harness,
  or a Setta workflow runner through the same backend contract.
- Full reasoning text deltas should be stored but hidden from normal chat UI.
  For example, `item/reasoning/textDelta` can be preserved for debugging or
  audit surfaces without displaying private model reasoning in the transcript,
  subject to provider policy.
- Setta should own provider account management. For example, if Codex asks for
  `account/chatgptAuthTokens/refresh`, Setta settings/account state should
  refresh and return the token rather than sending the user back to the Codex
  CLI. The same product pattern should later cover Claude, OpenCode, OpenHands,
  and tool-service auth where applicable.
- Disabled-capability notifications should use severity tiers. Background
  inventory updates such as `skills/changed` and `app/list/updated` should be
  quiet traces. Unexpected but non-blocking disabled-feature events, such as
  realtime notifications during a text-only run, should become run diagnostics.
  Security or user-action issues, such as `windows/worldWritableWarning`, should
  be visible warnings.
