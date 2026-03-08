# Go Backend Rewrite Plan

## Goal

Plan a full backend rewrite from Python to Go without treating this as a simple web API port.
The current backend is a large stateful runtime with:

- 34 router modules under `backend/setta/routers/`
- 317 route enum entries in `backend/setta/types/routes.py`
- 373 backend test files under `tests/`
- heavy custom logic around project state, websockets, MCP, LSP, plugins, terminals, and multi-mode runtime behavior

This rewrite is a clean break. We can reuse good ideas from the current backend, but we do not need backward compatibility, legacy route preservation, storage migrations, or Python-shaped internal structure.

## Dependency Bar

Prefer the Go stdlib or well established Go libraries for this rewrite.

- obscure Go libraries are not acceptable by default
- when a library choice is not obviously well established, the phase doc should
  justify why a stdlib or more established option is insufficient
- if the current repo already contains an obscure library, treat it as current
  technical debt rather than as a signal to add more of them
- the earlier `github.com/aquasecurity/go-pep440-version` plugin-compatibility
  debt has now been removed; do not reintroduce a replacement dependency there
  without a documented reason

## Current Status

As of 2026-03-10, the phase docs through the current landed Phase 18 slices
and the recorded spike outcomes describe a repo state where the deployment/
launcher runtime slices, the shipped CLI migration slices, the MCP/tooling
foundations, the bounded plugin runtime surface, the direct frontend LLM
settings transport, the direct app-gen skills/custom-skill transport, the
chat-section persistence transport, managed chat hydrate/stop transport, the
bounded managed `/getLLMResponse` send owner/route foundation, and the managed
live chat runtime/websocket stream foundation are complete for their bounded
scopes.

That does not mean the full backend runtime is fully Go-owned. User-facing
AI/chat transport is now Go-owned for the current direct frontend managed and
external route surface, and managed OpenAI text execution is now wired through
Go as well. The rewrite still does not plan to recreate a broad
LiteLLM-equivalent managed runtime in Go. The remaining managed-chat
follow-on is now narrower: any broader preview-kind coverage beyond the
landed app-spec patch `tool_argument_preview_delta` path and landed managed
`AIFollowToolResultUpdate` path, plus any concrete provider/runtime addition
needed to expose managed reasoning output beyond the landed explicit-config /
explicit-reject backend behavior. Current project-chat and section-chat
callers now gate managed `thinking` off instead of defaulting into backend
rejection behind the landed `/getLLMResponse` send owner, the landed managed
live chat runtime, the bounded OpenAI executor, and the bounded MCP tool
path.

The separate transcription-session runtime is now Go-owned for the current
direct frontend caller surface. `internal/transcriptionsessions`, thin AI route
transport, and real IDE app wiring now cover file-mode and bounded OpenAI
realtime session ownership, with `transportMode=auto` resolved from explicit
provider/model capability instead of heuristic fallback.

The adjacent dormant chat-section read route is now also Go-owned. Thin IDE
project transport now serves `POST /getChatSectionChatId` over an explicit
`internal/chatsections` service that validates stored section `chatId` values
against the durable agent-run index and clears stale project-state values when
the chat no longer exists.

The first Phase 18 slice is now landed for the adjacent project-state-backed
chat-section persistence cluster:

- `/setChatSectionSettings`
- `/setChatSectionState`
- `/setChatSectionChatId`

The second Phase 18 slice is now landed for the direct managed-chat hydrate /
stop reads over the landed managed-run foundations:

- `/getLLMChat`
- `/stopLLMChat`

The third Phase 18 slice is now landed for the managed send owner and
`/getLLMResponse` route dispatch foundation:

- managed `setta_llm` request validation, history shaping, and prompt shaping
- thin managed/external route dispatch by engine type
- explicit `503` behavior while the managed executor remains unavailable

The fourth Phase 18 slice is now landed for the managed live chat runtime and
websocket stream foundation:

- Go `LLMStreamingResponse` websocket message types in `internal/realtime`
- concrete live managed chat overlay/store in `internal/managedchat`
- managed runtime lifecycle hooks in `internal/agentruns.Runtime`

The fifth Phase 18 slice is now landed for the first bounded managed provider
executor:

- bounded `internal/managedllm` OpenAI chat-completions executor
- real IDE app wiring for managed `/getLLMResponse` and managed
  `startAgentRun`
- stop/cancellation ordering that preserves partial outputs on managed stops

The sixth Phase 18 slice is now landed for bounded managed MCP tool
execution:

- per-call MCP request metadata in `internal/mcpx.Client`
- bounded OpenAI tool-call streaming and follow-up looping in
  `internal/managedllm`
- persisted assistant `tool_calls` plus tool-result transcript support
- real IDE app coverage for managed chats calling the internal Setta MCP
  server through the shared MCP client/runtime

The seventh Phase 18 slice is now landed for bounded managed tool-preview
parity:

- shared Go tool-preview metadata in `internal/tools.Metadata`
- MCP server/client propagation of `toolArgumentPreview` metadata for internal
  Setta tools
- bounded managed `tool_argument_preview_delta` emission for
  `stream_app_definition` over streamed OpenAI tool-call arguments
- real IDE app websocket coverage proving the existing frontend preview
  consumer path now receives managed app-spec patch preview deltas

The eighth Phase 18 slice is now landed for bounded transcription-session
file-mode ownership:

- Go-owned `POST /startTranscriptionSession`,
  `POST /appendTranscriptionAudio`, `POST /stopTranscriptionSession`, and
  `POST /cancelTranscriptionSession`
- scoped IDE in-memory transcription session ownership in
  `internal/transcriptionsessions`
- file-mode PCM16 buffering, WAV conversion, stop-time provider upload, and
  typed route error mapping
- real IDE app wiring plus cleanup-loop ownership for inactive sessions

The ninth Phase 18 slice is now landed for bounded transcription-session
realtime ownership:

- bounded OpenAI realtime websocket session setup in
  `internal/transcriptionsessions`
- append/commit streaming plus background event reads for incremental
  transcript deltas
- final stop-time drain with accumulated `fullText`
- explicit `unsupported_model` mapping for stale or invalid explicit realtime
  profiles
- capability-driven `transportMode=auto` resolution without Python-style
  heuristic realtime-to-file fallback

The tenth Phase 18 slice is now landed for the current managed thinking
availability boundary:

- project chat now hides the thinking control for managed `setta_llm` engines
- managed project-chat and section-chat send/edit paths now force
  `thinking=false` for the current Go-managed runtime
- normal managed callers no longer default into typed
  `thinking_unsupported` failures while managed visible reasoning remains
  unimplemented

The eleventh Phase 18 closeout slice is now landed for the adjacent dormant
chat-section read transport:

- Go-owned `POST /getChatSectionChatId` route registration and thin transport
- explicit chat-section read owner over project-state payload lookup plus
  durable run-index validation
- stale section `chatId` clearing through the existing project-state mutation
  path when no durable chat run remains

With those Phase 18 slices landed, the next caller-backed direct frontend gap
is no longer in AI/chat. The post-Phase-18 rerank now selects the
project-shell route cluster as the next executable phase:

- project boot/load routes
- project create/save/delete/rename routes
- notification read/delete routes

The adjacent git read cluster remained caller-backed but separate, and dormant
listener-chat plus detached-run routes remained explicitly out of scope until a
real caller changed that rerank.

The first Phase 19 slice is now landed for project-shell read ownership:

- Go-owned `POST /loadAllProjectMetadata`
- Go-owned `POST /loadProjectConfig`
- explicit `internal/projectshell` read owner over the landed
  `projectstate` runtime and `projectview` projection
- deterministic project-config lookup by name with explicit ambiguity
  rejection instead of heuristic or incidental ordering
- thin `internal/httpapi` transport plus real IDE app wiring and focused
  service/route/app coverage

The second Phase 19 slice is now landed for project-shell rename and
notification ownership:

- `POST /setProjectConfigName`
- `POST /getNotifications`
- `POST /deleteNotification`
- explicit `internal/projectstate` project-name validation/mutation with trim,
  reserved-name rejection, and slug-collision rejection
- explicit `internal/notifications` persisted read/delete ownership
- real IDE app websocket `UpdateFrontendProjectState` plus
  `AllProjectMetadata` rename broadcasts for the active shell caller

The third Phase 19 slice is now landed for project-shell save and lifecycle
ownership:

- `POST /saveProject`
- `POST /createProjectConfig`
- `POST /saveAsNewProjectConfig`
- `POST /deleteProjectConfigs`
- explicit `internal/projectstate` create/clone/delete helpers plus
  deterministic default-project reconciliation
- explicit `internal/projectshell` lifecycle ownership with injected metadata,
  save-notification, and delete-cleanup hooks
- real IDE app metadata refresh, non-temporary `"Saved!"` notification
  broadcast, and delete-time terminal reclamation

With that third slice landed, the caller-backed Phase 19 project-shell route
cluster is now Go-owned for the current clean-break scope. The adjacent git
read cluster was then the highest-leverage next direct-frontend phase.

The first Phase 20 slice is now landed for bounded git repo/status/diff
ownership:

- Go-owned `POST /git/status`
- Go-owned `POST /git/diff`
- explicit `internal/gitread` owner for repo discovery, bounded git CLI
  execution, porcelain-v2 status parsing, literal pathspec/file validation,
  and synthesized untracked-file diffs
