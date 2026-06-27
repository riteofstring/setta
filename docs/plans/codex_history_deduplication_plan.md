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
- Setta should keep a small non-transcript thread index and overlay store under `~/.setta`. Those records identify Setta-owned Codex threads and store Setta-only metadata, but they must not contain Codex-owned transcript text.
- Setta will not patch or fork Codex to make `threadSource` or item IDs behave differently. The design must work with the supported Codex runtime as-is.
- Deleting `~/.setta` is now a Setta data reset: it loses Setta chat membership, user/internal classification, local UI metadata, queues, and activity overlays. Codex raw history remains in `~/.codex`, but Setta will not automatically reconstruct its chat list from Codex alone.
- Viewing Codex-backed history now depends on a working Codex app-server. If Codex is unavailable, version-incompatible, or cannot answer the required history APIs, Setta should show a specific provider-unavailable state instead of falling back to old Setta transcript files.
- A persisted local transcript cache would improve offline availability and latency, but it would deliberately reintroduce duplicated transcript text. That alternative is out of scope for this plan unless the product decision changes.
- Latency must be managed through process lifetime, request coalescing, cursor paging, in-memory renderer page caches, and the Setta thread index. Do not solve latency by writing a second transcript store.
- Because this branch has no compatibility requirement, pre-cutover Setta chat records and chat-linked semantic/workflow records can be ignored or discarded. That is a product data-reset decision, not an implementation accident.

## Codex Runtime Compatibility

Setta must not base the de-duplicated history design on whatever user-installed
`codex` binary happens to be first on `PATH`.

- Setta should either bundle/manage a known-compatible Codex runtime or require
  an exact supported Codex version before enabling Codex-backed chat and
  history.
- The supported runtime entrypoint must expose explicit app-server session
  source selection, and Setta must start it with `--session-source app-server`.
  A runtime that only defaults app-server sessions to `vscode`, or a CLI
  subcommand that cannot accept the flag, is not sufficient for this design.
- Development may support a binary override such as `SETTA_CODEX_BIN`, but the
  same compatibility probe must run against the override. An override only
  changes the binary under test; it does not waive required protocol behavior.
- Startup must validate the selected Codex runtime before enabling
  Codex-backed chat/history. If the runtime fails the probe, Setta should expose
  a specific provider-unavailable or incompatible-provider state and must not
  fall back to duplicated Setta transcript persistence.
- The compatibility probe must verify:
  - `thread/list`
  - `thread/read`
  - `thread/turns/list` with experimental API initialization
  - `thread/settings/update` and `thread/settings/updated`
  - `thread/goal/get`, `thread/goal/set`, and `thread/goal/clear`
  - explicit app-server session source support and actual startup with
    `--session-source app-server`
  - live turn IDs are preserved across restart and can be read through Codex
    history APIs
  - live streamed command/tool/approval events expose enough turn-scoped
    provider/request metadata for Setta's activity overlay
  - whether `threadSource` and live item IDs reconcile with persisted history,
    recorded as observed provider behavior only; this plan does not depend on
    either property

## Target Ownership Model

| Data | Owner | Notes |
| --- | --- | --- |
| Codex thread identity | Codex | Use Codex `Thread.id` as the Setta conversation/thread identifier for Codex-backed chats. |
| Codex turn identity | Codex | Use Codex `Turn.id` as the Setta run/turn identifier after a turn has started. |
| User and assistant transcript text | Codex | Never persist a duplicate copy in `~/.setta`. |
| Persisted Codex thread metadata | Codex | CWD, model provider, timestamps, status, source, title/name, and available turn state come from Codex APIs. |
| User/internal chat classification | Setta thread index | Store the Setta surface (`user`, `workflow`, `semantic_cartographer`, or another explicit internal surface) in the Setta index. Do not rely on Codex `threadSource`, because current reference-runtime validation returns it empty from `thread/list`. |
| Thread goal | Codex | Use Codex `thread/goal/get`, `thread/goal/set`, and `thread/goal/clear`; remove Setta's duplicated goal file for Codex-backed chats. |
| Model and reasoning settings | Codex plus pending overlay | Set initial values at `thread/start`. For linked threads, use Codex `thread/settings/update` only after Phase 0 proves the writable surface works. Store only pending pre-thread selections in Setta overlay. |
| Live streaming deltas | Setta memory | Keep only active in-memory projection state needed for responsive UI. Drop it after it is reconciled with Codex history or the process exits. |
| Setta thread index | Setta overlay | Store workspace ID, Codex thread ID, Setta surface, selection/list metadata, and local UI metadata. This is the source of truth for Setta membership and visibility. Do not store transcript text. |
| Queued prompts not yet sent to Codex | Setta overlay | These are not Codex history until promoted into a Codex turn. |
| Workspace selection and UI state | Setta overlay | Selected workspace, selected Codex thread, pins, read markers, layout, and local preferences remain Setta-owned. |
| Workflow and semantic graph references | Setta overlay | Store references by Codex thread/turn IDs, not by duplicated transcript records. |
| Approvals in flight | Live runtime state | After restart, derive visible state from Codex thread status and live runtime state; do not preserve old Setta run records as recovery data. |
| Detailed live activity not persisted by Codex | Setta activity overlay | Persist a lossless non-transcript overlay for command/tool/approval details that Codex history does not retain. Key every record to the Codex thread, Codex turn, and a turn-scoped live provider/request ID. Use Codex item IDs only when the selected runtime returns the same IDs from persisted history. Do not persist user or assistant transcript text in this overlay. |

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

