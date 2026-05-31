# Codex Harness Protocol Alignment Plan

Setta's Codex chat integration is directionally correct: the backend talks to
the Codex app-server over JSON-RPC, starts and resumes threads through the
app-server, starts turns through `turn/start`, and uses the Codex goal, model,
and thread settings APIs.

The main gap is that Setta hand-maintains a sizable mirror of the Codex
app-server protocol in Go. That mirror includes method names, notification
names, notification scope policy, enum values, partial response shapes, and
slash-command semantics. The biggest improvement is to replace those manual
mirrors with a generated or schema-driven Codex protocol boundary in the Go
backend, then use that boundary to tighten `/goal` and `/model` behavior.

## Goals

- Generate the Codex app-server protocol surfaces Setta consumes instead of
  maintaining scattered hand-written mirrors.
- Make Codex protocol generation genuinely programmatic: derive methods,
  notifications, and referenced types from upstream schema roots instead of
  hard-coding endpoint, method, notification, or type lists in the generator.
- Keep Setta's renderer contracts Go-owned and generated from Setta's backend
  contracts. Do not import Codex-generated TypeScript directly into the
  renderer.
- Preserve Setta's harness abstraction so future non-Codex harnesses are not
  forced to expose Codex-specific types.
- Align `/goal` behavior with Codex where Setta presents a Codex-compatible
  command.
- Make Setta-specific `/model` picker actions explicit product API, not
  accidental slash-parser coupling.
- Preserve Setta's goal auto-continuation behavior for goal set and resume as an
  explicit Setta product policy.
- Improve model catalog handling so Setta does not silently miss paginated
  models or discard metadata needed for richer UX.
- Keep the implementation fail-loud on real protocol drift, but avoid
  user-visible failures when Codex acknowledges an experimental best-effort
  settings update.

## Non-Goals

- Do not replace Setta's Go backend with Codex's Rust app-server client.
- Do not make the Electron renderer depend on Codex's generated TypeScript
  schema as its durable app contract.
- Do not add compatibility shims for old Setta data unless a concrete migration
  need is identified and approved.
- Do not add a broad Codex SDK wrapper for APIs Setta does not use.
- Do not move protocol drift into the generator by writing lists such as
  `endpoints = [...]`, `methods = [...]`, `notifications = [...]`, or
  `types = [...]` that must be manually kept in sync with Codex.
- Do not implicitly write ordinary Setta model picker choices into the user's
  Codex global config.
- Do not expose goal token budget controls in the first goal editor pass.

## Decisions

- Preserve auto-continuation after `/goal <objective>` and `/goal resume`.
  Treat this as Setta-specific workflow behavior, not Codex TUI parity.
- Do not auto-continue for `/goal`, `/goal edit`, `/goal pause`, or
  `/goal clear`.
- Hide hidden Codex models from the normal picker by default.
- Generate and carry goal token budget fields at the protocol boundary, but keep
  token budget controls out of the initial UI.
- Persist model and reasoning effort choices per Setta conversation. Add any
  future Codex global default write as an explicit settings action, not as a
  side effect of the chat picker.
- Normal protocol generation reads from a checked-in Setta schema snapshot, not
  from a live Codex app-server process and not from the network.
- A separate explicit refresh step updates that snapshot from a local Codex repo
  checkout at a pinned upstream commit.
- The Codex protocol generator must start from stable upstream roots, such as
  `ClientRequest` and `ServerNotification`, then walk schema references or
  imports transitively. A small list of root schema files is acceptable; a
  hand-maintained list of protocol members is not.

## Current Findings To Address

- `/goal edit` currently becomes a new goal objective of `edit`; Codex treats it
  as a control command that opens the goal editor.
- `/goal <objective>` uses the right `thread/goal/set` RPC but lacks Codex's
  objective length validation, replacement confirmation, and token budget path.
- `/goal pause` and `/goal resume` call `thread/goal/set` with only status; this
  is the right RPC shape, but the UI should handle the no-existing-goal failure
  as a specific command error.
- `/model <id>` and `/model effort <level>` are Setta-specific internal commands.
  Codex's public slash command is bare `/model`, which opens a picker.
- `thread/settings/update` is treated as successful only after a matching
  `thread/settings/updated` notification. Codex's own client treats the RPC
  response as the acknowledgement and handles unsupported experimental settings
  updates as a capability downgrade.
- `model/list` is parsed as a single page and Setta drops fields such as
  modalities, personality support, upgrade metadata, and service tiers.