- thin `internal/httpapi` transport plus real IDE app wiring and focused
  service/route/app coverage

With that first Phase 20 slice landed, the remaining caller-backed git gap is
now the history slice:

- `POST /git/log`
- `POST /git/commitDetails`
- `POST /git/commitFileDiff`

The second Phase 20 slice is now landed for bounded git history ownership:

- Go-owned `POST /git/log`
- Go-owned `POST /git/commitDetails`
- Go-owned `POST /git/commitFileDiff`
- explicit `internal/gitread` owner for bounded log pagination, revision and
  commit validation, commit metadata projection, decoration fallback, and
  historical file diff reads
- thin `internal/httpapi` transport plus real IDE app wiring and focused
  service/route/app coverage

With that second slice landed, the caller-backed Phase 20 git-read route
cluster is now Go-owned for the current clean-break scope.

The first post-git rerank was later corrected. A deeper caller audit found
that the artifact and workspace file-browser route cluster is still actively
caller-backed and still Python-owned for the current frontend surface:

- workspace file-browser reads, writes, transfers, and token-backed downloads
- binary payload download for file previews and editors
- artifact import/update/delete for chat attachments and param/dropzone flows
- cached artifact reads for image/chart/draw-area callers

That corrected rerank is recorded in
`phase-21-post-git-direct-frontend-route-inventory-and-rerank.md`, and the
current direct-frontend implementation plan is now Phase 22:

- `phase-22-artifact-and-file-browser-route-cluster-plan.md`
- `phase-22-ide-artifact-owner-plan.md`

The first Phase 22 slice is now landed for the workspace file-browser and
download surface:

- Go-owned `POST /checkIfFileExists`
- Go-owned `POST /checkWorkspaceInitialized`
- Go-owned `POST /getFileBrowserRoot`
- Go-owned `POST /getFolderContents`
- Go-owned `POST /getFileBrowserDownloadUrls`
- Go-owned `POST /getFileBrowserFileContent`
- Go-owned `POST /getFileBrowserFileStat`
- Go-owned `POST /writeFileBrowserFileContent`
- Go-owned `POST /transferFileBrowserEntry`
- Go-owned `GET /fileBrowser/{token}`
- Go-owned bounded IDE `GET /binary/{contentId}`
- explicit `internal/filebrowser` runtime ownership for workspace path
  normalization, Setta-root suppression, initialization checks, file-content
  read/write, transfer semantics, and token-backed downloads
- thin `internal/httpapi` transport plus real IDE app wiring and focused
  service/route/app coverage

The second Phase 22 slice is now landed for the bounded IDE artifact owner:

- `POST /importFilesToArtifacts`
- `POST /loadCachedImageArtifacts`
- `POST /loadCachedChartData`
- `POST /loadCachedBrushStrokes`
- `POST /loadDrawAreaLayerItemTransform`
- `POST /updateArtifacts`
- `POST /deleteArtifacts`
- explicit `internal/artifacts` ownership for state-relative artifact ids,
  workspace imports, cached reads, active caller-backed writes, and file
  deletes
- thin `internal/httpapi` transport plus real IDE app wiring and focused
  service/route/app coverage
- bounded write support for `File`, `BrushStroke`, and
  `DrawAreaLayerItemTransform`
- typed unsupported-artifact behavior for `Image` and `ChartData` updates in
  this slice

The third and final Phase 22 slice is now also landed for the remaining
deployment/share artifact overlay behavior:

- `POST /loadCachedImageArtifacts`
- `POST /loadCachedChartData`
- `POST /loadCachedBrushStrokes`
- `POST /loadDrawAreaLayerItemTransform`
- `POST /updateArtifacts`
- `POST /deleteArtifacts`
- explicit `internal/shareartifacts` ownership for per-session overlay reads,
  in-memory updates/deletes, deployment-relative ids, and session cleanup
- thin `internal/httpapi` deployment transport plus real app wiring and
  focused service/route/realtime/app coverage
- share-session-scoped `UpdateArtifacts` websocket broadcasts for non-file
  deployment updates

With that third slice landed, the caller-backed Phase 22 artifact/file-browser
cluster is now Go-owned for the current surface.

The post-Phase-22 rerank is now also recorded in
`phase-23-post-artifact-direct-frontend-route-inventory-and-rerank.md`.
That rerun confirmed that there is no new caller-backed direct frontend route
cluster to open after the landed Phase 22 closeout:

- the suspicious live frontend route families found in the rerun already map
  to landed Go ownership from earlier phases, especially terminal/deployment
  run transport, deployment publish/list transport, launcher/workspace-launch
  transport, plugin transport, and status/meta reads
- the remaining obvious gaps are now capability-level or broader runtime
  inventory questions, not another thin direct-frontend route-cluster phase

The next recommended step is therefore a broader rerank outside the now-closed
direct frontend route-cluster track.

That broader rerank is now also recorded in
`phase-24-caller-backed-capability-gap-inventory-and-rerank.md`.
The current evidence still does not select a new backend implementation phase:

- `runCode` CLI-output fallback remains degraded in Go, but it has no current
  frontend caller
- managed agent-run / run-chain unavailability remains explicit in Go, but
  current frontend code only uses the already-landed read surface
- the remaining unsupported artifact write types are not used by current live
  update callsites
- several visible `unsupported` / `unavailable` states are already the
  intended clean-break product boundary, not hidden route debt

The roadmap should therefore stay honest here: there is no new caller-backed
backend slice to open until a concrete product surface or runtime gap changes
that evidence.

The broader ownership rerank is now also recorded in
`phase-25-remaining-python-ownership-inventory-and-rerank.md`.
That pass confirmed that the remaining rewrite surface is no longer backend
route/runtime ownership at all:

- packaged backend/runtime and shipped command semantics are already Go-owned
- the remaining meaningful Python ownership is concentrated in
  `backend/setta/start.py` legacy fallback/startup behavior plus source/dev
  and distribution/install workflow glue
- if rewrite work continues, the next track is therefore legacy startup and
  distribution boundary work, not another backend phase

That broader track is now narrowed one step further by the landed Slice 1
classification in
`phase-25-startup-test-surface-classification-and-source-of-truth.md`:

- active packaged/distribution tests are now separated from source/dev workflow
  tests and from legacy fallback coverage
- the next honest implementation step is therefore not broad `start.py`
  cleanup; it is Phase 25 Slice 2 source/dev startup contract hardening over
  the current Go-owned command boundary
- direct `setta.start` / `setta.launch` / `setta.ssh_*` test coverage should
  now be treated as legacy fallback by default unless a current workflow still
  proves it necessary

The first bounded Slice 2 step is now also landed:

- `frontend/backendStart.sh` no longer defaults to the stale venv `setta` shim
- normal dev startup now routes through `python -m setta`
- reload now routes through the explicit dev-only `python -m setta.dev_start`
  owner instead of `setta.start.cli`
- the active Phase 25 source/dev startup gap is therefore closed for the
  current workflow surface
- the next Phase 25 question, if rewrite work continues, is Slice 3 inventory
  of which remaining `backend/setta/start.py` branches are still reachable at
  all

That Slice 3 inventory is now also recorded in
`phase-25-start-py-reachability-inventory-and-rerank.md`.
The current reachability evidence is now narrower than the file size of
`backend/setta/start.py` suggests:

- active source/dev startup no longer routes through `setta.start`
- command-specific shipped paths continue to dispatch through the Go-owned
  packaged command surface
- the remaining active packaged fallback into `setta.start` is concentrated at
  root help, bare `plugins`, and unknown-command / unknown-flag handling in
  `backend/setta/entrypoint.py`
- direct `tests/start/*` imports of `setta.start` remain legacy anchor
  coverage rather than proof of active workflow reachability

The next honest Phase 25 decision is therefore no longer "clean up
`start.py` broadly". It is whether to open one narrow fallback-hardening slice
for that small root-level edge set or to move directly to the distribution /
install workflow track.

That narrow packaged-entrypoint fallback-hardening slice is now also landed in
`phase-27-packaged-entrypoint-fallback-hardening-plan.md`:

- `backend/setta/entrypoint.py` now dispatches root help, bare `plugins`,
  `plugins lock`, and invalid root argv shapes to the packaged Go binary
- `internal/settacmd` now owns explicit root/plugins/lock help rendering and
  usage-once invalid argv handling for that packaged boundary
- the packaged `python -m setta` shim no longer keeps a live branch back into
  `setta.start`
- focused Go and Python regression coverage now guards the module-entrypoint
  fallback boundary without reopening broad Click parity work

That distribution/install follow-on is now narrowed in
`phase-25-distribution-install-workflow-retargeting-plan.md`.
The first bounded Slice 4 target is not a packaging-format rewrite. It is
wrapper convergence around the already-landed explicit package-builder
boundary:

- keep Python sdist/wheel artifacts as the deliberate distribution format
- treat `scripts/build_python_distribution_with_go_binaries.sh` as the
  canonical local/release package builder
- retarget root wrappers like `build.sh` around that boundary before touching
  broader release/install glue

The first Slice 4A sub-slice is now also landed:

- `scripts/build_python_distribution_with_go_binaries.sh` now supports a
  reusable `--skip-cleanup` mode for callers that have already prepared build
  inputs
- `build.sh` now stages frontend/static assets and then delegates package
  building to that shared helper instead of calling `python -m build`
  directly
- focused `tests/start/test_distribution_script_wiring.py` coverage now guards
  the root wrapper contract plus the shared helper behavior

