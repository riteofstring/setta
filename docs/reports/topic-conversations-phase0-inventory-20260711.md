# Topic Conversations Phase 0 Ownership And Configuration Inventory

Date: 2026-07-11

## Review boundary

This report closes the ownership, generated-contract, provider availability,
role-default, voice-mode, and palette-catalog inventory required before source
changes in
`docs/plans/topic-conversations-global-master-narrator-20260711.md`.

The source inventory was reviewed at Setta revision
`693db159de1cf4f3fb87e9c11a65a05b93d29af7`. The checked Codex implementation
authority was clean at revision
`2b9c05046038c038ec6bddb9db7d11394995372d`. The local CLI was
`codex-cli 0.144.1` and reported ChatGPT authentication with
`OPENAI_API_KEY` removed from the process environment.

The inventory is a deletion and ownership map, not permission to keep adapters
between the old and new domains. “Extract” means move the named behavior to its
new owner and delete the old import path after callers move.

## Backend ownership inventory

The following package counts include tests and fixtures. They establish the
review surface for the cutover diff.

| Current owner                | Files | Go files | Go tests | Cutover disposition                                                                                                                                                                                                            |
| ---------------------------- | ----: | -------: | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `internal/chat`              |   217 |      216 |       80 | Extract Codex thread/turn, approval, liveness, model-catalog, and required background-process behavior into `internal/agent`; delete chat transcript, selection, commands, paging, JSON persistence, and the old package path. |
| `internal/easyrun`           |    18 |       18 |        7 | Replace with `internal/conversation` and `internal/narration`; delete the package, workspace-global gate, latest-run store, digest narrator, and endpoints.                                                                    |
| `internal/orchestrator`      |    38 |       38 |       10 | Delete workflow execution, graph, definition, persistence, and HTTP/runtime wiring.                                                                                                                                            |
| `internal/terminal`          |    10 |       10 |        3 | Delete the manual terminal manager, profiles, events, endpoints, and desktop bridge. Agent-created process cleanup moves with the agent runtime instead.                                                                       |
| `internal/semanticgraph`     |    46 |       46 |       11 | Delete graph, cartographer, index substitutes, event streams, SQLite store, and wiring.                                                                                                                                        |
| `internal/semanticcontext`   |     1 |        1 |        0 | Delete the obsolete semantic-context interface with its consumers.                                                                                                                                                             |
| `internal/workspaceactivity` |     6 |        6 |        2 | Delete chat/workflow activity projection and streams.                                                                                                                                                                          |
| `internal/notify`            |     5 |        5 |        1 | Delete. Its only production observer is `StartChatObserver`, and the target plan names no surviving push-notification consumer. Remove the push endpoints, VAPID runtime metadata, and persistence with it.                    |

Surviving backend boundaries are also explicit:

- `internal/codexapp` remains the low-level process/session/JSON-RPC/generated
  protocol owner; higher-level thread behavior leaves `internal/chat` for the
  new `internal/agent` package.
- `internal/workspaceui` keeps the compositor/layout boundary but receives a
  clean pane contract and must not read old layouts containing deleted kinds.
- `internal/speech` keeps the external speech-provider boundary but loses all
  Easy Run and workspace coupling in favor of global capture and typed
  master/narrator synthesis.
- `internal/runtime`, `internal/httpapi`, `internal/workspacesession`,
  `internal/codexaccount`, `internal/appearance`, and desktop main/preload code
  survive only after obsolete service fields, handlers, contracts, streams,
  and bridge methods are removed.
- `modernc.org/sqlite v1.51.0` is already an exactly pinned direct dependency in
  `go.mod`; Phase 1 can use it without adding a second SQLite dependency.

The primary composition roots that must be simplified are
`internal/runtime/server.go`, `internal/httpapi/services.go`,
`internal/httpapi/endpoints.go`, and `cmd/generate-contracts/main.go`.
`cmd/generate-contracts` currently imports `internal/chat` for event contracts;
the new conversation/master event owners must replace that dependency rather
than wrap it.