## Setta Thread Index And Codex Thread Identification

Setta needs deterministic ownership records so it can list Setta chats without transcript heuristics or Codex patches.

- Treat the Setta thread index as the source of truth for Setta chat membership and user/internal classification. It maps workspace ID plus Codex thread ID to an explicit Setta surface such as `user`, `workflow`, or `semantic_cartographer`.
- Start new Setta-created visible user chats by creating a Codex thread, then writing a Setta index record with surface `user`.
- Start workflow-agent and internal Setta-created Codex threads the same way, but write an explicit internal surface such as `workflow` or `semantic_cartographer`. Do not infer visibility from title, transcript text, cwd, Codex source, or provider metadata.
- Do not expose a newly created Codex thread as Setta-owned unless the Setta thread index write succeeds. The index is not a transcript cache, but it is required ownership metadata.
- Setta may continue sending a Codex `threadSource` marker such as `setta:user` or `setta:workflow` as provider metadata. Correctness must not depend on Codex persisting, listing, or filtering by that marker.
- Continue using Codex app-server client metadata to identify the Setta client.
- Setta must run a Codex runtime entrypoint that accepts
  `--session-source app-server`. The reference standalone `codex-app-server`
  supports this flag; the observed installed PATH runtime and the
  reference-built `codex app-server` CLI subcommand do not.
- Use Codex `thread/list` with exact workspace `cwd` and `sourceKinds: ["appServer"]` to refresh and validate indexed threads when useful, not as the source of Setta ownership. Unknown Codex threads returned by `thread/list` are ignored unless Setta later adds an explicit import or relink feature.
- User chat lists should come from Setta index records with surface `user`, hydrated with Codex thread metadata. Workflow/internal lists should come from their own explicit indexed surfaces.
- Keep the Setta thread index keyed by workspace ID and Codex thread ID for membership, selected-thread restoration, pins, read markers, local ordering hints, and list metadata. This index is an overlay, not transcript history.
- Deleting `~/.setta` deletes the Setta thread index and activity overlay. Existing Codex history remains in `~/.codex`, but Setta should treat the chat list as reset instead of trying to reconstruct user/internal ownership from Codex metadata.
- The thread index must not contain transcript text, assistant text, user prompts, command output, or run item output.

## Phase 0: Validate Load-Bearing Assumptions

Do this before deleting any current persistence path.

- Run the runtime compatibility probe against the exact supported runtime Setta
  will use. If development uses `SETTA_CODEX_BIN`, record that binary and run
  the same probe against it.
- Verify `thread/list` with exact workspace `cwd` and `sourceKinds: ["appServer"]` returns Setta-created app-server threads and excludes normal CLI/VS Code sessions only after the runtime has explicit app-server session-source support. Without that support, do not rely on this filter.
- Verify that Setta can list indexed user/workflow/internal threads from the Setta thread index and hydrate those entries from Codex history without reading old transcript files.
- Verify that unknown Codex threads returned by `thread/list` are not inferred into Setta chat membership.
- Record whether Codex returns `threadSource` from `thread/list`, but do not make the design depend on that field. Current reference-runtime validation returns an empty value.
- Verify the startup and initialization path needed for experimental `thread/turns/list`, including capability flags if Codex requires them.
- Verify the writable Codex thread surface Setta will depend on:
  - `thread/name/set` for title changes
  - `thread/goal/get`, `thread/goal/set`, and `thread/goal/clear` for goal state
  - `thread/settings/update` and `thread/settings/updated` for linked-thread model and reasoning changes, including its experimental capability requirements and queued-ack behavior
- If linked-thread model or reasoning updates are unavailable, define the product behavior before implementation: model changes either apply only before thread creation, or they create a new Codex thread. Do not silently store a divergent linked-thread model in Setta overlay.
- Verify whether live Codex streaming events expose stable IDs that can be
  joined to persisted `thread/turns/list` or `thread/read` items after reload.
  Current reference-runtime validation shows live item IDs do not reconcile with
  persisted history, so activity overlay records must not require persisted item
  IDs.
- For activity records that Codex does not persist as items, define a
  deterministic turn-scoped overlay presentation key from live provider/request
  IDs before implementation. Do not rely on event arrival order unless it is
  persisted as explicit sequence metadata.
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
- Keep row keys stable from Codex IDs for persisted transcript items, for
  example `threadId:turnId:itemId`. For overlay-only command/tool/approval
  details whose live item IDs do not appear in history, use the Setta activity
  overlay key `threadId:turnId:activityKind:liveProviderOrRequestId`.
- Make unsupported Codex item variants explicit in the adapter with typed exhaustiveness checks.
- Add fixture-based adapter tests using representative Codex `Thread`, `Turn`, and `ThreadItem` payloads.