The second Slice 4A sub-slice is now also landed:

- `scripts/lib/distribution_artifact_path.sh` now owns single-artifact
  resolution for built distribution wrappers
- `verify_install.sh` and `install_built_setta.sh` now share that helper
  instead of carrying separate `find` / shell-glob artifact selection logic
- those wrappers now fail fast when zero or multiple matching artifacts exist
  instead of guessing
- focused helper and wrapper integration coverage now lives in
  `tests/start/test_distribution_artifact_path_script.py` plus the expanded
  `tests/start/test_distribution_script_wiring.py`

The third Slice 4A sub-slice is now also landed:

- `build_and_upload.sh` now has an explicit repo-root boundary plus
  cleanup-on-exit behavior that preserves real upload failure status
- `verify_install.sh` now also cleans on failure instead of only on success
- focused wrapper integration coverage now guards those failure paths

That post-Phase-25 rerank is now recorded in
`phase-26-post-startup-and-distribution-ownership-rerank.md`.
The current evidence from the landed wrapper cleanup, release/native-installer
scripts, and existing focused coverage does not select another implementation
slice:

- repo-root build/install/publish wrappers are now explicit and tested
- native-installer build/smoke workflows already depend on the Go-owned
  launcher command surface plus the shared packaged-distribution builder
- the remaining shell/PowerShell and Python role is now mostly deliberate
  packaging and OS-integration glue rather than hidden backend ownership debt

The next honest outcome is therefore a closeout boundary, not another
speculative phase. Reopen this area only when a concrete release/install
failure mode or packaging-boundary decision changes that evidence.

Dormant listener-chat routes, detached-run routes, and non-caller-backed
default-project routes still remain out of scope until a concrete caller
changes that rerank.

The current bounded Go-owned Phase 12 surface now includes:

- `internal/externalagentconfigs`
  - read access to `external_agents.json`
  - bounded preflight checker interface and a minimal concrete checker
  - Claude bridge preflight for Claude CLI resolution plus repo-pinned Python
    `claude-agent-sdk` availability
  - typed OpenCode-managed `settingsManagedBlock` reads for model /
    permission / MCP config
- `internal/externalagents`
  - persisted external-run lookup, latest-run selection, durable chat-state
    reconstruction, placeholder filtering, and context-usage normalization
  - active-run registry, live chat overlay storage, cancellation ownership, and
    approval-response and question-response dispatch foundations
  - external-agent AI-follow snapshot ownership, MCP-metadata-driven follow-id
    extraction, websocket `AIFollowToolArgumentsUpdate` broadcast, and
    canonical temporary-id resolution over active runtime state
  - external-agent send-path validation, history shaping, persisted running-run
    creation, and runtime activation foundations
  - real Codex app-server execution, approval production, terminal
    completion/failure persistence, and same-chat `threadId` continuity
  - real OpenCode sidecar execution, bounded runtime `opencode.json`
    generation, terminal completion/failure persistence, and same-chat
    `sessionId` continuity
  - real Claude SDK sidecar execution, bounded `.claude/settings*.json`
    ownership, terminal completion/failure persistence, approval/question
    routing, and same-chat `sessionId` continuity
- `internal/httpapi/ai_routes.go`
  - thin Go transport for:
    - `/getLLMResponse` (managed and external dispatch; managed now executes
      through the bounded OpenAI executor and bounded MCP tool path)
    - `/getExternalAgentChat`
    - `/getAIFollowSnapshot`
    - `/stopExternalAgentRun`
    - `/respondExternalAgentApproval`
    - `/respondExternalAgentQuestion`

The tracked Phase 12 work is recorded across
`phase-12-managed-chat-runtime-and-ai-route-foundation.md` and the focused
follow-on slice docs under this folder. The external-agent runtime, execution,
parity, attachment, prompt, and AI-follow slices are now landed for their
bounded scopes.

The completed `phase-12-codex-app-server-executor-runtime.md` and
`phase-12-opencode-executor-and-question-runtime.md` plus the now-completed
`phase-12-claude-sdk-bridge-executor-runtime.md` slices prove the runtime split
with real Codex, OpenCode, and Claude execution plus Go-owned active
question-response transport. The first Codex-first parity closeout slice is now
also landed in
`phase-12-codex-rich-item-tool-result-and-mcp-status-parity.md`:

- richer Codex `response_item` handling for reasoning, tool calls, and tool
  results
- Go-owned external MCP runtime-status snapshot persistence and IDE-route
  readback

The bounded OpenCode follow-on tracked in
`phase-12-opencode-rich-item-tool-result-and-mcp-status-parity.md` is now
landed:

- richer OpenCode tool-result persistence over the shared runtime helpers
- OpenCode external MCP runtime-status seeding and persisted snapshot parity

The bounded Claude follow-on tracked in
`phase-12-claude-rich-item-tool-result-and-mcp-status-parity.md` is now
landed:

- Claude streamed `tool_result` persistence plus persisted `tool_result` run
  events
- Claude external MCP runtime-status seeding from `mcpConfig`, runtime capture
  from SDK `system_message`, and persisted snapshot parity

The bounded Codex follow-on tracked in
`phase-12-codex-raw-tool-item-parity.md` is now also landed:

- Codex raw non-`response_item` tool-item persistence for command execution,
  file changes, MCP tool calls, and the Python-tracked generic item types
- buffered command/file output-delta aggregation when terminal item payloads
  omit aggregated output or diff fields
- persisted `tool_result` run events for those raw Codex tool outputs

The bounded follow-on tracked in
`phase-12-external-agent-prompt-and-app-generation-parity.md` is now also
landed:

- external agent-profile `systemPrompt` content now reaches Go-owned external
  runs through the shared executor `systemPrompt` payload
- external app-generation-mode prompt sections and reference-image prompt
  inputs now reach Go-owned external runs with Go-owned normalization and typed
  validation

The bounded follow-on tracked in
`phase-12-external-agent-attachment-payload-parity.md` is now also landed:

- external-agent runs now build `attachmentText`,
  `attachmentTextNoImages`, and `attachmentUrls` from chat message
  attachments in Go
- Go now exposes the token-backed attachment download route required by those
  external-agent URLs

The bounded follow-on tracked in
`phase-12-external-agent-ai-follow-snapshot-and-realtime-parity.md` is now
also landed:

- external-agent AI-follow snapshot state is now Go-owned through
  `/getAIFollowSnapshot`
- live external-agent `AIFollowToolArgumentsUpdate` websocket behavior is now
  Go-owned over the active runtime's canonical tool-argument state
- approval/question responses plus run stop/teardown now clear follow state
  through the same argument-update channel the frontend already consumes

The subsequent closeout inventory then found and closed one last concrete
external-agent dependency in
`phase-12-agent-run-list-read-transport-closeout.md`:

- the frontend now reads `GET /getAgentRuns` from Go before external stop and
  for agent-run-backed history/overview surfaces
- that transport is thin and store-backed over `internal/agentruns.RunStore`

Phase 12's tracked external-agent scope is therefore complete for the current
rewrite boundary. A short rerun after the landing confirmed that the remaining
frontend Python-owned agentic reads are now outside that boundary:

- `GET /getAgentProfiles`
- `GET /getPromptTemplates`
- `GET /getAgenticSummaryCacheStatus`

Those routes were later moved under bounded Phase 13 docs. They are no longer
a hidden external-agent blocker, and the direct app-start hydration plus direct
settings mutation surface discussed below is now Go-owned for the current
bounded scope.

The first post-Phase-12 bounded slice tracked in
`phase-13-agent-profile-read-transport.md` is now landed:

- the frontend now hydrates `GET /getAgentProfiles` from Go over the canonical
  `agent_profiles.json` store
- prompt-template transport and agentic summary-cache status remain deferred to
  later bounded slices because they need different source-of-truth owners

The next bounded post-Phase-13 slice tracked in
`phase-13-prompt-template-read-transport.md` is now landed:

- the frontend now hydrates `GET /getPromptTemplates` from Go
- Go now owns the file-backed prompt-template read owner for
  `setta_files/prompts/*.json`
- `GET /getAgenticSummaryCacheStatus` remained the next bounded dependency
  because it needs a different runtime owner than the prompt-template file path

The next bounded post-Phase-13 slice tracked in
`phase-13-agentic-summary-cache-status-transport-and-owner.md` is now landed:

- the chat-area settings UI now reads
  `POST /getAgenticSummaryCacheStatus` from Go
- Go now owns the bounded summary-cache-status owner over the live
  project-state runtime plus `setta_files/agentic_summary_cache.json`
- the follow-up prompt-template CRUD slice is now landed in
  `phase-13-prompt-template-crud-transport.md`

The next bounded post-Phase-13 slice tracked in
`phase-13-prompt-template-crud-transport.md` is now landed:

- Go now owns:
  - `POST /createPromptTemplate`
  - `POST /updatePromptTemplate`
  - `POST /deletePromptTemplate`
- prompt-template transport is now fully Go-owned for the current direct
  frontend surface over the existing prompt-template file store
- the closeout rerun corrected an earlier stale inventory in the Phase 13 docs:
  prompt-template writes were not the last remaining direct frontend Python
  agentic routes

The next bounded post-Phase-13 slice tracked in
`phase-13-external-agent-config-and-health-read-transport.md` is now landed:

- Go now owns:
  - `GET /getExternalAgentConfigs`
  - `GET /getExternalAgentHealth`
