# Phase 13 Prompt-Template Read Transport

## Purpose

This doc records the next bounded post-Phase-13 slice and its landing.

The previous slice moved `GET /getAgentProfiles` to Go over the already-landed
agent-profile store. The next highest-leverage hydration dependency is that the
frontend still loads prompt templates from a Python-owned route even though the
underlying product behavior is still a straightforward file-backed read path.

This slice closed that dependency without broadening into prompt-template
CRUD, websocket broadcast parity, or the unrelated summary-cache-status route.

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime and route ownership
- Phase 13 agent-profile read transport
- Python prompt-template behavior narrowed to:
  - file-backed JSON documents under `setta_files/prompts/*.json`
  - list-by-directory scan sorted by filename
  - per-file `PromptTemplate` validation

Concrete dependency that triggered this slice:

- `frontend/src/state/actions/ai.ts`
  - `loadPromptTemplates()` still calls `route_get_prompt_templates()`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts`
  - prompt-template hydration still depends on that route at app load
- Python owned the route in `backend/setta/routers/agentic.py`:
  - `route_get_prompt_templates(...)`
- Python owned the file-backed store helpers in
  `backend/setta/agentic/store.py`:
  - `list_prompt_templates(...)`
  - `load_prompt_template(...)`
  - `save_prompt_template(...)`
  - `delete_prompt_template(...)`

Landed in this slice:

- `internal/prompttemplates`
  - bounded file-backed owner for `setta_files/prompts/*.json`
  - strict per-file template validation with defaulted `format`,
    `description`, `inputSchema`, and `metadata`
- `internal/httpapi/prompt_template_routes.go`
  - thin IDE-gated `GET /getPromptTemplates` transport
- `internal/app/app.go`
  - explicit prompt-template store wiring into route registration
- `internal/httpapi/route_names.go`
  - bare-route registration for `getPromptTemplates`
- focused coverage in:
  - `internal/prompttemplates/store_test.go`
  - `internal/httpapi/prompt_template_routes_test.go`

Closeout rerun after the landing:

- the direct hydration dependency on prompt-template reads is now gone
- the remaining Python-owned agentic read that still affects live frontend UI
  is `POST /getAgenticSummaryCacheStatus`
- prompt-template single-item and CRUD routes remain deferred because they are
  not the current highest-leverage frontend dependency

Remaining Python-owned agentic reads outside this slice:

- `POST /getAgenticSummaryCacheStatus`

## Scope

This slice delivered:

- a bounded Go owner for prompt-template files under `setta_files/prompts`
- thin Go transport for `GET /getPromptTemplates`
- response shape matching the current frontend expectation
- focused tests for:
  - missing prompts directory returns `[]`
  - stored templates read deterministically
  - HTTP list read
  - IDE-mode gating

## Non-Goals

- `GET /getPromptTemplate`
- create/update/delete prompt-template routes
- websocket `PromptTemplatesUpdated` parity
- watcher/runtime ownership for prompt templates
- `POST /getAgenticSummaryCacheStatus`
- project-manager prompt mutation work

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-13-agent-profile-read-transport.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/agentic/store.py`
- `backend/setta/database/db_objs.py`
- `backend/setta/types/prompt.py`
- `tests/agentic/test_agentic_store.py`
- `tests/routers/test_agentic_routes.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts`
- `internal/httpapi`

## Recommended Design

1. Add a small file-backed owner for prompt templates.
   - Mirror the directory-backed `prompts/*.json` shape directly.
   - Keep validation strict and explicit at the store edge.

2. Keep the route list-only and thin.
   - Read directly from the new store owner.
   - Do not add a broader prompt-template service for this slice.

3. Preserve the existing JSON contract.
   - Return `[]PromptTemplate`.
   - Keep defaultable `description`, `format`, `inputSchema`, and `metadata`
     behavior aligned with the persisted schema instead of adding route-local
     normalization heuristics.

## Verification

- `./scripts/go.sh test ./internal/prompttemplates ./internal/httpapi -run 'PromptTemplate|GetPromptTemplates' -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- treat prompt-template hydration as the next bounded post-Phase-13 dependency
  because it is still on the same frontend hydration path as the just-landed
  agent-profile route
- keep this slice read-only even though the new store owner can be designed to
  support later CRUD without reshaping the files

## Open Questions

- whether the new store should include only `List()` or the full `List/Get/Save/Delete`
  shape used by Python
  - recommendation: include the full bounded file owner if it stays small, so
    later CRUD slices can reuse the same source-of-truth boundary cleanly

## Next Recommended Step

- open the next bounded post-Phase-13 doc around summary-cache-status
  transport and ownership
- keep prompt-template single-item and CRUD work deferred unless a concrete UI
  dependency makes them higher leverage than summary-cache status