- Notification methods and scope policy are hand-maintained in
  `internal/chat/codex_harness_scope.go`, which is drift-prone as Codex adds
  app-server notifications.

## Phase 1: Establish A Codex Protocol Source

Use the cloned Codex repository as the manual refresh source:

```text
/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/app-server-protocol/schema/typescript
```

Add a checked-in source snapshot under a Setta-owned path, for example:

```text
internal/codexapp/protocolschema/
```

Normal generation should read only this checked-in snapshot. It should not start
or query a Codex app-server, clone repositories, fetch from the network, or
depend on local developer paths. This keeps generation deterministic in CI and
offline development.

Add snapshot metadata that records the upstream Codex commit and schema source
path, for example:

```text
internal/codexapp/protocolschema/UPSTREAM
```

Add a separate refresh script, for example:

```text
scripts/refresh_codex_protocol_schema.sh
```

The refresh script may accept a local Codex repo path or read one from an
environment variable such as `CODEX_REPO`. It should verify the repo is at the
intended upstream commit, copy the relevant schema snapshot into Setta, and then
run the generator. Updating the pinned upstream commit should be an explicit
reviewable change.

The generator must not contain a manually curated list of Codex endpoints,
methods, notifications, or dependent types. It should start from stable upstream
root schema files, such as `ClientRequest` and `ServerNotification`, then walk
imports or schema references transitively to find the request params,
notification params, enums, and response types Setta needs. If the upstream
schema shape changes in a way the generator cannot understand, the generator
should fail loudly with the unsupported schema path.

Decision point: prefer Codex's JSON schema if it is available and complete for
the app-server protocol. If the generated TypeScript schema is the only complete
stable artifact, write a narrow converter for the subset Setta consumes instead
of parsing arbitrary TypeScript. The converter still needs to discover reachable
types programmatically from imports or references; it must not replace discovery
with hand-written lists.

## Phase 2: Generate Narrow Go Protocol Types

Create a checked-in generator command, likely under:

```text
cmd/generate-codex-protocol
```

Generated outputs should live near the transport owner, for example:

```text
internal/codexapp/protocol_gen.go
```

Generate only protocol-boundary types and constants, such as:

- request and notification method constants
- `ReasoningEffort`
- `ThreadGoalStatus`
- `ThreadGoal`
- `ThreadGoalSetParams`
- `ThreadSettingsUpdateParams`
- `ThreadSettingsUpdatedNotification`
- `Model`
- `ModelListParams`
- `ModelListResponse`

Those examples describe the expected generated outputs, not a hardcoded
generator input list. The generator should derive them from the upstream roots
and Setta's protocol usage rather than from a manual manifest of Codex methods.

The generated code should avoid product-level Setta names. Setta-specific
contracts such as `ChatModelOption`, `ChatGoalState`, and renderer DTOs should
remain in `internal/chat` and continue to be generated into TypeScript through
Setta's existing contract generator.

## Phase 3: Replace Manual Codex Mirrors

Replace scattered hard-coded protocol details with the generated boundary:

- Use generated method constants instead of string literals for app-server RPCs.
- Use generated `ReasoningEffort` and `ThreadGoalStatus` values at the Codex
  protocol boundary, then map into Setta chat contracts.
- Replace hand-written model and goal response parsing with JSON decoding into
  generated protocol structs.
- Replace the manually curated notification method list with generated
  notification constants.

Keep notification scope policy Setta-owned, because scope is Setta runtime
behavior, not Codex protocol. Make the mapping exhaustive over generated
notification constants so newly introduced Codex notifications fail loudly at
compile time or generator time.

## Phase 4: Correct Goal Command Behavior

Update `/goal` handling to match Codex-visible behavior:

- `/goal` shows the current goal summary or usage when no goal exists.
- `/goal clear` clears the current goal and reports a specific no-goal message
  if there is nothing to clear.
- `/goal pause` and `/goal resume` update status and report a specific no-goal
  message if no goal exists.
- `/goal edit` opens a goal editor instead of setting the objective to `edit`.
- `/goal <objective>` validates non-empty objective text and the Codex
  4,000-character limit before issuing the RPC.
- `/goal <objective>` confirms before replacing a non-terminal existing goal.
- Preserve Setta's current auto-continuation behavior for goal set and resume.
  Document it as Setta policy because Codex TUI slash handling does not make
  every goal mutation equivalent to sending a normal user prompt.
- Do not auto-continue after bare show, edit, pause, or clear commands.

Generate and carry `tokenBudget`, `tokensUsed`, and budget-related statuses at
the protocol boundary, but keep token budget controls hidden in the first goal
editor pass.