## Phase 3: Setta Storage Remodel

Replace Setta's chat transcript store with a narrow overlay store.

- Delete Setta message, conversation transcript, run, run item, and output persistence methods for Codex-backed chats.
- Remove filesystem paths that persist duplicated Codex transcript content under `~/.setta`.
- Remove Setta `goal.json` persistence for Codex-backed chats; goal state should come from Codex goal APIs.
- Keep a new overlay storage area only for Setta-owned state, such as:
  - non-transcript workspace/thread index records
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
  - required keys: workspace ID, Codex thread ID, Setta surface (`user`, `workflow`, `semantic_cartographer`, or another explicit internal surface), workspace root/cwd used for discovery, and local list metadata
  - allowed payloads: selected state, pin state, read markers, hidden/workflow-owned flags, local ordering hints, and last successful discovery metadata
  - prohibited payloads: user prompt text, assistant message text, command output, tool output, and Codex-persisted transcript item bodies
- Scope activity overlay records narrowly:
  - required keys: Codex thread ID, Codex turn ID, stable turn-scoped live provider/request key, activity kind, timestamps, and status
  - allowed payloads: shell command text, stdout/stderr, tool invocation details, approval prompts/decisions, tool lifecycle metadata, file-change details, and error details not durably exposed by Codex
  - prohibited payloads: user prompt text, assistant message text, Codex-persisted transcript item bodies, and any second copy of Codex-owned thread or turn history
- Remove corrupt-state diagnostics and tests that only apply to the deleted transcript store.
- Add tests that prove overlay records never contain user prompt text, assistant response text, or duplicated Codex-persisted item output.

## Phase 4: Backend Chat Service

Rebuild chat service reads around Codex history projection.

- `ListConversations` should read Setta thread index records for the workspace and requested surface, then hydrate those Codex thread IDs from Codex history APIs.
- Use Codex `thread/list` in the foreground or background to validate that indexed threads still exist and to refresh Codex-owned metadata when useful. Unknown Codex threads returned by `thread/list` must not be inferred into Setta chat membership.
- The Setta thread index is allowed to satisfy membership and visibility reads. It is not allowed to satisfy transcript reads by itself.
- `LoadMessagePage` should call Codex `thread/turns/list` and return a projected transcript window.
- Starting a new user chat should call Codex `thread/start`, optionally include Setta `threadSource` provider metadata, write a Setta thread index record with surface `user`, then start the first turn.
- Starting a workflow-agent or internal chat should call Codex `thread/start`, optionally include Setta `threadSource` provider metadata, write a Setta thread index record with the explicit internal surface, then start the first turn.
- If the thread index write fails after `thread/start`, fail the Setta chat creation path and do not start the first turn.
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
- Use stable row keys from Codex thread/turn/item identity for persisted
  transcript items, and from Codex thread/turn plus Setta activity overlay key
  for command/tool/approval details that Codex history omits.
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
  - Setta activity overlay IDs are used only for Setta-owned command/tool/approval detail records that Codex does not persist; key them by Codex thread, Codex turn, and turn-scoped live provider/request ID, not by a presumed persisted Codex item ID.
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
- Add tests proving the Setta thread index contains no transcript text and is the only source of Setta chat membership and user/internal classification.
- Add reset tests proving that deleting the Setta thread index removes Setta chat membership and does not infer workflow/internal or unknown Codex threads into the user chat list.
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

- New Codex-backed chats are visible in Setta from the Setta thread index and readable from Codex `thread/turns/list` or `thread/read`.
- `~/.setta` no longer contains duplicated Codex user messages, assistant messages, or Codex-persisted item output.
- `~/.setta` no longer contains Codex-backed `goal.json`; Codex thread goal APIs own goal state.
- `~/.setta` may contain Setta activity overlay records for command/tool/approval details that Codex does not durably expose.
- `~/.setta` may contain a Setta thread index with Codex thread IDs, Setta surface classification, and local UI metadata, but no transcript text.
- Deleting Setta app data resets Setta chat membership, user/internal classification, local UI metadata, queues, and activity overlays. Matching Codex raw history may remain in `~/.codex`, but it is not automatically surfaced as Setta chats.
- Deleting Setta app data does not cause workflow/internal Setta threads to appear as user chats, because Setta does not infer chat membership from Codex history alone.
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
- Because Codex does not durably return the Setta `threadSource` marker from `thread/list`, Setta membership and visibility depend on the Setta thread index. Losing that index resets Setta's chat list even though raw Codex history may still exist.
- `thread/list` cannot server-filter by `threadSource`; use it to validate or refresh indexed Codex threads, not to infer Setta ownership.
- The activity overlay join cannot assume live streamed item IDs appear in persisted history. Phase 0 must either prove the selected runtime reconciles those IDs or use deterministic turn-scoped live provider/request IDs for overlay presentation before old persistence is removed.
- If Codex later durably exposes the same activity details, transfer ownership to Codex by deleting the overlapping Setta fields rather than adding a dual-read compatibility path.
