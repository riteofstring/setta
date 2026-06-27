# Codex History Deduplication Plan

## Goal

Make Codex-owned conversation history the only persisted source of truth for Codex-backed chat transcripts. Setta should project Codex threads, turns, and items into the frontend shape it needs, while persisting only Setta-owned application overlay state.

This is a clean replacement plan. It intentionally does not include backward compatibility, legacy read paths, migrations, dual-read/write behavior, transitional adapters, or old-field aliases.

## Current Baseline

- Codex app-server stores session history under `CODEX_HOME`, which defaults to `~/.codex`. Setta currently starts `codex app-server --listen stdio://` without overriding `CODEX_HOME`, so normal Setta-driven Codex sessions land in `~/.codex`.
- Setta stores its own app data under `~/.setta` by default.
- Setta currently persists chat conversations, messages, runs, run items, outputs, queues, and transcript views through the chat store under Setta app data.
- That means Codex-backed user and assistant transcript content is currently duplicated: Codex persists it for its own session history, and Setta persists a second application-specific copy.
- Codex app-server already exposes persisted history through protocol APIs such as `thread/list`, `thread/read`, and `thread/turns/list`. Setta's supported Codex protocol schema currently does not include all of those history APIs.
- Use `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` as the local reference source for Codex app-server protocol structs, generated schema fixtures, and behavior tests while implementing this plan.

## Design Decisions And Tradeoffs

- This plan removes duplicated transcript persistence. It does not remove every Setta-owned chat-adjacent record.
- Setta should keep a small reconstructable thread index and overlay store under `~/.setta`. Those records may identify Codex threads and store Setta-only metadata, but they must not contain Codex-owned transcript text.
- Viewing Codex-backed history now depends on a working Codex app-server. If Codex is unavailable, version-incompatible, or cannot answer the required history APIs, Setta should show a specific provider-unavailable state instead of falling back to old Setta transcript files.
- A persisted local transcript cache would improve offline availability and latency, but it would deliberately reintroduce duplicated transcript text. That alternative is out of scope for this plan unless the product decision changes.
- Latency must be managed through process lifetime, request coalescing, cursor paging, in-memory renderer page caches, and the Setta thread index. Do not solve latency by writing a second transcript store.
- Because this branch has no compatibility requirement, pre-cutover Setta chat records and chat-linked semantic/workflow records can be ignored or discarded. That is a product data-reset decision, not an implementation accident.

## Target Ownership Model

| Data | Owner | Notes |
| --- | --- | --- |
| Codex thread identity | Codex | Use Codex `Thread.id` as the Setta conversation/thread identifier for Codex-backed chats. |
| Codex turn identity | Codex | Use Codex `Turn.id` as the Setta run/turn identifier after a turn has started. |
| User and assistant transcript text | Codex | Never persist a duplicate copy in `~/.setta`. |
| Persisted Codex thread metadata | Codex | CWD, model provider, timestamps, status, source, title/name, and available turn state come from Codex APIs. |
| User/internal chat classification | Codex thread source | Use distinct Setta thread-source markers for visible user chats and internal/workflow chats so the split is reconstructable after deleting `~/.setta`. |
| Thread goal | Codex | Use Codex `thread/goal/get`, `thread/goal/set`, and `thread/goal/clear`; remove Setta's duplicated goal file for Codex-backed chats. |
| Model and reasoning settings | Codex plus pending overlay | Set initial values at `thread/start`. For linked threads, use Codex `thread/settings/update` only after Phase 0 proves the writable surface works. Store only pending pre-thread selections in Setta overlay. |
| Live streaming deltas | Setta memory | Keep only active in-memory projection state needed for responsive UI. Drop it after it is reconciled with Codex history or the process exits. |
| Setta thread index | Setta overlay | Store workspace ID, Codex thread ID, Setta ownership marker, selection/list metadata, and local UI metadata. Keep it reconstructable from Codex `thread/list` results. Do not store transcript text. |
| Queued prompts not yet sent to Codex | Setta overlay | These are not Codex history until promoted into a Codex turn. |
| Workspace selection and UI state | Setta overlay | Selected workspace, selected Codex thread, pins, read markers, layout, and local preferences remain Setta-owned. |
| Workflow and semantic graph references | Setta overlay | Store references by Codex thread/turn IDs, not by duplicated transcript records. |
| Approvals in flight | Live runtime state | After restart, derive visible state from Codex thread status and live runtime state; do not preserve old Setta run records as recovery data. |
| Detailed live activity not persisted by Codex | Setta activity overlay | Persist a lossless non-transcript overlay for command/tool/approval details that Codex history does not retain. Key every record to Codex thread/turn/item identity. Do not persist user or assistant transcript text in this overlay. |

