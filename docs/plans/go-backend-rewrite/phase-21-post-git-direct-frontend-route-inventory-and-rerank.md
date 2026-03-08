# Phase 21 Post-Git Direct Frontend Route Inventory And Rerank

## Purpose

This doc records the bounded rerank after the landed Phase 20 git-read
closeout.

Phase 20 removed the last adjacent caller-backed direct frontend git gap under
the current clean-break scope. The rewrite now needs a fresh rerank of the
remaining Python-owned direct frontend routes so the next phase is chosen by
real callers, not by leftover generated bindings or historical router shape.

## Current Status

Completed before this inventory:

- Phase 19 project-shell route cluster closeout
- Phase 20 git read route cluster closeout

Question this inventory answers:

- after the landed Phase 20 closeout, is there another caller-backed direct
  frontend route cluster that should become the next Go rewrite phase?

Current repo status as of 2026-03-10:

- the direct project-shell route cluster is Go-owned for the current
  caller-backed surface
- the direct git-read route cluster is Go-owned for the current caller-backed
  surface
- listener-chat, detached-run, and default-project routes still exist in
  Python-generated bindings, but this rerank found no live direct frontend
  callers for them

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-20-git-read-route-cluster-plan.md`
- `docs/plans/go-backend-rewrite/phase-19-remaining-direct-frontend-route-inventory-and-rerank.md`
- `backend/setta/routers/listener.py`
- `backend/setta/routers/runs.py`
- `backend/setta/routers/projects.py`
- `backend/setta/types/routes.py`
- `frontend/src/utils/generatedEndpoints.ts`
- `frontend/src/utils/generatedTypes.ts`
- `frontend/src`
- `frontend/tests`

## Inventory Method

1. Start from the post-Phase-20 direct route inventory and remove the landed
   git cluster from the remaining surface.
2. Search current frontend code for live callers of the remaining generated
   listener-chat, detached-run, and default-project endpoints.
3. Separate generated endpoint availability from real current callers.
4. Rerank only the route clusters that still have a concrete caller-backed
   reason to move now.

## Findings

### 1. The git-read cluster is now complete and should stay closed

What landed in Phase 20:

- `POST /git/status`
- `POST /git/diff`
- `POST /git/log`
- `POST /git/commitDetails`
- `POST /git/commitFileDiff`

Implication:

- there is no remaining caller-backed direct frontend git transport gap under
  the current clean-break scope

### 2. Listener-chat routes still have no live direct frontend callers

Generated routes still exist:

- `POST /createChat`
- `POST /getChat`
- `POST /appendChatMessages`
- `POST /deleteChat`
- `POST /setChatSystemPrompt`
- `POST /getAllChatMetadata`
- `POST /runMcpTools`
- `POST /emitChatStreamDelta`

Current status:

- current searches found generated endpoint exports, but no live direct
  frontend callers in `frontend/src` or `frontend/tests`
- the active user-facing AI/chat path remains the Go-owned managed/external
  transport landed earlier

Rerank:

- do not open another listener-chat transport phase without a concrete caller

### 3. Detached-run routes still have no live direct frontend callers

Generated routes still exist:

- `POST /runDetached`
- `POST /getRunStatus`
- `POST /cancelRun`

Current status:

- current searches found generated endpoint exports, but no live direct
  frontend callers in `frontend/src` or `frontend/tests`
- the remaining detached-run question is runtime/product level, not an active
  direct transport gap

Rerank:

- do not open a detached-run phase without a concrete caller-backed reason

### 4. Default-project routes remain non-caller-backed

Generated/project routes still exist:

- `POST /getDefaultConfigName`
- `POST /setAsDefaultProject`

Current status:

- current searches found no live direct frontend callers for either route
- they remain part of the broader project-state surface, but they should not
  drive the next rewrite phase without an actual caller

Rerank:

- keep them out of the next phase unless a new caller appears

## Reranked Outcome

1. There is no remaining caller-backed direct frontend route cluster to select
   as the next Go rewrite phase.
2. Listener-chat, detached runs, and default-project routes should remain out
   of scope until a concrete caller changes the rerank.
3. The next rewrite step should be a broader planning/inventory pass outside
   this direct frontend route cluster, not another route-transport slice by
   default.

## Decisions Made

- keep the direct frontend route cluster closed after the landed Phase 20 git
  closeout
- do not broaden scope into dormant generated listener or detached-run
  surfaces without a caller-backed reason
- treat the next step as planning/inventory work, not another direct frontend
  transport implementation

## Verification

- inventory only; direct caller searches run through `rg`

## Next Recommended Step

- start the next broader rewrite inventory/planning pass outside the now-closed
  direct frontend route cluster
- reopen listener-chat, detached runs, or default-project transport only if a
  concrete caller appears