- the frontend now hydrates external-agent config list and availability from Go
  over the landed config store and bounded checker
- richer Python-only plugin/env-var/cache preflight semantics remain deferred
  instead of being silently bundled into this read slice
- at that point, the current remaining direct frontend Python-owned agentic
  routes were:
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`

The next bounded post-Phase-13 slice tracked in
`phase-13-engine-config-read-transport.md` is now landed:

- Go now owns:
  - `GET /getEngineConfigs`
- the frontend now hydrates engine-config list state from Go over the landed
  file-backed `internal/agentruns.EngineStore`
- the Go route intentionally stays IDE-gated for the current bounded settings
  surface instead of preserving Python's broader read exposure without a
  concrete caller
- at that point, the current remaining direct frontend Python-owned agentic
  routes were:
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`

The next bounded post-Phase-13 slice tracked in
`phase-13-transcription-profile-read-transport-and-capability-owner.md` is now
landed:

- Go now owns:
  - `GET /getTranscriptionProfiles`
- the frontend now hydrates transcription-profile list state from Go over a new
  bounded transcription-profile store/service owner
- `supportsRealtimeTranscription` now comes from live Go LLM config resolution
  on every read instead of trusting the stored profile payload
- the Go route intentionally stays IDE-gated for the current bounded settings
  surface instead of preserving Python's broader read exposure without a
  concrete caller
- at that point, the current remaining direct frontend Python-owned agentic
  routes were:
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`

The next bounded post-Phase-13 slice tracked in
`phase-13-engine-config-update-transport.md` is now landed:

- Go now owns:
  - `POST /updateEngineConfig`
- the frontend now updates engine-config state from a Go-owned mutation route
  over the landed `internal/agentruns.EngineStore`
- websocket `EngineConfigsUpdated` parity remains intentionally deferred
  because the current direct callers already update local state from the
  mutation response
- at that point, the current remaining direct frontend Python-owned agentic
  routes were:
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`

The next bounded post-Phase-13 slice tracked in
`phase-13-agent-profile-crud-transport.md` is now landed:

- Go now owns:
  - `POST /createAgentProfile`
  - `POST /updateAgentProfile`
  - `POST /deleteAgentProfile`
- the frontend now mutates agent-profile state through Go-owned CRUD routes
  over the landed `internal/agentprofiles.Store`
- watcher and websocket fan-out remain intentionally deferred because the
  current Python route handlers do not broadcast directly and the current
  frontend callers already update local state from the mutation response
- at that point, the current remaining direct frontend Python-owned agentic
  routes were:
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`

The next bounded post-Phase-13 slice tracked in
`phase-13-transcription-profile-crud-transport.md` is now landed:

- Go now owns:
  - `POST /createTranscriptionProfile`
  - `POST /updateTranscriptionProfile`
  - `POST /deleteTranscriptionProfile`
- the frontend now mutates transcription-profile state through Go-owned CRUD
  routes over the landed `internal/transcriptionprofiles.Store` and
  `internal/transcriptionprofiles.Service`
- runtime config validation plus realtime-transport eligibility now stay
  source-of-truth in Go instead of in the route layer
- websocket `TranscriptionProfilesUpdated` parity remains intentionally
  deferred because the current direct callers already update local state from
  the mutation response

The next bounded post-Phase-13 slice tracked in
`phase-13-external-agent-config-crud-transport.md` is now landed:

- Go now owns:
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`
- the frontend now mutates external-agent config state through Go-owned CRUD
  routes over a new `internal/externalagentconfigs.Service` above the landed
  config store
- per-config Codex/OpenCode canonical settings-file sync and stale-artifact
  cleanup are now Go-owned at that same service boundary
- shared Claude `.claude/settings*.json` ownership and live plugin-adapter
  registry validation remain intentionally deferred instead of being bundled
  into generic config CRUD
- the direct frontend settings mutation surface tracked through Phase 13 is now
  Go-owned for the current bounded scope

The bounded closeout inventory tracked in
`phase-13-remaining-agentic-route-inventory-and-rerank.md` is now landed:

- the remaining Python-owned routes in `backend/setta/routers/agentic.py` no
  longer hide another direct Phase 13 settings or hydration blocker
- current leftover routes split into:
  - managed-agent / run-chain runtime routes tied to intentionally de-scoped
    managed `setta_llm` and Python runtime owners
- the next rewrite slice therefore had to come from an explicit
  product/runtime decision, not from assuming another automatic transport
  migration was still pending

The bounded follow-on tracked in
`phase-13-engine-config-create-delete-transport.md` is now landed:

- Go now owns:
  - `POST /createEngineConfig`
  - `POST /deleteEngineConfig`
- the dormant engine-config create/delete transport noted in the inventory is
  now Go-owned over the landed `internal/agentruns.EngineStore`
- websocket `EngineConfigsUpdated` parity remains intentionally deferred
  because there is still no concrete caller that requires it

The bounded follow-on tracked in
`phase-13-agentic-single-item-read-transport.md` is now landed:

- Go now owns:
  - `POST /getAgentProfile`
  - `POST /getPromptTemplate`
  - `POST /getExternalAgentConfig`
  - `POST /getEngineConfig`
- the remaining non-runtime single-item agentic transport is now Go-owned over
  the landed stores and service boundaries
- the remaining Python-owned agentic surface was reduced to:
  - `POST /getAgentRun`
  - `POST /startAgentRun`
  - `POST /stopAgentRun`
  - `POST /startRunChain`
  - `POST /stopRunChain`

The bounded follow-on tracked in
`phase-13-agent-run-read-transport-closeout.md` is now landed:

- Go now owns:
  - `POST /getAgentRun`
- the remaining Python-owned agentic surface is now runtime-only mutation
  work:
  - `POST /startAgentRun`
  - `POST /stopAgentRun`
  - `POST /startRunChain`
  - `POST /stopRunChain`

That remaining runtime-only surface is now tracked in
`phase-14-managed-agent-and-run-chain-runtime-mutation-plan.md`:

- the rewrite no longer treats those routes as hidden transport cleanup
- current Python behavior and the landed Go runtime foundations are now
  documented in one place before any further code work
- the clean-break recommendation is to reopen managed
  `start/stopAgentRun` first, only if a real caller or explicit product
  decision requires it
- run-chain remains a separate later runtime decision instead of being bundled
  into the first follow-on slice

The bounded follow-on tracked in
`phase-14-managed-agent-start-stop-runtime-and-transport.md` is now landed:

- Go now owns:
  - `POST /startAgentRun`
  - `POST /stopAgentRun`
- managed active-run registry, cancellation, and transport ownership now live
  in Go over the existing managed-run service foundations
- the route is intentionally managed-only in Go and rejects
  external-agent-backed profiles instead of preserving Python's hybrid
  dispatch behavior
- the remaining Python-owned agentic runtime mutation surface is now only:
  - `POST /startRunChain`
  - `POST /stopRunChain`

The next bounded follow-on is now opened in
`phase-14-run-chain-managed-runtime-and-transport.md`:

- the user explicitly requested runtime work proceed beyond managed
  `start/stopAgentRun`
- the next honest executable slice is managed-only run-chain ownership over a
  new Go run-chain runtime boundary above the landed managed runtime
- external-agent child-step orchestration is explicitly deferred instead of
  being silently reintroduced through this route

That bounded follow-on tracked in
`phase-14-run-chain-managed-runtime-and-transport.md` is now landed:

- Go now owns:
  - `POST /startRunChain`
  - `POST /stopRunChain`
- parent chain-run persistence, active task lifecycle, managed child-step
  orchestration, and stop cancellation now live in Go under
  `internal/runchains`
- the route is intentionally managed-only in Go and rejects
  external-agent-backed child steps instead of preserving Python's hybrid
  chain-step dispatch
- the next bounded follow-on was the external-agent child-step slice tracked in
  `phase-14-run-chain-external-agent-child-step-runtime.md`

That focused follow-on is now landed:

- `internal/externalagents.RunService` now owns non-chat external step start
  validation and executor launch over the existing runtime/executor boundary
- `internal/externalagents.Runtime` now exposes `WaitForRun(...)` so
  orchestration callers can block on terminal persisted state
- `internal/runchains` now dispatches child steps for both supported engine
  types instead of rejecting external-agent-backed steps
- thin run-chain transport stays unchanged apart from explicit external runtime
  / preflight error mapping
- the current bounded Phase 14 agentic runtime route surface is now Go-owned
  for both managed and external child-step execution

The practical next step is still not "rerun the early spikes" or broadly
re-decide the initial library choices. MCP, LSP, and file-state decisions are
already locked in practice by the current Go implementation. The PTY runtime
shape is also proven, and the bounded Unix PTY-library follow-up recorded in
`spike-pty.md` is now landed. New work should start from the remaining real
callers and product dependencies, not by reopening the completed external-agent
runtime or Phase 13 settings surfaces. The next bounded priority is no longer
inventory or transport cleanup; those are now complete. The
bounded agentic runtime route surface is also now complete for the current
clean-break scope. The closeout inventory tracked in
`phase-14-run-chain-caller-and-progress-closeout.md` then confirmed:

- there is still no live direct frontend caller for `startRunChain`,
  `stopRunChain`, or `getAgentRun`
- current frontend behavior depends on persisted `GET /getAgentRuns` polling
- Python itself did not expose a dedicated run-chain realtime channel beyond
  persisted run events and snapshots