## Cutover Rules

- Remove the old Setta transcript persistence path. Do not leave it as a fallback.
- Do not read existing `~/.setta` chat conversation/message/run files.
- Do not write new user or assistant transcript text to `~/.setta`.
- Do not write duplicated Codex transcript item payloads to `~/.setta`. The Setta activity overlay may store command/tool/approval details only when Codex does not durably expose those details.
- Do not migrate existing Setta chat data into the new shape.
- Do not preserve old IDs through alias tables. New Codex-backed chat IDs are Codex thread IDs.
- Do not scrape Codex JSONL files directly from `~/.codex`. Use Codex app-server APIs so Setta stays aligned with Codex's supported history model and future storage changes.
- Fail loudly when a required Codex history API or required field is missing. Do not silently fall back to Setta's deleted transcript store.
- Treat unmarked pre-cutover Codex threads as outside the new Setta-owned chat set unless the implementation chooses an explicit non-heuristic inclusion rule before cutover. Do not infer ownership from transcript content.

## Codex Thread Identification

Setta needs deterministic ownership markers so it can list the relevant Codex threads without transcript heuristics.

- Start new Setta-created visible user chats with a Setta-specific Codex `threadSource` value, for example `setta:user`.
- Start workflow-agent and internal Setta-created Codex threads with a different explicit `threadSource` value, for example `setta:workflow`. Do not stamp all Setta-created threads with the same marker.
- If more internal surfaces are added, define new explicit markers such as `setta:<surface>` rather than inferring visibility from title, transcript text, or Setta-only overlay state.
- Continue using Codex app-server client metadata to identify the Setta client.
- Codex `thread/list` does not server-filter by `threadSource`. List candidate threads with exact workspace `cwd` and `sourceKinds: ["appServer"]`, then client-filter returned threads by explicit Setta markers.
- User chat lists should include `threadSource == "setta:user"` and exclude internal markers. Workflow/internal lists should use their own explicit markers.
- Keep a Setta thread index keyed by workspace ID and Codex thread ID for fast membership, selected-thread restoration, pins, read markers, and list metadata. This index is an overlay, not transcript history.
- The Setta thread index must be reconstructable by scanning Codex `thread/list` pages for matching `cwd`, app-server source, and explicit Setta `threadSource` markers. Deleting `~/.setta` may lose pins, selection, read state, and local ordering hints, but should not make matching Codex threads permanently undiscoverable or cause workflow/internal threads to appear as user chats.
- If Codex stops returning `threadSource` in `thread/list`, or if the field proves unreliable for Setta-created threads, stop and change the Codex integration. Do not infer ownership from transcript content.
- The thread index must not contain transcript text, assistant text, user prompts, command output, or run item output.

## Phase 0: Validate Load-Bearing Assumptions

Do this before deleting any current persistence path.