## HTTP endpoint inventory

`internal/httpapi/endpoints.go` owns all 146 current endpoints and is the sole
input for generated request/response surfaces. The reviewed cutover
classification is:

| Disposition                                       | Count | Current endpoints                                                                                                                                                                             |
| ------------------------------------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove entire namespace                           |    36 | All `/chat/*` endpoints, from `ListConversations` through `SubmitApproval`; the chat-owned `/events` stream is counted separately below.                                                      |
| Remove entire namespace                           |     5 | All `/easy-runs/*`: `ReadEasyRunSnapshot`, `StartEasyRun`, `SteerEasyRun`, `StopEasyRun`, `EasyRunEventStream`.                                                                               |
| Remove entire namespace                           |    18 | All `/workflows/*`, including definitions, executions, graph projection, node run controls, approvals, and `WorkflowEventStream`.                                                             |
| Remove entire namespace                           |    41 | All `/semantic-graph/*`, including cartographer, context packs, attachments, mutation commands, and `SemanticGraphChangeEventStream`.                                                         |
| Remove entire namespace                           |    11 | All `/terminals/*`, including profiles and `TerminalEventStream`.                                                                                                                             |
| Remove entire namespace                           |     3 | All `/workspace-activity/*`: `ReadWorkspaceActivitySnapshot`, `ReadWorkflowExecutionActivity`, `WorkspaceActivityEventStream`.                                                                |
| Remove with `internal/notify`                     |     3 | `PushSubscribe`, `PushUnsubscribe`, `PushTest`.                                                                                                                                               |
| Remove chat-owned generic stream                  |     1 | `EventStream` at `/events`; its handler subscribes directly to `chat.Service`.                                                                                                                |
| Remove selected-chat state                        |     2 | `WorkspaceSelectedConversations`, `SetWorkspaceSelectedConversation`. There is deliberately no global selected-conversation replacement.                                                      |
| Remove Easy Run speech methods                    |     2 | `SynthesizeEasyRunSummary`, `SynthesizeEasyRunHighlight`.                                                                                                                                     |
| Replace contract in place or with target endpoint |     2 | `ReadWorkspaceUILayout`, `SaveWorkspaceUILayout`; keep layout functionality but use the clean pane schema and namespace.                                                                      |
| Replace contract in target speech API             |     2 | `ReadSpeechCapabilities`, `CreateSpeechTranscriptionSession`; expose a typed voice catalog and app-global transcription with no workspace parameter.                                          |
| Retain current product boundary                   |    20 | Appearance (3), Codex account (5), devices (2), health (1), pairing (1), runtime identity/display name (2), workspace session (1), and workspace open/select/close/reorder/remove-recent (5). |

This accounts for all 146 entries: 122 removals, 4 replacement contracts, and
20 retained boundaries. New conversation, narration, role, presentation,
master, and generic speech endpoints are additions owned by their new domains;
they are not aliases for any of the 122 removals.

## Renderer and desktop ownership inventory

The current renderer review surface is:

| Current slice or filename pattern                   | Files | Cutover disposition                                                                                                                                                                    |
| --------------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `desktop/src/renderer/src/components/chat*`         |    53 | Delete transcript, composer, commands, message actions, plans, background-terminal monitor, and chat presentation. Build the master overlay and navigator as new shell-owned surfaces. |
| `desktop/src/renderer/src/stores/chat*`             |    46 | Delete selected-chat and transcript state. Replace with one normalized, keyed conversation projection and bounded event application.                                                   |
| `desktop/src/renderer/src/features/easy-button`     |    28 | Keep useful projection components, but bind them to `conversationId`; delete pane-owned capture/playback and old Easy Run assumptions.                                                 |
| `desktop/src/renderer/src/stores/easy-run-*`        |     3 | Delete singleton workspace/latest-run state and event projection.                                                                                                                      |
| `desktop/src/renderer/src/features/workspace-graph` |   105 | Delete workflow graph, settings, node details, approval, runtime registry, and tests.                                                                                                  |
| terminal-named files under `workspace-layout`       |    23 | Delete manual terminal adapters, profiles, settings, snapshot/runtime policy, CSS hooks, and tests.                                                                                    |
| `workspace-layout/git-graph-*`                      |     3 | Delete adapter, layout, and worker plus registrations, fixtures, and tests.                                                                                                            |
| semantic-named renderer files                       |    10 | Delete semantic projections, details, stores, and registrations.                                                                                                                       |