New work here should now come only from a new caller-backed or product-backed
feature request, not from any remaining route/runtime ownership or parity gap.
The first bounded post-closeout stabilization slice is now also landed in
`phase-14-executor-fixture-stability-and-regression-hardening.md`:

- real subprocess-backed Codex/OpenCode/Claude executor lifecycle tests remain
  in place as the Go-side capability baseline
- those tests now run serially where they launch nested fixture processes, so
  the package keeps real adapter coverage without the earlier package-load
  flake

The next bounded post-Phase-14 frontend route slice tracked in
`phase-15-plugin-runtime-read-and-asset-transport.md` is now landed:

- Go now owns:
  - `GET /plugins/runtime`
  - `/plugins/{pluginId}/{assetPath:path}`
- `internal/plugins` now owns the direct frontend plugin runtime list/status
  payloads plus declared frontend asset resolution above the existing
  discovery/store foundations
- share/app source/config redaction for that direct frontend runtime payload is
  now Go-owned
- plugin mutation/config/restart HTTP routes and higher-level backend plugin
  registration payloads remain deferred as separate follow-on boundaries

The next bounded plugin follow-on tracked in
`phase-15-plugin-config-write-transport.md` is now landed:

- Go now owns:
  - `POST /plugins/config`
- `internal/plugins` now owns config validation and scoped persistence over the
  existing plugin discovery/store foundations

The next bounded plugin follow-on tracked in
`phase-15-plugin-restart-transport.md` is now landed:

- Go now owns:
  - `POST /plugins/restart`
- `internal/plugins` now owns the bounded optional programmatic-restart
  callback contract behind that route and the existing CLI surface
- the real app remains manual-only because no concrete restart hook is wired
  there yet

The caller-backed plugin lifecycle mutation cluster tracked in
`phase-15-plugin-lifecycle-mutation-transport.md` is now landed:

- Slice A is now landed:
  - Go now owns:
    - `POST /plugins/rescan`
    - `POST /plugins/enable`
    - `POST /plugins/disable`
- Slice B is now landed:
  - Go now owns:
    - `POST /plugins/install`
    - `POST /plugins/uninstall`
  - the real IDE app now wires the production candidate provider into the
    shared plugin service
- Slice C is now landed:
  - `POST /plugins/update`
  - `POST /plugins/rollback`
- the current caller-backed direct frontend plugin lifecycle transport is now
  complete for the bounded Phase 15 scope
- `POST /plugins/link` was not a current direct frontend caller, but it became
  a concrete plugin E2E/manual-flow dependency and landed as a bounded
  follow-on
- `POST /plugins/lock/*` remained the only deferred thin plugin transport after
  that closeout
- the next plugin follow-on, if and when a caller or later phase requires it,
  should target either:
  - the deferred non-caller `lock*` routes
  - the higher-level backend plugin runtime registration boundary

The first higher-level backend plugin runtime follow-on tracked in
`phase-15-plugin-backend-codegen-registration-runtime.md` is now landed:

- Go now owns worker-backed backend `registeredCodegenTargets` loading in
  plugin status/runtime payloads
- `internal/plugins` now starts the existing codegen worker runtime to collect
  backend codegen registrations and caches them by plugin runtime identity
- the real IDE app now wires the current-process worker runtime provider into
  that shared plugin-service registration path
- plugin-scoped backend registration failures now surface as
  `PLUGIN_BACKEND_REGISTER_FAILED` status errors instead of failing the entire
  runtime/status read

The bounded plugin local-link transport follow-on tracked in
`phase-15-plugin-link-transport.md` is now landed:

- Go now owns:
  - `POST /plugins/link`
- `internal/httpapi` now exposes thin IDE-only transport over the existing
  shared `internal/plugins` local-link service
- shared local-link results now include the install-style
  `sourceScopeLabel`, `trustStatus`, and `trustWarning` fields
- the route is now available for the existing plugin E2E/manual flows that use
  linked local fixtures

The bounded plugin lockfile transport follow-on tracked in
`phase-15-plugin-lock-transport.md` is now landed:

- Go now owns:
  - `POST /plugins/lock/write`
  - `POST /plugins/lock/apply`
- `internal/httpapi` now exposes thin IDE-only transport over the existing
  shared `internal/plugins` lockfile service
- missing-lockfile behavior now preserves the existing route contract by
  mapping `PLUGIN_LOCKFILE_NOT_FOUND` to HTTP 404 in Go
- the plugin HTTP transport surface tracked in Phase 15 is now complete for the
  current clean-break rewrite scope

The next higher-level backend plugin runtime follow-on tracked in
`phase-15-plugin-backend-language-server-and-external-agent-registration-runtime.md`
is now landed:

- Go now owns worker-backed backend registration loading in plugin
  runtime/status payloads for:
  - `registeredLanguageServers`
  - `registeredExternalAgentAdapters`
  - `registeredCodegenTargets`
- `internal/plugins` now uses one bounded backend registration loader instead of
  a codegen-only snapshot path
- worker host dispatch now normalizes and persists backend language-server and
  external-agent adapter registrations in addition to codegen registrations
- the real IDE app now wires that combined registration owner into plugin
  runtime/status reads
- bounded plugin-pane E2E coverage now exists for both plugin external-agent
  and plugin language-server runtime visibility
- full plugin-defined language-server execution/runtime ownership remains
  deferred to the later LSP/runtime phases

The bounded Phase 5 follow-on tracked in
`phase-5-plugin-language-server-code-section-runtime.md` is now landed:

- Go now owns:
  - top-level `Code` section creation for plugin-defined `codeLanguage`
    values
  - deterministic canonical bindings for active non-generated code sections
    across arbitrary languages
  - language-aware LSP routing for code-section diagnostics and
    `POST /codeAreaCompletion`
- backend-registration snapshots now absorb `register_router` calls so mixed
  backend plugins can still surface language-server registrations without
  broadening into full backend route serving
- shared LSP session processes now outlive the HTTP request context that first
  started them, which closes a real runtime ownership bug in the Go LSP
  service boundary
- focused app/runtime/route coverage and the real
  `plugin-language-server.spec.ts` Playwright caller now pass against the Go
  app
- full plugin backend route serving was kept separate from this Phase 5 slice
  and is now landed in the bounded Phase 15 follow-on below

That next higher-level plugin runtime follow-on tracked in
`phase-15-plugin-backend-route-runtime-and-transport.md`:

- Go now owns the first live IDE-only backend route runtime for plugins that
  call `register_router(...)`
- the real app now starts long-lived worker sessions for route-owning backend
  plugins at startup and serves `/api/plugins/{pluginId}/...` through
  `plugin.invoke_route`
- the active `plugin-backend-route-payload.spec.ts` caller now passes against
  the Go app
- plugin static-dir plus broader backend host surfaces remain explicitly
  deferred until a concrete caller requires them

The bounded plugin backend MCP follow-on tracked in
`phase-15-plugin-backend-mcp-tool-runtime.md` is now also landed:

- Go now owns plugin-defined backend MCP tool registration and invocation
  through the authenticated Go MCP server in IDE mode
- backend workers now send explicit tool metadata/schema payloads instead of
  the earlier partial `toolName`/`annotations` host request
- the backend runtime now keeps long-lived worker sessions for route-only,
  tool-only, and mixed route+tool plugins
- plugin listener-endpoint and broader backend-host runtime surfaces remain
  deferred until a concrete caller requires them

The bounded plugin backend static-dir follow-on tracked in
`phase-15-plugin-static-dir-runtime.md`:

- Go now owns worker-registered backend plugin static-directory registration
  and serving at `/plugin-static/{pluginId}/...` in IDE mode
- the backend runtime now reuses one startup boundary for route/tool/static
  plugins and only keeps worker sessions alive when later live calls are
  actually needed
- static-dir-only plugins now register, persist typed source roots, and close
  immediately instead of keeping an idle worker alive
- listener-endpoint dispatch and plugin runtime refresh remain deferred until a
  concrete caller requires one of those surfaces

The next bounded plugin backend follow-on tracked in
`phase-15-plugin-read-project-state-and-listener-registration-runtime.md`:

- Go now owns worker-host `host.read_project_state` plus
  `host.register_listener_endpoint` registration capture in IDE mode
- backend workers now read live project-state snapshots from the Go runtime for
  backend fixture route calls and MCP tool calls
- backend runtime startup now captures listener-endpoint registrations alongside
  routes, MCP tools, and static dirs
- backend worker listener emits now flow through the Go listener producer, which
  closes the remaining backend fixture transport gap under the Go runtime
- built-in endpoint-name conflict validation and mutation-time runtime refresh
  remained deferred at the end of that slice

The next bounded plugin backend follow-on tracked in
`phase-15-plugin-listener-endpoint-websocket-dispatch.md` is now also landed:

- Go now owns plugin listener-endpoint websocket dispatch on the existing
  `/ws/listeners/{listenerID}` route in IDE mode
- the listener websocket transport now routes
  `ListenerRouterEndpointCall` through the live Go backend runtime and returns
  `ListenerRouterEndpointResult`
- plugin listener payloads now inherit the canonical websocket project id when
  they omit `projectConfigId`, and mismatches fail explicitly before worker
  execution
- built-in listener endpoint dispatch, listener temporary-id negotiation, and
  mutation-time runtime refresh remain deferred until a concrete caller
  requires one of those surfaces