- Verify with a deterministic Codex app-server test that threads started by Setta with `threadSource: "setta:user"` and `threadSource: "setta:workflow"` are later returned by `thread/list` with those same values.
- Verify `thread/list` with exact workspace `cwd` and `sourceKinds: ["appServer"]` returns Setta-created app-server threads and excludes normal CLI/VS Code sessions.
- Verify user chat reconstruction from Codex `thread/list` excludes workflow/internal Setta threads after deleting the Setta thread index.
- Verify the startup and initialization path needed for experimental `thread/turns/list`, including capability flags if Codex requires them.
- Verify the writable Codex thread surface Setta will depend on:
  - `thread/name/set` for title changes
  - `thread/goal/get`, `thread/goal/set`, and `thread/goal/clear` for goal state
  - `thread/settings/update` and `thread/settings/updated` for linked-thread model and reasoning changes, including its experimental capability requirements and queued-ack behavior
- If linked-thread model or reasoning updates are unavailable, define the product behavior before implementation: model changes either apply only before thread creation, or they create a new Codex thread. Do not silently store a divergent linked-thread model in Setta overlay.
- Verify live Codex streaming events expose stable IDs that can be joined to persisted `thread/turns/list` or `thread/read` items after reload.
- For activity records that Codex does not persist as items, define a deterministic turn-scoped overlay presentation key before implementation. Do not rely on event arrival order unless it is persisted as explicit sequence metadata.
- Measure rough latency for `thread/list`, first transcript page, and older-page loads against realistic local histories. Record initial budgets in the implementation PR or a performance note before replacing local reads.
- Define the unavailable-provider UX for history views. This can be a clear error/retry state, but it cannot be a hidden read from deleted Setta transcript files.
- Treat any failure in this phase as a design blocker, not as a reason to keep a silent compatibility path.

## Phase 1: Protocol Surface

Bring the Codex history APIs into Setta's generated protocol layer.

- Register stable Codex history methods already present in Setta's vendored stable schema:
  - add `thread/list` to `internal/codexapp/protocolschema/supported_protocol.json`
  - add `thread/read` to `internal/codexapp/protocolschema/supported_protocol.json`
- Vendor the missing experimental schema fixtures for `thread/turns/list` before registering it:
  - copy or regenerate `ThreadTurnsListParams` and `ThreadTurnsListResponse` JSON schema fixtures from `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` at the matching Codex upstream revision into Setta's experimental schema area
  - include every referenced experimental schema needed by those fixtures
  - record the upstream source in the same style used for the existing experimental `thread/settings/update` entry
  - then add `thread/turns/list` to `supported_protocol.json` with `experimental: true`
- Do not rework `thread/settings/update` as part of history registration; it is already registered/generated today. Keep Phase 0 verification because the method is experimental and acknowledgement-based.
- Regenerate `internal/codexapp/protocol_gen.go` from Setta's vendored Codex protocol schema.
- Update protocol generation tests so these methods are expected and decoded.
- Remove the existing generator-test expectation that `thread/list` is unsupported.
- Add focused tests for the Codex response shapes Setta will consume:
  - thread summaries
  - thread reads with `includeTurns`
  - paged turn lists with summary and full item views
  - missing required history fields failing specifically

## Phase 2: Codex History Adapter

Create a provider adapter that converts Codex history data into Setta's frontend projection. This is not a compatibility adapter for old Setta data; it is the Codex provider implementation.

- Add a `CodexHistoryAdapter` or similarly named module next to the existing Codex harness boundary.
- Map Codex `Thread` into Setta conversation/thread summary data.
- Map Codex `Turn` and `ThreadItem` into Setta transcript rows, assistant messages, user messages, run state, and item summaries.
- Use Codex cursors from `thread/turns/list` for transcript pagination.
- Prefer `thread/turns/list` for large transcript loading. Use `thread/read(includeTurns=true)` only for focused reads where loading all turns is acceptable.
- Keep row keys stable from Codex IDs, for example `threadId:turnId:itemId` or the closest deterministic Codex item identity available.
- Make unsupported Codex item variants explicit in the adapter with typed exhaustiveness checks.
- Add fixture-based adapter tests using representative Codex `Thread`, `Turn`, and `ThreadItem` payloads.

