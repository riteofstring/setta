# Phase 18 Chat Section Chat ID Read Closeout

## Purpose

This doc records the bounded closeout slice for the remaining dormant
`POST /getChatSectionChatId` route after the landed direct-caller Phase 18
managed-chat and transcription-session work.

The caller-backed Phase 18 surface is already Go-owned. The remaining nearby
Python route is a small chat-section read that validates the stored `chatId`
against durable chat-run existence and clears stale state when the chat no
longer exists.

This is not a new managed-chat runtime phase. It is an opportunistic closeout
slice selected only because the current direct surface is already complete and
the route is bounded enough to finish cleanly.

## Current Status

Status: landed on 2026-03-10.

Complete before this slice:

- chat-section mutation transport:
  - `/setChatSectionSettings`
  - `/setChatSectionState`
  - `/setChatSectionChatId`
- managed chat send / hydrate / stop plus bounded OpenAI tool execution
- bounded managed tool preview and AI-follow result updates
- file-mode and realtime transcription-session ownership
- frontend/runtime managed thinking availability boundary for current
  Go-managed callers

Route this slice moved:

- `POST /getChatSectionChatId`

Python reference behavior for that route:

- read the current chat section `chatId` from project state
- if `chatId` is empty, return `null`
- validate the `chatId` against durable chat-run existence
- if no matching chat run exists, clear the stored `chatId` in project state
  and return `null`

## Scope

In scope:

- Go-owned route registration and transport for `POST /getChatSectionChatId`
- a small explicit service boundary over:
  - project-state chat-section read
  - durable agent-run lookup
  - stale `chatId` clearing when no chat run exists
- focused route, service, and real-app coverage

Out of scope:

- reopening broader managed-chat runtime work
- new caller-driven frontend work
- unrelated dormant AI/app-generation routes

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-18-managed-chat-send-hydrate-stop-and-section-persistence-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-18-remaining-ai-chat-and-transcription-route-inventory-and-rerank.md`
- `backend/setta/routers/project_manager.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `tests/project_state/test_chat_section_chat_id.py`
- `tests/llm/test_chat_toolkit_listener_clients.py`
- `internal/projectstate/chat_sections.go`
- `internal/httpapi/project_routes.go`
- `internal/agentruns/store.go`
- `internal/app/app.go`

## Implementation Sketch

1. Add a small Go owner for chat-section `chatId` reads that:
   - reads the effective chat section `chatId` from project state
   - treats `llm_chat`, `external_agent`, and `scriptable_chat` as valid chat
     run types
   - clears stale section `chatId` state through the existing project-state
     mutation path when no durable run exists
2. Register `POST /getChatSectionChatId` in the Go project-route transport
   using that owner.
3. Add focused tests for:
   - existing managed/external chat ids
   - stale chat-id clearing
   - real app wiring

## Decisions Made

- keep this as a small closeout slice instead of reopening a broader rerank
- keep project-state reads and durable run lookup behind an explicit service
  boundary instead of baking cross-runtime logic directly into the transport
- use durable run metadata as the source of truth for whether a stored section
  `chatId` is still valid

## Open Questions

- none

## Progress Notes

- 2026-03-10: selected this slice only after reranking the earlier managed
  reasoning follow-on and confirming the Python reference does not support the
  suspected reasoning-param cleanup.
- 2026-03-10: landed Go-owned `POST /getChatSectionChatId` transport plus a
  small `internal/chatsections` service over project-state read, durable
  run-index lookup, and stale `chatId` clearing.
- 2026-03-10: kept the transport thin and reused the existing
  `SetChatSectionChatID` mutation path for stale-state cleanup instead of
  inventing a second project-state write seam.

## Verification

- `./scripts/go.sh test ./internal/chatsections ./internal/httpapi ./internal/app -run 'Test(ServiceGetChatID(ReturnsExistingManagedAndExternalChats|ClearsMissingChat)|RegisterProjectRoutes(ChatSectionMutationsPersistAndTrackFrontendOpIDs|ChatSectionMutationsRejectInvalidSectionAndSettings|GetChatSectionChatIDReturnsExistingAndClearsMissing)|AppServes(ChatSectionMutationRoutes|GetChatSectionChatIDRoute))' -count=1`

## Next Recommended Step

The adjacent direct AI/chat route cluster is now closed for the current
bounded surface. Rerank outside this cluster instead of opening another blind
Phase 18 follow-on, and only reopen managed reasoning or broader preview work
if a concrete current caller proves that gap.