The bounded plugin backend runtime-refresh follow-on tracked in
`phase-15-plugin-backend-runtime-refresh-after-mutations.md` is now also
landed:

- Go now refreshes live IDE-mode plugin backend route/tool/static-dir/listener
  ownership after successful plugin-set mutations instead of leaving the
  startup snapshot in place
- backend plugin HTTP transport now resolves routes dynamically against the
  current runtime so install/remove/enable/disable changes no longer depend on
  chi routes frozen at startup
- plugin-owned MCP tools now refresh as a set on the authenticated Go MCP
  server during those mutation flows
- the refresh boundary now builds the next runtime from a post-refresh preview
  snapshot before committing persisted pending-restart cleanup
- plugin-defined external-agent and codegen-target hot refresh plus
  config-write-triggered backend reload remained deferred at the end of that
  slice

The bounded plugin language-server hot-refresh follow-on tracked in
`phase-15-plugin-language-server-runtime-refresh-after-plugin-mutations.md` is
now also landed:

- the live IDE app now refreshes plugin-defined language-server specs from the
  same post-mutation preview snapshot already used for backend route/tool/
  static/listener refresh
- the app-owned LSP router now replaces only plugin-provided additional specs
  and explicitly tears down removed or changed plugin services
- language-server snapshot loading now tolerates mixed backend plugins that
  also register unrelated backend surfaces such as MCP tools, static dirs, and
  listener endpoints
- plugin-defined external-agent adapter and codegen-target hot refresh plus
  config-write-triggered backend reload remain deferred until a separate
  concrete caller requires them

The bounded closeout inventory tracked in
`phase-15-plugin-caller-and-runtime-closeout.md` then confirmed:

- the active direct frontend plugin route surface is Go-owned for the current
  rewrite scope
- plugin codegen callers already resolve against current filesystem/plugin
  state and do not require a separate app-owned hot-refresh slice
- plugin external-agent execution remains outside the current caller-backed
  scope even though registration visibility and config selection are now
  Go-owned
- Phase 15 is therefore complete for the current clean-break rewrite scope,
  and the remaining deferred plugin items should stay caller-driven rather than
  being reopened speculatively

The bounded post-Phase-15 follow-on tracked in
`phase-16-llm-config-and-managed-api-key-transport.md` is now landed:

- Go now owns:
  - `GET /llm/config`
  - `POST /llm/config`
  - `GET /llm/apiKeys`
  - `POST /llm/apiKeys`
- `internal/llmconfig` now owns:
  - revisioned managed API-key snapshot reads and writes over workspace `.env`
  - direct `llm_config.json` save orchestration above the existing runtime
  - immediate runtime API-key refresh after config changes instead of leaving
    newly referenced keys pending until a later watcher event
- the live IDE app now broadcasts:
  - `LLMConfigUpdated`
  - `LLMApiKeysUpdated`
- broad external file-watch parity for `.env` and `llm_config.json` remains
  explicitly deferred until a concrete caller requires it

The bounded post-Phase-16 follow-on tracked in
`phase-17-app-gen-skills-and-custom-skill-transport.md` is now landed:

- Go now owns:
  - `GET /getAppGenSkills`
  - `POST /getAppGenSkillContent`
  - `POST /upsertAppGenCustomSkill`
- `internal/appgenskills` now owns:
  - discoverable skill-root enumeration over workspace, user, admin, and env
    roots
  - skill list/editability metadata and streamed description extraction
  - bounded `SKILL.md` preview reads with truncation metadata
  - custom-skill create/update semantics over the prioritized editable roots
- the live IDE app now serves that route surface directly from Go through the
  real session-gated app stack
- broader app-generation runtime work and watcher parity remain explicitly
  deferred until a concrete caller requires them

The bounded plugin dependency cleanup tracked in
`phase-11-plugin-version-range-owner-and-dependency-cleanup.md` is now also
landed:

- Go no longer depends on `github.com/aquasecurity/go-pep440-version` for
  plugin `settaVersionRange` validation
- plugin compatibility now uses a bounded Go-owned parser/comparator under
  `internal/plugins`
- the module graph no longer carries the transitive `go-version` and
  `xerrors` baggage that existed only for that dependency path

The bounded SSH dependency cleanup tracked in
`phase-7-ssh-arg-parser-dependency-cleanup.md` is now also landed:

- Go no longer depends on `github.com/google/shlex` for SSH argument parsing
- `internal/sshx` now owns the bounded shell-style splitter used by
  `ParseSSHArgs(...)`
- the module graph no longer carries a direct dependency solely for that
  SSH foundation helper

The bounded llmconfig dependency cleanup tracked in
`phase-6-llm-env-parser-dependency-cleanup.md` is now also landed:

- Go no longer depends on `github.com/joho/godotenv` for the managed-run
  `.env` read path
- `internal/llmconfig` now owns the bounded `.env` parser used by
  `ReadEnvFile(...)`
- the module graph no longer carries a direct dependency solely for that
  llmconfig helper

The bounded listener coverage read follow-on tracked in
`phase-4-listener-coverage-read-transport-closeout.md` is now also landed:

- Go now owns `POST /getListenerCoverage` for the live frontend listener
  coverage fetch path
- `internal/realtime` now builds share-session-aware coverage snapshots from
  the current listener registry
- the remaining live listener coverage read no longer depends on the Python
  route/runtime path

The bounded status/meta read follow-on tracked in
`phase-2-status-meta-read-route-closeout.md` is now also landed:

- Go now owns:
  - `GET /backendInitStatus`
  - `GET /authRefreshStatus`
  - `GET /settaHomeInfo`
- the current frontend backend-ready poll, worktree hint, websocket
  refresh-window read, and workspace-switcher launcher-scope read no longer
  depend on `backend/setta/routers/status.py`
- `POST /loadSettings` was left as a separate deferred settings-state boundary
  instead of being silently bundled into that status/meta closeout

That deferred settings-state boundary is now tracked explicitly in
`phase-3-settings-state-owner-and-transport.md`:

- the owner, structural-settings, and thin transport slices are now landed:
  - `internal/settingsstate` now owns canonical embedded defaults plus a
    file-backed runtime over `setta-settings.json`
  - app-owned rename-refactor mode and callable-mismatch auto-refetch policy
    reads now come from that settings-state runtime instead of the settings
    project document
  - auto-layout / section-sizing policy reads used by project-state, HTTP
    auto-layout transport, and MCP structural mutations now resolve from the
    settings-state runtime instead of the settings project document
- Go now owns:
  - `POST /loadSettings`
  - `POST /saveSettings`
  - websocket `UpdateSettings` broadcast after successful save
- the current Go app already owns a settings project runtime for
  `setta-settings-project.json`, but that is not the same thing as the live
  `SettingsState` owner behind `setta-settings.json`
- the explicit settings-project materialization slice is now also landed:
  - saving the Go settings-project runtime now overlays its active json-source
    sections onto the current live `SettingsState` document
  - the resulting live settings snapshot is persisted through
    `internal/settingsstate` and broadcast over websocket `UpdateSettings`
- future Go-owned settings-project transport still needs an explicit reverse
  projection/sync slice; that is no longer a hidden live-settings ownership
  blocker because the current direct frontend settings surface is already
  Go-owned

## Current Reality

The backend seams that matter most for planning are:

- App assembly and lifecycle:
  - `backend/setta/server.py`
  - `backend/setta/server_state.py`
- Route surface and mode guards:
  - `backend/setta/routers/*.py`
  - `backend/setta/routers/setta_api_router.py`
  - `backend/setta/types/routes.py`
- Auth and sessions:
  - `backend/setta/auth/*.py`
  - `docs/reference/auth-and-sessions.md`
- Realtime and websockets:
  - `backend/setta/routers/websocket.py`
  - `backend/setta/websockets/*.py`
  - `docs/reference/setta-realtime-behavior.md`
- Project state and file-backed persistence:
  - `backend/setta/project_state/*.py`
  - `docs/reference/setta-files.md`
- LLM and MCP:
  - `backend/setta/routers/ai.py`
  - `backend/setta/llm/*.py`
  - `backend/setta/mcp/*.py`
  - `docs/reference/mcp-system-overview.md`
  - `docs/reference/chat-sections.md`
- Terminals, LSP, and subprocesses:
  - `backend/setta/terminals/*.py`
  - `backend/setta/lsp/*.py`
- Plugins:
  - `backend/setta/plugins/*.py`

The main planning implication is simple: this rewrite is mostly about rebuilding custom runtime semantics, not choosing an HTTP library.

## Rewrite Principles

1. Optimize for the target Go architecture first.
   - Reuse current HTTP, websocket, and MCP contracts only when they are still the simplest good choice, not because we owe legacy compatibility.

2. Redesign internals aggressively.
   - Do not port `SettaFastAPIState` or other large Python objects 1:1.
   - Replace implicit global/runtime coupling with explicit Go services and supervised runtimes.

3. Treat storage as new.
   - Stay file-backed by default, but design the new on-disk layout for the Go runtime.
   - We do not need to preserve old file formats or ship migration machinery unless product requirements change later.

4. Use libraries for transport and OS integration, not product semantics.
   - Wire protocols, cookie codecs, filesystem events, PTY support, JSON Schema validation: library territory.
   - Project state, runtime managers, scope enforcement, tool registry, share/app mode semantics: our code.

5. Build a black-box reference harness early.
   - The existing Python tests are a capability and edge-case inventory.
   - The Go rewrite should use them to avoid blind spots, not as a strict compatibility bar.