## Phase 3: Setta Storage Remodel

Replace Setta's chat transcript store with a narrow overlay store.

- Delete Setta message, conversation transcript, run, run item, and output persistence methods for Codex-backed chats.
- Remove filesystem paths that persist duplicated Codex transcript content under `~/.setta`.
- Remove Setta `goal.json` persistence for Codex-backed chats; goal state should come from Codex goal APIs.
- Keep a new overlay storage area only for Setta-owned state, such as:
  - reconstructable workspace/thread index records
  - selected Codex thread per workspace
  - pinned/starred thread IDs
  - read markers
  - unsent local queue entries
  - pending pre-thread model and reasoning selections
  - workflow references
  - semantic graph references
  - local diagnostics
  - lossless non-transcript activity records for command/tool/approval details that Codex does not persist
- Use new overlay paths and schemas. Do not reuse old chat transcript paths.
- Scope thread index records narrowly:
  - required keys: workspace ID, Codex thread ID, Codex `threadSource`, derived Setta surface (`user` or `workflow`), workspace root/cwd used for discovery, and local list metadata
  - allowed payloads: selected state, pin state, read markers, hidden/workflow-owned flags, local ordering hints, and last successful discovery metadata
  - prohibited payloads: user prompt text, assistant message text, command output, tool output, and Codex-persisted transcript item bodies
- Scope activity overlay records narrowly:
  - required keys: Codex thread ID, Codex turn ID, stable activity/event key, activity kind, timestamps, and status
  - allowed payloads: shell command text, stdout/stderr, tool invocation details, approval prompts/decisions, tool lifecycle metadata, file-change details, and error details not durably exposed by Codex
  - prohibited payloads: user prompt text, assistant message text, Codex-persisted transcript item bodies, and any second copy of Codex-owned thread or turn history
- Remove corrupt-state diagnostics and tests that only apply to the deleted transcript store.
- Add tests that prove overlay records never contain user prompt text, assistant response text, or duplicated Codex-persisted item output.

## Phase 4: Backend Chat Service

Rebuild chat service reads around Codex history projection.

- `ListConversations` should call Codex `thread/list`, apply deterministic workspace and Setta thread-source filtering, then merge Setta overlay metadata.
- Use the Setta thread index to make common conversation-list reads fast, then reconcile it with Codex `thread/list` in the foreground or background according to the UX path. The index is not allowed to satisfy transcript reads by itself.
- `LoadMessagePage` should call Codex `thread/turns/list` and return a projected transcript window.
- Starting a new user chat should call Codex `thread/start` with the visible-user Setta `threadSource`, then start the first turn.
- Starting a workflow-agent or internal chat should call Codex `thread/start` with the workflow/internal Setta `threadSource`, then start the first turn.
- After a successful `thread/start`, write or update the Setta thread index record for that Codex thread.
- Sending to an existing chat should resume or target the Codex thread ID directly, then start the new Codex turn.
- Queued prompts remain local overlay entries until promoted. On promotion, replace the queue entry with the Codex turn identity; do not keep dual run identities.
- Streaming should continue to use live Codex app-server notifications for the active turn. On completion, reconcile from Codex turn state and discard any in-memory duplicate transcript buffers.
- Persist activity overlay records from live Codex events only for command/tool/approval details that Codex history will not expose after reload.
- Cancellation, failure, and restart behavior should be derived from Codex thread and turn state plus live runtime state. Do not resurrect old Setta persisted run records.
- Thread title/name and goal state should be read from and written through Codex thread APIs.
- Model and reasoning settings should be set at Codex thread creation. For linked threads, use Codex `thread/settings/update` only if Phase 0 verifies the API and notification behavior. Persist only pending pre-thread selections and Setta preferences that are not Codex history.
- If Codex app-server is unavailable for history reads, return a typed unavailable-provider error to the renderer. Do not read deleted Setta transcript paths as a degraded mode.