## Phase 5: Make Model Selection A Typed Backend Action

Keep bare `/model` as the user-facing slash command that opens the picker.

Replace renderer-emitted strings such as `/model <id>` and
`/model effort <level>` with explicit backend actions, for example:

- `setChatCodexModel(conversationId, model)`
- `setChatCodexReasoningEffort(conversationId, effort)`

Those actions can still share the same backend implementation as the current
command executor, but they should not depend on slash parsing. This makes the
public slash command behavior closer to Codex while keeping Setta's picker UX.

For linked Codex threads:

- Call `thread/settings/update` with generated params.
- Treat the RPC response as the acknowledgement.
- Use `thread/settings/updated` to reconcile state when it arrives.
- If Codex reports that the experimental settings update method is unsupported,
  surface one clear capability diagnostic and avoid repeated picker failures for
  the same session.

For unlinked or not-yet-started threads:

- Continue storing Setta conversation-local Codex settings.
- Apply those settings to the first `turn/start` for the new thread.
- Do not write to Codex global config from ordinary picker actions. If Setta
  later supports changing the user's Codex CLI default, expose that as an
  explicit settings action.

## Phase 6: Improve Model Catalog Handling

Update model listing to use generated `ModelListParams` and `ModelListResponse`.

- Follow `nextCursor` until it is empty.
- Hide hidden models from the normal picker by default. Keep hidden-model
  support available for a future developer or diagnostic mode if needed.
- Preserve the full generated `Model` at the protocol boundary.
- Map only the fields the current renderer needs into `ChatModelOption`, but do
  not discard data before the boundary mapping.
- Add renderer fields only when the UI uses them, such as input modality,
  upgrade availability, personality support, or service tier.

## Phase 7: Verification

Because this work touches chat behavior, Codex harness behavior, provider
protocol handling, run lifecycle, event streaming, generated backend contracts,
renderer chat state, and transcript UI, verification must include deterministic
end-to-end app workflow coverage through the production
Electron/main/preload/renderer/HTTP/store paths.

Focused checks during implementation:

- Generator unit tests for the Codex protocol subset.
- Backend tests for goal command parsing and model catalog pagination.
- Backend tests for `thread/settings/update` acknowledgement and notification
  reconciliation behavior.
- Renderer tests for model picker actions no longer emitting internal slash
  strings.

Required deterministic E2E coverage:

- Open a temporary workspace.
- Create a chat.
- Start or resume a Codex-backed thread using a fake scripted app-server.
- Send a normal message and receive streamed assistant output.
- Run `/goal`, `/goal <objective>`, `/goal edit`, `/goal pause`,
  `/goal resume`, and `/goal clear`.
- Confirm replacement before overwriting a non-terminal goal.
- Queue a goal command during an active run and verify promotion or preservation.
- Open `/model`, select a model, select reasoning effort, and verify the typed
  backend action path.
- Verify `thread/settings/update` success when the notification arrives, when it
  arrives later than the command result, and when the experimental method is
  reported unsupported.
- Reload the app and verify persisted conversation-local model settings and goal
  state render correctly.

Live-provider check:

- If `OPENAI_API_KEY` is present in `.env`, run the live Codex E2E tests without
  printing the key.
- If the key is absent, report the live-provider tests as skipped; do not treat
  the skip as proof of provider integration.

Final gates before commit:

```sh
./scripts/format.sh
./check_quality.sh --all
```

Run `./scripts/check_supply_chain.sh` only if the implementation changes
dependency manifests, lockfiles, package manager configuration, Go module
configuration, or supply-chain tooling.

## Suggested Implementation Order

1. Add the Codex protocol schema snapshot, upstream pin metadata, refresh
   script, and generator.
2. Make the generator discover protocol members from upstream roots and
   transitive references, with no hand-maintained method/type list.
3. Generate narrow Go Codex protocol types.
4. Convert model list and goal response parsing to generated structs.
5. Convert method strings and notification names to generated constants.
6. Make notification scope policy exhaustive over generated notifications.
7. Fix `/goal edit`, objective validation, replacement confirmation, and
   no-goal error handling.
8. Preserve auto-continuation for goal set and resume only, with regression
   coverage.
9. Move model picker selections from slash strings to typed backend actions.
10. Adjust `thread/settings/update` handling to ack-first reconciliation.
11. Add model pagination, hide hidden models by default, and preserve richer
    model metadata at the boundary.
12. Add deterministic E2E coverage, then run the final gates.