## Decision Buckets

### Adopt Unless Disproven

- HTTP: `net/http` + `github.com/go-chi/chi`
- Websockets: `github.com/coder/websocket`
- SSE/streamed HTTP: stdlib `net/http`
- Structured logging: `log/slog`
- Metrics/tracing hooks: Prometheus + `otelhttp`
- File watching: `github.com/fsnotify/fsnotify`
- Subprocesses: `os/exec`
- Git operations: shell out to native `git`
- Filesystem state: stdlib filesystem APIs plus our own atomic-write/path-policy layer
- JSON Schema validation: `github.com/santhosh-tekuri/jsonschema/v6`

These are strong enough to plan around now.

### Locked In Practice

- MCP SDK choice:
  - using `github.com/modelcontextprotocol/go-sdk` behind `internal/mcpx`
- LSP stack:
  - using a custom `internal/lsp` manager with explicit stdio framing and
    lifecycle control

These no longer need pre-implementation spikes in the current repo state. See
`spike-mcp.md` and `spike-lsp.md` for the recorded outcomes.

### Chosen In Docs, Runtime Follow-Up Still Pending

- PTY layer:
  - current code uses `github.com/aymanbagabas/go-pty` behind
    `internal/terminals`
  - current rewrite recommendation is to switch to `github.com/creack/pty`
    for the Unix PTY path because it is the more conservative and widely used
    ecosystem choice
  - Windows PTY handling should be an explicit follow-up decision instead of
    being inherited from a smaller cross-platform wrapper

See `spike-pty.md` for the updated PTY note.

### Still Defer Until Needed

- Cookie codec:
  - likely `github.com/gorilla/securecookie`
- LLM provider SDK boundaries:
  - use official provider SDKs only at adapter edges
- Embedded DB fallback:
  - defer unless a real indexing or transaction need emerges

These should be decided only when a concrete bounded slice needs them.

### Definitely Custom

- Auth and session semantics
- Runtime manager and registry topology
- Project state and persistence rules
- Realtime connection routing and replay model
- Tool registry, metadata, and search behavior
- MCP scope enforcement and frontend affinity semantics
- LLM/chat orchestration core
- Plugin discovery, capability policy, lifecycle, and process model
- API error model and transport shaping
- Share mode, app mode, launcher mode behavior

## Proposed Go Package Layout

Do not organize the rewrite around Python module parity. Organize it around runtime boundaries.

### Executables

- `cmd/setta`
  - main shipped user-facing CLI/router
- `cmd/setta-server`
  - main backend server
- `cmd/setta-mcp-bridge`
  - stdio bridge for MCP use cases
- `cmd/setta-cli`
  - narrower helper/diagnostic CLI surface if it remains useful alongside the
    shipped `cmd/setta` router

### Internal Packages

- `internal/app`
  - app assembly, startup/shutdown, mode selection
- `internal/config`
  - env/config/profile/path resolution
- `internal/httpapi`
  - route registration, middleware, request decoding, response and error envelopes
- `internal/auth`
  - bootstrap tokens, cookie codec, auth middleware, share-session extraction
- `internal/runtime`
  - process-wide services, supervised background tasks, service registry
- `internal/modes`
  - IDE/share/app/launcher mode policies and service wiring
- `internal/projects`
  - project runtime registry, per-project ownership, state revisions
- `internal/statefs`
  - on-disk layout, atomic writes, file locks, schema/versioning
- `internal/realtime`
  - websocket hub, subscriptions, fan-out, snapshot replay, sequence handling
- `internal/terminals`
  - PTY creation, terminal session lifecycle, websocket attachment
- `internal/lsp`
  - LSP process lifecycle, stdio framing, diagnostics/completion sessions
- `internal/mcpx`
  - MCP server/client adapters, tool invocation boundary, transport wiring
- `internal/tools`
  - tool metadata, registration, scope checks, search indexing
- `internal/llm`
  - provider adapters, orchestration, stream assembly, run tracking
- `internal/plugins`
  - manifests, discovery, install/runtime metadata, backend worker lifecycle
- `internal/gitx`
  - safe shell wrapper around `git`
- `internal/sshx`
  - SSH helpers and policy layer
- `internal/artifacts`
  - attachments, artifacts, download/upload helpers
- `internal/observability`
  - log fields, metrics, traces, error shaping
- `internal/contracts`
  - transport DTOs shared across handlers and tests where useful

### Package Layout Rules

- Keep transport types separate from core domain/runtime types.
- Keep mode-specific policy out of handler packages.
- Keep filesystem persistence behind interfaces owned by us, not by a third-party library.
- Do not create a giant `server_state` equivalent package.

## Architecture Direction

### 1. Replace the giant mutable app state with explicit runtimes

Current Python behavior is centered around a large app state object plus many side managers.
The Go rewrite should separate:

- process-wide runtime
- per-mode runtime
- per-project runtime
- per-share-session runtime

Each runtime should own:

- start/stop lifecycle
- background goroutines
- relevant caches
- subscriptions
- cleanup rules

This is the biggest internal redesign win.

### 2. Treat project state as a first-class subsystem

Project state is not just persistence. It drives:

- websocket snapshots and deltas
- listener behavior
- LSP updates
- artifact/code-file synchronization
- tool scope resolution
- share-session redaction

The Go rewrite should create a clear `ProjectRuntime` boundary with:

- current state revision
- load/save methods
- mutation queue or single-writer loop
- broadcast hooks
- watcher hooks
- share/app redaction hooks

This subsystem should be implemented before most higher-level features.

### 3. Keep wire layers thin

Handlers should do only:

- auth/context extraction
- request decoding/validation
- service invocation
- response mapping

Do not let route handlers own runtime rules or persistence decisions.

### 4. Rebuild realtime around product semantics, not transport details

The hard part is:

- per-project/per-session connection tracking
- event sequencing
- replay/force-refresh behavior
- filtering by project/share-session/dependency
- backpressure and disconnect policy

The websocket library should be a small detail inside a larger `realtime` package.

### 5. Tight isolation around MCP, PTY, LSP, and plugins

These are the most likely subsystems to change during implementation.
Wrap them tightly so the rest of the backend is insulated from library churn.

## Branching And Worktrees

Use `go-rewrite` as the long-lived integration branch for this effort.
Assume the rewrite is being done in a dedicated worktree checked out from `go-rewrite`.

Inside that worktree, create short-lived child branches for concrete work units:

- spikes
- self-contained subsystem work
- risky architectural changes
- anything that should be reviewed or merged independently

Do not treat phases as branches by default.
Phases are planning boundaries; branches should map to mergeable work units.

Recommended workflow:

1. Keep the dedicated rewrite worktree on top of `go-rewrite`.
2. Inside that worktree, create a child branch for the current work item.
3. Complete the work, tests, and relevant doc updates on that child branch.
4. Merge the child branch back into `go-rewrite`.
5. Delete the short-lived branch and create the next one from updated `go-rewrite`.

Create additional worktrees only when you need multiple rewrite branches active at the same time or want stronger isolation between concurrent experiments.

## Phased Rewrite Plan

### Phase 0: Capability Extraction And Harness

Deliverables:

- route and capability inventory grouped by subsystem and runtime mode
- websocket event inventory
- MCP endpoint/tool inventory
- reference test shortlist built from existing Python tests
- explicit list of what we keep, redesign, and drop

Acceptance criteria:

- we can point to the exact Python tests and docs that describe each early-phase capability
- we have a minimal black-box integration harness that can target either backend

Priority reference suites for Phase 0:

- auth/session/bootstrap
- websocket auth and connection rules
- core project load/save routes
- share/app mode guards
- terminals attach/delete behavior
- MCP tool registration and namespacing

### Phase 1: Foundation Runtime

Deliverables:

- `cmd/setta-server`
- config/path resolution
- structured logging
- error envelope conventions
- middleware stack
- health/status routes
- atomic-write and filesystem policy helpers

Acceptance criteria:

- server boots in dev/test modes
- basic route registration works
- config/path resolution and runtime boot rules are intentionally specified and tested

### Phase 2: Auth, Modes, And Request Context

Deliverables:

- bootstrap token flow
- signed auth cookie flow
- share-session extraction and validation
- IDE/share/app mode gating
- request-scoped auth/context helpers

Acceptance criteria:

- current auth and mode-guard reference tests have a Go equivalent pass set
- websocket auth behavior is settled before broad websocket work begins

### Phase 3: Project State Core

Deliverables:

- project state load/save
- per-project runtime registry
- mutation queue or single-writer logic
- revision tracking
- file-backed persistence and versioning
- artifact/code-file/path policy integration

Acceptance criteria:

- load/save/update flows work without LLM, MCP, or LSP dependencies
- state writes are atomic and crash-safe enough for local app usage
- share-session state overlays are defined clearly

### Phase 4: Realtime And Terminal Runtime

Deliverables:

- websocket hub
- project/session subscription model
- snapshot + delta broadcast
- force-refresh behavior
- PTY-backed terminal sessions
- terminal websocket attach/detach/history behavior

Acceptance criteria:

- realtime sequence/replay behavior is deterministic
- terminal attach/delete/resize behavior works on at least macOS and Linux before Windows signoff

### Phase 5: LSP And Code Workflows

Deliverables:

- LSP process supervision
- stdio framing
- initialization/restart logic
- diagnostics broadcast
- completion/signature-help plumbing