## Phase 5: HTTP Contracts And Generated Types

Update the Go-owned API contracts so the renderer receives projection data rather than persisted Setta transcript records.

- Audit `internal/chat/types.go` and the `internal/httpapi` endpoint registry for fields that imply Setta-owned persisted conversations, messages, runs, or ordinals.
- Rename fields only when the new ownership model is clearer enough to justify the frontend churn.
- Keep Codex IDs visible where the frontend or semantic/workflow layers need stable references.
- Replace ordinal-based transcript pagination with cursor-based pagination if current contracts assume Setta message ordinals.
- Regenerate TypeScript API surfaces from the Go-owned contracts.
- Do not manually edit generated TypeScript outputs.

## Phase 6: Renderer State And Transcript UI

Make the frontend treat transcript data as a Codex-backed projection window.

- Stop assuming that the renderer can load or mutate Setta-owned message records for Codex-backed chats.
- Store transcript pages by Codex thread ID and Codex pagination cursor.
- Use stable row keys from Codex thread/turn/item identity.
- Keep active streaming rows in memory and reconcile them with backend-projected Codex history after completion.
- After reload, join Codex transcript history with Setta activity overlay records so command/tool/approval panels remain available.
- Keep selected chat, pins, read markers, and local queue UI connected to Setta overlay state.
- Ensure reload reconstructs the transcript from Codex APIs plus overlay state, not from old Setta transcript files.
- Preserve efficient large-transcript behavior: windowed pages, bounded renderer memory, and stable scroll anchors.

## Phase 7: Semantic Graph And Workflow References

Move cross-feature references from Setta transcript records to Codex-backed identities.

- For Codex-backed chats, make the ID model explicit:
  - `Conversation.id` is the Codex thread ID.
  - `Run.id` is the Codex turn ID after a turn has started.
  - projected message IDs and run item IDs come from Codex item IDs when Codex persists the item.
  - Setta activity overlay IDs are used only for Setta-owned command/tool/approval detail records that Codex does not persist.
- Replace references that depend on Setta conversation/run/message persistence with Codex thread, turn, Codex item, and Setta activity overlay identifiers as appropriate.
- Prefer provider-neutral contract names such as `agentThreadId`, `agentTurnId`, `agentItemId`, and `activityItemId` if the implementation touches these contracts broadly. Keep old `chatConversationId`-style names only if the backing value is unambiguously documented as a Codex thread/turn/item ID for Codex-backed chats.
- Update semantic graph ingestion and automatic cartographer reads to request transcript snippets through the history adapter.
- Update workflow nodes that link to chat runs so they point at Codex turn IDs.
- Do not migrate existing semantic graph or workflow records that reference old Setta chat IDs. Cutover should treat those chat-linked records as reset/ignored data.
- Add tests for new semantic/workflow refs that navigate from activity chips, evidence anchors, and workflow node details back to the projected Codex transcript plus Setta activity overlay.
- Regenerate affected contracts after owner-defined type changes.

## Phase 8: Verification

Because this touches chat behavior, Codex harness behavior, provider protocol handling, persistence, event streaming, renderer chat state, and transcript UI, verification must exercise production paths.

- Add focused adapter tests for Codex-to-Setta projection.
- Add backend tests for thread listing, transcript paging, queue promotion, and overlay persistence.
- Add overlay tests proving command/tool/approval details survive reload while user and assistant transcript text are not duplicated.
- Add tests proving the Setta thread index contains no transcript text and can be reconstructed from Codex `thread/list` results.
- Add reconstruction tests proving workflow/internal Setta threads do not appear in the user chat list after deleting the Setta thread index.
- Add unavailable-provider tests proving conversation/transcript history requests return typed errors without reading old Setta transcript paths.
- Add deterministic Electron E2E coverage with temporary `CODEX_HOME` and temporary Setta app data:
  - open a workspace
  - create a chat
  - send a message
  - receive streamed assistant output
  - queue during an active run
  - steer during an active run
  - handle approval flows if touched
  - complete, cancel, and fail runs
  - reload and reconstruct chat history from Codex APIs
  - restore command/tool/approval details from Setta activity overlay after reload
  - verify no duplicated transcript files are written under Setta app data