The Go-owned `workspaceui.SurfaceKind` set currently contains nine values.
`chat-dom`, `workflow-graph`, `terminal`, `semantic-node-details`,
`workflow-node-details`, and `workflow-settings` are deleted. `easy-button`,
`empty-frame`, and `settings-dom` survive. The renderer additionally registers
`git-graph`, which is deleted, and `browser`, which is retained as the
separately supported browser surface.

Desktop bridge removal includes the current chat attachment/Codex/chat IPC
files; Easy Run IPC and event-forwarding files; workflow, semantic graph,
workspace activity, and terminal IPC/event-stream files; their tests; and the
corresponding methods in `desktop/src/preload/index.ts`,
`desktop/src/shared/types.ts`, and renderer API implementations. The generic
main/preload/runtime connection and recording infrastructure survives and is
extended for conversation and master streams.

The shell owners to rebuild rather than preserve by alias are
`desktop/src/renderer/src/App.tsx`,
`desktop/src/renderer/src/components/workspace-sidebar.tsx`, its sidebar model,
and the current selected-chat callbacks. The resizable/collapsible shell pane,
workspace compositor, drag/drop, overview, resize, snapshot, and runtime
connection code remain.

## Persistence inventory

The clean break must stop reading or writing these current paths:

- chat JSON trees under
  `<app-data>/workspaces/<workspace-id>/conversations`, `runs`, messages,
  transcript blocks, run items/outputs, traces, background terminal data,
  root diagnostics, and
  `<app-data>/settings/chat-codex-defaults.json`
- Easy Run records under
  `<app-data>/workspaces/<workspace-id>/easy-runs/<easy-run-id>` with
  `run.json`, `artifacts.json`, and `highlights.json`
- `<app-data>/workflow-kernel.sqlite` and workspace-authored
  `.setta/workflows`
- `<app-data>/semantic-graph.sqlite`
- `<app-data>/settings/terminal-profiles.json`
- old workspace layouts at
  `<app-data>/workspaces/<workspace-id>/ui-state.json`
- notification state at `<app-data>/runtime/web-push.sqlite` and
  `<app-data>/runtime/web-push-vapid.json`

Phase 1 uses a new conversation database namespace at schema version 1. It does
not import any path above. Tests use new temporary app-data roots and never
exercise a migration or cleanup path.

## Generated contract and Codex protocol baseline

The generated backend contract baseline is:

- HTTP protocol version: `13`
- owner-derived schema hash:
  `sha256:e222517b5fb9825d654bae35f69da75313f972305da6c1c0dc059f9a5e9817f0`
- `desktop/src/generated/backend.ts` SHA-256:
  `16d1e95a640831f599ea69223d19a1408da87decfe45c1f7ee019e4a71642b1a`
- `internal/httpapi/contract_schema_snapshot.json` SHA-256:
  `1b020bdadb023bdbe7d2535ccacaea08936baade28f460c71d5426c993602c81`

The Codex supported-protocol input baseline is:

- `internal/codexapp/protocolschema/supported_protocol.json` SHA-256:
  `47530d084f19b92ec86c97d3f31bd8aeecb62db87bb854b2b689dae707d3293f`
- generated `internal/codexapp/protocol_gen.go` SHA-256:
  `67ec0b8bc8d48ac06c123a9f447035b0539bb133d354230b5d9c8d70efb75122`
