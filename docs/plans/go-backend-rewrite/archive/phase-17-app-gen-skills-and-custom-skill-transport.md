# Phase 17 App-Gen Skills And Custom-Skill Transport

## Purpose

This doc records the landed bounded post-Phase-16 slice.

Phase 16 closed the direct LLM settings dependency. The next active direct
frontend dependency is the app-gen skills browser and custom-skill editor used
by the project chat skills pane:

- `GET /getAppGenSkills`
- `POST /getAppGenSkillContent`
- `POST /upsertAppGenCustomSkill`

This slice moved only that surface and the bounded owner work it required. It
does not reopen broader app-generation runtime behavior, watcher parity, or
slash-command synthesis.

## Current Status

Completed before this slice:

- Phase 15 plugin runtime/transport closeout
- Phase 16 LLM config and managed API-key transport
- the earlier bounded settings/agentic read and write slices already landed in
  Go

Concrete dependency that triggered this slice:

- active frontend callers still use:
  - `route_get_app_gen_skills()`
  - `route_get_app_gen_skill_content({ skillId })`
  - `route_upsert_app_gen_custom_skill(...)`
- those callers are centered in:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
- the current Python owner lives in:
  - `backend/setta/routers/app_gen_extensions.py`
- the current product contract is captured by:
  - `tests/routers/test_app_gen_extensions_routes.py`

Current Python behavior relevant to this slice:

- skill discovery walks multiple roots from workspace, user, admin, and env
  locations
- roots are deduplicated by resolved path
- only skills under `AGENTS_HOME/skills`, `~/.agents/skills`, or workspace
  `.agents/skills` are editable
- root-level `SKILL.md` is visible but not editable
- content preview reads at most `262144` bytes and reports truncation metadata
- create picks the first writable custom-skill root from the priority order:
  - `AGENTS_HOME/skills`
  - `~/.agents/skills`
  - workspace `.agents/skills`
- create uses non-overwrite semantics
- update requires a discoverable editable skill id and uses atomic replace
  semantics
- route-level errors map to `404` for missing/discoverability failures and
  `400` for invalid path, permission, or write failures

Current Go behavior after this slice:

- `internal/appgenskills`
  - owns discoverable skill-root enumeration over workspace, user, admin, and
    env-backed roots
  - returns skill list rows with editability metadata and streamed description
    extraction
  - reads `SKILL.md` preview content with truncation metadata
  - owns custom-skill create and update semantics, including root priority,
    discoverability checks, non-overwrite create behavior, and replace-based
    update writes
- `internal/httpapi/app_gen_skill_routes.go`
  - owns thin IDE-gated transport for:
    - `GET /getAppGenSkills`
    - `POST /getAppGenSkillContent`
    - `POST /upsertAppGenCustomSkill`
- `internal/app/app.go`
  - wires the service into the real IDE app stack
- focused coverage now exists in:
  - `internal/appgenskills/service_test.go`
  - `internal/httpapi/app_gen_skill_routes_test.go`
  - `internal/app/app_test.go`

## Scope

This slice delivered:

- a bounded Go owner for:
  - discoverable skill-root enumeration
  - skill listing with editability metadata
  - `SKILL.md` preview reads with truncation metadata
  - custom-skill create and update semantics
- thin IDE-gated Go transport for:
  - `GET /getAppGenSkills`
  - `POST /getAppGenSkillContent`
  - `POST /upsertAppGenCustomSkill`
- focused owner, route, and app coverage for the active caller contract

## Non-Goals

- broad app-generation runtime migration
- skill watcher parity or live filesystem subscription behavior
- slash-command/runtime synthesis beyond what the current frontend already does
- preserving Python route exposure where there is no active caller
- regenerating frontend endpoint bindings

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-16-llm-config-and-managed-api-key-transport.md`
- `backend/setta/routers/app_gen_extensions.py`
- `backend/setta/utils/skill_roots.py`
- `tests/routers/test_app_gen_extensions_routes.py`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
- `frontend/src/utils/generatedEndpoints.ts`
- `frontend/src/utils/generatedTypes.ts`
- `internal/httpapi/prompt_template_routes.go`
- `internal/httpapi/route_names.go`
- `internal/app/app.go`

## Recommended Design

1. Keep a dedicated Go owner package for app-gen skills.
   - Do not bury root-discovery and write semantics inside `httpapi`.
   - Own the source-of-truth behavior in a small package that only depends on
     workspace root, home/env lookup, and the filesystem.

2. Keep transport thin and IDE-gated.
   - Register the three routes under `internal/httpapi`.
   - Match the active caller payloads and response fields exactly.
   - Map missing/discoverability failures to `404` and invalid/write failures
     to `400`.

3. Preserve robust root and path semantics.
   - Reproduce the current explicit root list and dedupe-by-resolved-path
     behavior.
   - Reproduce create-root priority for editable roots instead of guessing.
   - Reject traversal and unsupported relative paths explicitly.
   - Keep hidden/ignored roots undiscoverable rather than adding heuristic
     exceptions.

4. Use real filesystem semantics for writes.
   - Create with non-overwrite behavior.
   - Update existing editable skills with atomic replace semantics.
   - Keep collision and partial-write behavior deterministic.

5. Keep this slice bounded to the current frontend surface.
   - Do not pull in app-gen execution, prompt assembly, or watcher follow-ons
     unless a concrete dependency appears during implementation.

## Verification

- `./scripts/go.sh test ./internal/appgenskills -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'AppGenSkill|AppGenSkills|CustomSkill' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestAppServesAppGenSkillRoutes' -count=1`
- `git diff --check`

## Decisions Made

- this slice needs a doc first because the direct route move depends on owner
  decisions for root discovery, editability, and write semantics
- keep the owner separate from `prompttemplates` because the source-of-truth is
  a multi-root filesystem view, not a single setta-files store
- treat Python tests as the product contract for this bounded slice without
  importing broader Python app-generation architecture
- keep home/env expansion inside the owner package so tests can exercise root
  priority and discoverability without moving filesystem policy into `httpapi`

## Open Questions

- none for the current direct caller surface
- external watcher parity and broader app-generation runtime work remain
  explicitly deferred until a concrete caller requires them

## Next Recommended Step

- the rerank work after this landing is now recorded in
  `phase-18-remaining-ai-chat-and-transcription-route-inventory-and-rerank.md`
- the next executable slice is now
  `phase-18-managed-chat-send-hydrate-stop-and-section-persistence-plan.md`
- transcription-session runtime remains the next adjacent AI follow-on after
  that managed chat slice, not something to bundle back into Phase 17

## Progress Notes

- 2026-03-09: reviewed the active frontend caller, the Python router, the
  shared `iter_skill_roots(...)` helper, and the Python route tests; this
  confirmed the next slice is a real owner + transport move rather than a
  trivial route shim
- 2026-03-09: landed the Go owner, route transport, route-name registration,
  real app wiring, and focused owner/route/app regression coverage for the
  app-gen skills browser and custom-skill editor surface