- Use a scripted fake Codex/app-server harness for deterministic E2E cases.
- Run live Codex E2E tests when local Codex CLI ChatGPT auth is available. Do not use `OPENAI_API_KEY`. If ChatGPT auth is unavailable, report the live-provider skip narrowly.
- Run focused checks first while iterating.
- Before committing executable code or generated outputs, run:
  - `./scripts/format.sh`
  - `./check_quality.sh --all`

## Acceptance Criteria

- New Codex-backed chats are visible in Setta from Codex `thread/list` and readable from Codex `thread/turns/list` or `thread/read`.
- `~/.setta` no longer contains duplicated Codex user messages, assistant messages, or Codex-persisted item output.
- `~/.setta` no longer contains Codex-backed `goal.json`; Codex thread goal APIs own goal state.
- `~/.setta` may contain Setta activity overlay records for command/tool/approval details that Codex does not durably expose.
- `~/.setta` may contain a reconstructable Setta thread index with Codex thread IDs and local UI metadata, but no transcript text.
- Deleting Setta app data resets only Setta overlay state. Matching Codex threads remain discoverable from Codex history.
- Deleting Setta app data does not cause workflow/internal Setta threads to appear as user chats, because visibility is encoded in Codex `threadSource`.
- Reload reconstructs transcript history from Codex and restores command/tool/approval detail panels from Setta's activity overlay.
- If Codex history APIs are unavailable, Setta shows a typed unavailable-provider state and does not fall back to old Setta transcript files.
- Deleting, archiving, or otherwise changing a Codex thread is reflected in Setta because Setta no longer has a stale transcript copy.
- Queue, steering, approvals, cancellation, failure, and active streaming behavior still work through production Electron/main/preload/renderer/backend paths.
- No code reads old Setta chat transcript paths.
- No migration, legacy read, dual-write, compatibility shim, or old-ID aliasing remains.

## Main Risks

- Codex persisted history does not preserve every live agent interaction detail. Command execution details are one known lossy area. Setta should therefore persist a separate activity overlay with a narrow schema and explicit tests proving it does not duplicate transcript text.
- History viewing becomes coupled to Codex app-server availability and protocol compatibility. This is the direct cost of removing Setta's duplicated transcript read path.
- `thread/turns/list` is an experimental Codex API in the vendored schema. The implementation must initialize the required capability, test the protocol path through production code, and fail specifically when the API is unavailable.
- Setta currently has stable schema fixtures for `thread/list` and `thread/read`, but not experimental `thread/turns/list` fixtures. The implementation must vendor or regenerate the missing experimental fixtures before registration and generation.
- Linked-thread model and reasoning changes depend on experimental Codex `thread/settings/update` and `thread/settings/updated`. If that surface is unavailable or unreliable, Setta must choose a product behavior that does not create divergent Setta-owned linked-thread settings.
- `thread/list` cannot server-filter by `threadSource`, so Setta must combine Codex `cwd` and app-server source filtering with client-side `threadSource` filtering and a reconstructable local thread index.
- Visible user chats and workflow/internal chats must use distinct Codex `threadSource` markers. Otherwise deleting `~/.setta` would lose Setta-only `Internal` flags and leak machine-created threads into the user list.
- The activity overlay join depends on stable live-event and persisted-history identifiers. Phase 0 must prove that join or define a deterministic turn-scoped overlay presentation before old persistence is removed.
- If Codex later durably exposes the same activity details, transfer ownership to Codex by deleting the overlapping Setta fields rather than adding a dual-read compatibility path.