- 14 client methods, 7 server requests, and 63 notifications
- supported client methods:
  `config/read`, `initialize`, `model/list`,
  `thread/backgroundTerminals/terminate`, `thread/goal/clear`,
  `thread/goal/get`, `thread/goal/set`, `thread/read`, `thread/resume`,
  `thread/settings/update`, `thread/start`, `turn/interrupt`, `turn/start`, and
  `turn/steer`

The checked Codex source confirms `thread/fork`, `thread/list`,
`thread/search`, and `thread/inject_items` exist at the pinned revision, but
none is registered as supported by Setta yet. Phase 2 owns adding them to the
Go generator input and regenerating `protocol_gen.go`; generated files are not
edited manually.

No generated input or output changed in this Phase 0 slice.

## Live Codex availability and release role defaults

The repository's own auth probe passed:

```bash
env -u OPENAI_API_KEY node desktop/tests/electron/chat-live-auth.mjs
```

`model/list` was then called directly through the authenticated app-server with
`includeHidden: true` and no API key. The visible catalog was:

| Exact model id        | Catalog description                                              | Supported efforts                    | Catalog default |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------ | --------------- |
| `gpt-5.6-sol`         | Latest frontier agentic coding model                             | low, medium, high, xhigh, max, ultra | medium          |
| `gpt-5.6-terra`       | Balanced agentic coding model for everyday work                  | low, medium, high, xhigh, max, ultra | medium          |
| `gpt-5.6-luna`        | Fast and affordable agentic coding model                         | low, medium, high, xhigh, max        | medium          |
| `gpt-5.5`             | Frontier model for complex coding, research, and real-world work | low, medium, high, xhigh             | medium          |
| `gpt-5.4`             | Strong model for everyday coding                                 | low, medium, high, xhigh             | medium          |
| `gpt-5.4-mini`        | Small, fast, cost-efficient model for simpler coding tasks       | low, medium, high, xhigh             | medium          |
| `gpt-5.3-codex-spark` | Ultra-fast coding model                                          | low, medium, high, xhigh             | high            |

`codex-auto-review` was also returned as hidden and is not eligible for a Setta
role default.

The approved release defaults are exact and independent:

| Role         | Model           | Effort   | Service tier                   | Capability/permission default                                                                                                                      |
| ------------ | --------------- | -------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent`      | `gpt-5.6-sol`   | `high`   | none (catalog default is null) | `approvalPolicy: on-request`, `permissions: :workspace`; normal workspace agent tools.                                                             |
| `narrator`   | `gpt-5.4-mini`  | `low`    | none (catalog has no tiers)    | `approvalPolicy: never`, read-only sandbox, empty tool allowlist, no mutation, no approvals; only supplied authoritative context.                  |
| `master`     | `gpt-5.6-terra` | `medium` | none (catalog default is null) | `approvalPolicy: never`, no shell or filesystem tools; only the strict Setta conversation-management, routing, status, and presentation allowlist. |
| `side_agent` | `gpt-5.6-luna`  | `medium` | none (catalog default is null) | `approvalPolicy: on-request`, `permissions: :read-only`; no workspace mutation tools.                                                              |

Missing models or unsupported efforts are configuration errors. There is no
model-name heuristic or cross-role fallback. Future calls record the requested
and resolved values independently.

This probe proves auth and model availability only. It does not establish live
active-turn fork snapshot semantics. That remains a Phase 2 live-test
prerequisite for the Phase 7 active side-conversation path; the scripted
provider baseline is not evidence for it.

## Voice catalog and selection modes

The checked OpenAI OpenAPI snapshot is from
`openai/openai-openapi@5162af98d3147432c14680df789e8e12d4891e6b`. Its speech
contract documents these built-in synthesis voices, in approved deterministic
catalog order:

`alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage`,
`shimmer`, `verse`, `marin`, `cedar`.

Current Setta exposes only the generated fixed synthesis voice `marin`. Phase 5
replaces that singleton capability with the typed catalog above.

Approved target selection modes and defaults:

- global master: exact `marin`
- default topic narrator: `auto_distinct`
- per-conversation narrator override: `auto_distinct` or an exact catalog id
- exact unavailable selection: fail with a typed configuration error
- automatic unavailable selection: re-resolve only because automatic mode was
  explicitly selected; record old value, new value, catalog version, and reason

Automatic narrator assignment scans the catalog order, excludes the master
voice and voices assigned to other active narrators when possible, and persists
the result. When choices are exhausted, it reuses the least-used active
narrator voice with catalog-order tie breaking and records the reuse. It does
not reuse the master voice while any non-master voice is available, even if a
narrator voice must be shared.

## Accessible conversation palette catalog

The approved initial catalog has seven ids in allocator order. The Phase 1
presentation-contract owner must define them in Go and later generate their
renderer data. The catalog provides only the semantic identity tokens needed
for the architecture cutover: `conversationAccent`,
`conversationAccentForeground`, and `conversationFocusRing`. The focus ring
equals the accent. Other surfaces and body text continue to use application
semantic tokens.

| Palette id | Dark accent                  | Dark foreground               | Dark contrast | Light accent              | Light foreground              | Light contrast |
| ---------- | ---------------------------- | ----------------------------- | ------------: | ------------------------- | ----------------------------- | -------------: |
| `sky`      | `oklch(0.846 0.1292 213.38)` | `oklch(0.0697 0.0051 260.18)` |       13.54:1 | `oklch(0.48 0.13 213.38)` | `oklch(0.9574 0.0071 267.38)` |         5.16:1 |
| `blue`     | `oklch(0.76 0.115 250)`      | same dark foreground          |        9.77:1 | `oklch(0.48 0.13 250)`    | same light foreground         |         5.78:1 |
| `violet`   | `oklch(0.76 0.125 290)`      | same dark foreground          |        9.40:1 | `oklch(0.48 0.14 290)`    | same light foreground         |         6.10:1 |
| `magenta`  | `oklch(0.77 0.135 335)`      | same dark foreground          |        9.48:1 | `oklch(0.48 0.16 335)`    | same light foreground         |         6.32:1 |
| `amber`    | `oklch(0.82 0.135 78)`       | same dark foreground          |       11.78:1 | `oklch(0.48 0.12 78)`     | same light foreground         |         5.86:1 |
| `green`    | `oklch(0.79 0.145 152)`      | same dark foreground          |       11.41:1 | `oklch(0.48 0.13 152)`    | same light foreground         |         5.41:1 |
| `teal`     | `oklch(0.82 0.125 185)`      | same dark foreground          |       12.58:1 | `oklch(0.48 0.11 185)`    | same light foreground         |         5.25:1 |

Contrast ratios use the WCAG 2.x relative-luminance formula after converting
OKLCH to linear sRGB and clamping to the display gamut. Every foreground/accent
pair exceeds 4.5:1. Phase 9 must retain automated contrast checks against the
actual generated renderer tokens; this inventory calculation is the approved
input, not a substitute for that gate.

The default palette selection is `auto_distinct`; exact overrides use a palette
id above and fail specifically when unavailable. Automatic assignment chooses
the first palette not used by another visible conversation and persists it.
On exhaustion it chooses the palette with the fewest visible assignments,
breaks ties by catalog order, and records the reuse reason without reshuffling
existing assignments. Duplicate panes read the same persisted conversation
profile. Titles and status labels remain mandatory because color is never the
sole identifier.

These values must become one backend-owned catalog with generated renderer
token data. They must not be copied into handwritten TypeScript or CSS lists.

## Phase 0 conclusion

The functional/performance baseline, deletion inventory, generated fingerprints,
live auth/model evidence, exact role defaults, voice modes, and accessible
palette catalog are now explicit. There is no blocker to beginning Phase 1's
new SQLite persistence and core contracts. No production source, generated
artifact, dependency manifest, or old persistence path changed in this slice.
