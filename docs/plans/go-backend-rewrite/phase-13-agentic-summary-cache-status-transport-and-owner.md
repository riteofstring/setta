# Phase 13 Agentic Summary-Cache-Status Transport And Owner

## Purpose

This doc records the next bounded post-Phase-13 slice and its landing.

The previous slices moved `GET /getAgentProfiles` and `GET /getPromptTemplates`
to Go over already-bounded file-backed owners. The next highest-leverage
frontend-facing Python read is `POST /getAgenticSummaryCacheStatus`, used by
chat-area settings to show whether summary-edge source sections are already
cached, missing, empty, or capped for the next fill attempt.

Unlike the prior list-read slices, this route is not a trivial file read. It
depends on:

- chat-section summary-edge resolution from current project state
- deterministic summary-source hashing per section
- reads from `setta_files/agentic_summary_cache.json`

This slice moves only that bounded owner and thin transport. It does not reopen
the broader managed-LLM summary-fill runtime.

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime and route ownership
- Phase 13 agent-profile read transport
- Phase 13 prompt-template read transport

Concrete dependency that triggered this slice:

- `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
  - the chat-area settings UI still calls
    `route_get_agentic_summary_cache_status(...)`
- Python still owns that route in `backend/setta/routers/agentic.py`
- Python still owns the status builder in:
  - `backend/setta/agentic/agentic_summary_status.py`
  - `backend/setta/agentic/agentic_summary_cache.py`
  - `backend/setta/agentic/agentic_context.py`

Key Python behavior that must remain the source of truth for this slice:

- summary-context sections come only from direct `section_chat` agentic edges
  targeting the requested chat section
- the route returns:
  - `maxSummariesPerRun`
  - `summarySectionIds`
  - `cachedSectionIds`
  - `missingSectionIds`
  - `emptySourceSectionIds`
  - `consideredSectionIds`
  - `wouldAttemptSectionIds`
- cache hits are keyed by:
  - `projectConfigId`
  - `sectionId`
  - `variantId`
  - deterministic `content_hash`
- the deterministic section summary source uses bounded prompt-body hashing from
  current effective section payloads, not route-local heuristics

## Scope

Landed in this slice:

- `internal/agenticsummarycache`
  - bounded owner for `setta_files/agentic_summary_cache.json`
  - deterministic summary-edge resolution for direct `section_chat` summary
    edges targeting the requested chat section
  - deterministic section-summary-source hashing over effective project-state
    payloads, including param-backed dict/callable/meta-control sections
- `internal/httpapi/agentic_summary_cache_routes.go`
  - thin IDE-gated `POST /getAgenticSummaryCacheStatus` transport
- `internal/app/app.go`
  - explicit owner wiring into app assembly
- `internal/httpapi/route_names.go`
  - bare-route registration for `getAgenticSummaryCacheStatus`
- focused coverage in:
  - `internal/agenticsummarycache/service_test.go`
  - `internal/httpapi/agentic_summary_cache_routes_test.go`

Closeout rerun after the landing:

- the chat-area settings UI no longer depends on the Python summary-cache-status
  route
- a later closeout audit after the prompt-template CRUD landing corrected an
  earlier stale inventory in this doc
- the current remaining direct frontend Python-owned agentic routes are:
  - `GET /getExternalAgentConfigs`
  - `GET /getExternalAgentHealth`
  - `GET /getEngineConfigs`
  - `GET /getTranscriptionProfiles`
  - `POST /createAgentProfile`
  - `POST /updateAgentProfile`
  - `POST /deleteAgentProfile`
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`
  - `POST /updateEngineConfig`
  - `POST /createTranscriptionProfile`
  - `POST /updateTranscriptionProfile`
  - `POST /deleteTranscriptionProfile`
- generated single-item reads still exist for:
  - `POST /getAgentProfile`
  - `POST /getAgentRun`
  - `POST /getPromptTemplate`
  - `POST /getExternalAgentConfig`
  - `POST /getEngineConfig`
  but no direct frontend caller was found for them in the current worktree

Remaining Python-owned agentic routes outside this slice:

- `GET /getExternalAgentConfigs`
- `GET /getExternalAgentHealth`
- `GET /getEngineConfigs`
- `GET /getTranscriptionProfiles`
- `POST /createAgentProfile`
- `POST /updateAgentProfile`
- `POST /deleteAgentProfile`
- `POST /createExternalAgentConfig`
- `POST /updateExternalAgentConfig`
- `POST /deleteExternalAgentConfig`
- `POST /updateEngineConfig`
- `POST /createTranscriptionProfile`
- `POST /updateTranscriptionProfile`
- `POST /deleteTranscriptionProfile`

## Scope

This slice delivered:

- a bounded Go owner for `agentic_summary_cache.json`
- deterministic summary-section-id resolution for a chat section
- deterministic summary-source extraction and cache-key computation for the
  section types needed by the current agentic-summary product surface
- thin IDE-gated `POST /getAgenticSummaryCacheStatus` transport
- focused tests for:
  - no summary edges
  - cached vs missing sections
  - empty-source detection
  - duplicate summary-edge dedupe
  - generation-cap truncation
  - route success and IDE-mode gating

## Non-Goals

- background summary-cache filling
- managed `setta_llm` summary generation
- broad project-state-summary parity port
- prompt-template or agent-profile CRUD
- non-summary agentic route migration

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-13-prompt-template-read-transport.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/agentic/agentic_summary_status.py`
- `backend/setta/agentic/agentic_summary_cache.py`
- `backend/setta/agentic/agentic_context.py`
- `backend/setta/agentic/agentic_scope.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/types/helpers_lvl3.py`
- `tests/agentic/test_agentic_summary_status.py`
- `tests/routers/test_agentic_summary_cache_status_route.py`
- `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
- `internal/projectstate`
- `internal/httpapi`

## Recommended Design

1. Add a small Go owner dedicated to summary-cache-status reads.
   - Keep file access explicit and local to the owner.
   - Read directly from `setta_files/agentic_summary_cache.json`.
   - Normalize payload shape at the owner boundary.

2. Reuse current project-state runtime snapshots as the source of truth.
   - Read `projectstate.Runtime.Snapshot().Document`.
   - Resolve the requested project via `Document.ProjectByID(...)`.
   - Do not introduce a parallel project-state cache or singleton.

3. Build summary-source text directly from effective section/code-object payloads.
   - Use `Project.EffectiveSectionPayload(...)` and
     `Project.EffectiveCodeObjectPayload(...)`.
   - Port the deterministic hashing and bounded prompt-body behavior needed for
     cache-key lookup.
   - Do not add keyword-based or best-effort fallbacks.

4. Keep transport thin and POST-only.
   - Decode `projectConfigId` and `chatSectionId`.
   - Map missing project/chat inputs to typed HTTP errors.
   - Return the status payload directly from the new owner.

## Verification

- `./scripts/go.sh test ./internal/agenticsummarycache -run 'Service|BuildSection' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'AgenticSummary|GetAgenticSummaryCacheStatus' -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- this slice needs a focused doc first because it introduces a new bounded owner
  instead of another direct file-list route
- the route should depend on the live project-state runtime snapshot plus the
  on-disk summary cache file, not on MCP summary tooling or a broader summary
  service port
- deterministic section-summary-source extraction stayed local to the new owner
  instead of broadening into a general project-summary subsystem

## Open Questions

- whether later Go-owned summary-cache fill work should reuse this owner
  directly or pull the summary-source logic one layer lower
  - recommendation: reuse this owner from later fill work first; only extract a
    lower boundary if a second caller needs the same primitives

## Next Recommended Step

- the prompt-template CRUD follow-up is now landed in
  `phase-13-prompt-template-crud-transport.md`
- open the next bounded Phase 13 doc around external-agent config plus
  external-agent health hydration transport over the already-landed Go
  `externalagentconfigs` store and preflight primitives
- keep `getAgentProfile`, `getAgentRun`, `getPromptTemplate`,
  `getExternalAgentConfig`, and `getEngineConfig` deferred until a concrete
  caller makes one of them higher leverage than the remaining direct frontend
  settings routes