Acceptance criteria:

- at least one real language server works end-to-end
- diagnostics/completion behavior is stable under restarts and file changes

### Phase 6: MCP And LLM Runtime

Deliverables:

- MCP server transport
- MCP client transport
- namespaced tool registry
- scope enforcement
- chat/tool stream orchestration
- provider adapters

Acceptance criteria:

- internal and external MCP use cases both work
- tool search, namespacing, and scoped invocation behavior match product expectations
- LLM orchestration remains custom and testable

### Phase 7: Plugins, Share/App Runtime, And Launcher-Adjacent Work

Deliverables:

- plugin discovery/install/runtime lifecycle
- plugin backend worker process model
- share/app runtime cleanup policies
- launcher/runtime-control endpoints that truly belong in the backend rewrite

Acceptance criteria:

- plugins do not require in-process Go plugin loading
- share/app isolation semantics are explicitly specified and implemented
- launcher concerns are either implemented cleanly or explicitly split from the main rewrite

## Early Spike Records

These were the original uncertainty-reduction areas. They are no longer pending
prerequisites in the current repo state.

### MCP Spike

Status:

- complete

Outcome:

- use `github.com/modelcontextprotocol/go-sdk` behind a tight wrapper in
  `internal/mcpx`
- keep auth, namespacing, metadata, scope enforcement, and temporary-id
  translation custom
- use authenticated SSE for the Setta-owned server transport; keep the internal
  client capable of `sse`, `streamable_http`, and `stdio`

### PTY Spike

Status:

- complete

Outcome:

- current code now uses `github.com/creack/pty` for the Unix PTY path behind
  `internal/terminals`
- Windows compilation remains explicit and separate from the Unix backend
  choice
- keep attach/detach/history, resize, termination, scope filtering, and input
  policy custom
- keep websocket and HTTP transport layers thin above the PTY owner

### LSP Spike

Status:

- complete

Outcome:

- keep a custom `internal/lsp` session/runtime owner
- keep stdio framing and lifecycle control explicit
- support Python via current-process basedpyright first

### File-State Spike

Status:

- resolved through implementation

Outcome:

- `internal/statefs` plus the Phase 3 project-state/store work now own atomic
  writes, path policy, schema versioning, and temp-dir persistence coverage
- this is no longer a pending precondition before other rewrite work

## Reference And Test Strategy

See `docs/plans/go-backend-rewrite/testing-strategy.md` for the operational testing rules and harness expectations for the rewrite.

### Use the existing Python test suite as a capability map

The minimum bar is that the Go test suite must cover at least the product behavior covered by the current Python tests.
The target is to meet or exceed that behavioral coverage, even if the Go tests are organized differently.

High-value source areas:

- `tests/auth`
- `tests/routers`
- `tests/websockets`
- `tests/project_state`
- `tests/mcp`
- `tests/llm`
- `tests/plugins`
- `tests/terminals`
- `tests/server_state`

### Convert early confidence tests into black-box Go-facing suites

The rewrite should not start by porting unit tests line-for-line.
Instead, create black-box tests around:

- HTTP routes
- websocket session rules
- on-disk persistence behavior
- PTY/LSP process lifecycles
- MCP tool invocation behavior

### Keep cross-platform smoke coverage explicit

At minimum:

- macOS
- Linux
- Windows for PTY, paths, file locking, and process behavior

### Keep git-history safety rules

Any Git test that mutates history must continue to run in disposable repos only.
Do not weaken this rule during the rewrite.

## Rewrite Vs Redesign Calls

### Default To Redesign

- route layout and request/response envelopes
- auth/session token formats and cookie payload structure
- filesystem layout and persistence format
- app state construction and lifecycle
- background task supervision
- manager ownership boundaries
- persistence implementation details
- plugin worker architecture
- LLM/provider adapter boundaries

### Keep Only If They Still Buy Simplicity

- project and share-session concepts
- websocket snapshot/delta model
- MCP tool namespacing and scope behavior
- frontend-visible workflow concepts that are still clearly good product decisions

### Safe To Drop Entirely

- storage migration paths
- legacy route compatibility
- Python-shaped module boundaries
- launcher-adjacent coupling that is not core backend runtime
- incidental batching/caching behavior that exists only because of the Python implementation

## Immediate Next Actions

1. Keep the roadmap and phase docs synchronized with the current shipped code
   so closed phases do not look active again and the remaining Python-owned
   agentic route inventory plus its reranked outcome do not disappear from
   planning context.
2. Treat MCP, LSP, and file-state choices as locked unless a concrete new
   requirement breaks them, and keep any remaining PTY discussion bounded to
   explicit Windows follow-up or caller-backed terminal features rather than
   reopening terminal architecture more broadly.
3. Start any future AI/app-generation follow-on from the latest closeout docs
   plus real caller analysis, not by reopening completed Phase 12 runtime
   work, Phase 15 plugin work, or early spikes.
4. Prefer stabilization and reference-suite expansion where completed runtime
   owners still have thin regression protection, but do not use that as a
   substitute for choosing a concrete next caller-backed or product-backed
   Python-owned agentic follow-on.
   - the first example of that is now landed in
     `phase-14-executor-fixture-stability-and-regression-hardening.md`
   - a second example is now landed in
     `phase-4-terminal-command-dispatch-prompt-readiness-and-echo-stability.md`
     for the completed terminal `runCode` runtime boundary
   - a third example is now landed in
     `phase-4-terminal-websocket-attach-lifecycle-and-resize-regression-hardening.md`
     for the completed terminal websocket attach/history/resize surface
   - a fourth example is now landed in
     `phase-4-terminal-websocket-app-middleware-regression-hardening.md`
     for the real app-middleware coverage of the completed terminal websocket
     surface
   - a fifth example is now landed in
     `phase-14-agent-run-and-run-chain-app-middleware-regression-hardening.md`
     for the real app-handler coverage of the landed Phase 14 route surface
5. Keep the clean-break boundary explicit for managed chat work.
   - do not reopen a broad LiteLLM-equivalent managed runtime
   - do reuse the landed Phase 14 managed-run foundations for the now-reranked
     direct frontend managed chat slice
6. The post-Phase-25 rerank is now complete.
   - the inventory outcome is recorded in
     `phase-19-remaining-direct-frontend-route-inventory-and-rerank.md`
   - the completed project-shell phase is recorded in
     `phase-19-project-shell-route-cluster-plan.md`
   - the completed lifecycle closeout slice is recorded in
     `phase-19-project-lifecycle-mutations-plan.md`
   - the completed git direct-frontend phase is recorded in
     `phase-20-git-read-route-cluster-plan.md`
   - the corrected post-git rerank is recorded in
     `phase-21-post-git-direct-frontend-route-inventory-and-rerank.md`
   - the completed artifact/file-browser direct-frontend phase plan is
     recorded in `phase-22-artifact-and-file-browser-route-cluster-plan.md`
   - the focused landed IDE artifact slice is recorded in
     `phase-22-ide-artifact-owner-plan.md`
   - the focused landed deployment/share artifact overlay slice is recorded in
     `phase-22-share-artifact-session-overlay-plan.md`
   - the post-Phase-22 rerank is recorded in
     `phase-23-post-artifact-direct-frontend-route-inventory-and-rerank.md`
   - the broader post-Phase-23 capability rerank is recorded in
     `phase-24-caller-backed-capability-gap-inventory-and-rerank.md`
   - the broader remaining-Python-ownership rerank is recorded in
     `phase-25-remaining-python-ownership-inventory-and-rerank.md`
   - the next optional rewrite-track plan is recorded in
     `phase-25-legacy-startup-and-distribution-boundary-plan.md`
   - the bounded packaged-entrypoint fallback closeout slice is recorded in
     `phase-27-packaged-entrypoint-fallback-hardening-plan.md`
   - the next bounded startup follow-on is recorded in
     `phase-28-dev-startup-shared-helper-owner-plan.md`
   - Phase 20 is now complete for:
     - `POST /git/status`
     - `POST /git/diff`
     - `POST /git/log`
     - `POST /git/commitDetails`
     - `POST /git/commitFileDiff`
   - the direct frontend route-cluster track is now closed for the current
     caller-backed surface after the landed Phase 22 closeout
   - the broader capability-gap rerank is now also complete:
     - the remaining typed Go `unsupported` / `unavailable` branches still do
       not select a new caller-backed backend phase
     - do not reopen completed route clusters or bounded product boundaries
       without a concrete new caller or runtime gap
   - there is currently no new backend implementation slice selected by the
     roadmap evidence alone
   - if rewrite work continues, the next track is now explicitly:
     - legacy Python startup/fallback ownership
     - source/dev startup wiring
     - distribution/install workflow glue
   - the last active packaged `python -m setta` fallback edge recorded during
     Phase 25 is now Go-owned after the landed Phase 27 slice
   - the remaining active `backend/setta/start.py` dependency is now narrowed
     to the shared startup helper surface imported by `backend/setta/dev_start.py`
   - dormant listener-chat, detached-run, and non-caller-backed
     default-project routes should remain out of scope until a concrete caller
     proves otherwise

## Planning Conclusion

This rewrite is viable, but only if we treat it as a clean-break stateful-runtime rebuild, not as a framework swap.

The safest path is:

- lock the boring infrastructure choices now
- keep uncertain subsystems bounded and explicit when new ones appear
- rebuild project state and realtime early
- defer scope growth until it is selected deliberately and documented
