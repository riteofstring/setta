# Phase 12 External-Agent Attachment Payload Parity

## Purpose

This doc narrows the remaining concrete Phase 12 external-agent gap into one
bounded follow-on over the already-landed Go runtime, route, executor, rich
item, and prompt-composition ownership.

The goal of this slice is to close external-agent attachment handling that
Python still owns today:

- external-agent runs must build attachment prompt text for Claude
- external-agent runs must build attachment prompt text plus image URLs for
  Codex
- external-agent runs must build file-part URLs for OpenCode
- token-backed attachment downloads must exist in Go so those URLs are usable
  by the launched external agents

This is the highest-leverage next step because the attempted final Phase 12
inventory found a real product-visible omission in the Go send path rather than
another executor/runtime parity gap.

## Current Status

Completed before this slice:

- Go-owned external-agent send/hydrate/stop/approval/question transport
- Go-owned active runtime ownership and Codex/OpenCode/Claude executors
- Codex/OpenCode/Claude rich item plus MCP-status parity
- Codex raw non-`response_item` tool-item parity
- Go-owned external prompt/app-generation shaping

Completed in this slice:

- `internal/chatattachments/service.go`
  - explicit Go-owned attachment collection/deduping from chat messages
  - explicit attachment prompt-text shaping with the same artifacts-root
    restrictions Python uses
  - explicit token-backed attachment URL minting for external-agent runs
  - explicit download-token validation and artifact serving inputs for the
    thin HTTP route
- `internal/externalagents/send.go`
  - Go-owned attachment payload composition before executor start
  - explicit adapter-specific payload shaping:
    - Claude: `attachmentText`
    - Codex: `attachmentTextNoImages` plus `attachmentUrls`
    - OpenCode: `attachmentUrls`
- `internal/httpapi/attachment_routes.go`
  - thin unauthenticated token-backed attachment download transport at
    `/api/attachments/{token}`
- focused tests in:
  - `internal/chatattachments/service_test.go`
  - `internal/externalagents/send_test.go`
  - `internal/httpapi/attachment_routes_test.go`

Resolved by this slice:

- Go external-agent send path now derives attachment payload inputs from chat
  messages
- Codex/OpenCode/Claude executors now receive the attachment payload inputs
  they already know how to consume
- Go now exposes the token-backed attachment download route needed by
  external-agent `attachmentUrls`
- focused Go tests now prove external-agent attachment behavior

Still missing after this slice:

- only final Phase 12 inventory/closeout work to determine whether any
  concrete external-agent product-visible gap still remains after the landed
  runtime, executor, parity, prompt-composition, and attachment slices

## Scope

This slice delivered:

- a bounded Go attachment payload builder for external-agent runs
  - collect and dedupe file attachments from chat messages
  - build attachment prompt text blocks using the same artifacts-root
    restrictions Python uses
  - build `attachmentText`, `attachmentTextNoImages`, and `attachmentUrls`
    according to adapter needs
- send-path ownership in `internal/externalagents/send.go`
  - populate attachment payload inputs before executor start
  - keep executor ownership unchanged so Codex/OpenCode/Claude keep consuming
    the same payload keys they already know about
- a minimal token-backed attachment download route in Go
  - route should validate signed tokens and serve files from the canonical
    artifacts root
  - do not broaden into general attachment helper-route migration unless this
    slice proves it is necessary
- focused tests covering:
  - attachment collection/deduping and prompt-text shaping
  - external send service payload shaping for Codex/OpenCode/Claude
  - attachment download token validation and file serving

## Non-Goals

- broad artifact-route migration
- frontend attachment preview/download route parity
- managed `setta_llm` attachment work
- deployment/share attachment transport unless a concrete dependency appears
- speculative attachment heuristics outside the canonical attachment metadata
  and artifacts-root rules already used by Python

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-12-managed-chat-runtime-and-ai-route-foundation.md`
- `docs/reference/external-agents.md`
- `docs/reference/chat-sections.md`
- `backend/setta/routers/attachments.py`
- `backend/setta/agentic/external_agent_runner.py`
- `backend/setta/utils/chat_attachments.py`
- `backend/setta/utils/attachment_tokens.py`
- `backend/setta/utils/attachment_paths.py`
- `backend/setta/agentic/external_adapters/codex_app_server.py`
- `backend/setta/agentic/external_adapters/opencode_sdk.py`
- `backend/setta/agentic/external_adapters/claude_sdk.py`
- `tests/utils/test_chat_attachments.py`
- `tests/agentic/test_opencode_sdk_adapter_parts.py`
- `tests/llm/test_agent_runner_attachments.py`
- `internal/externalagents/send.go`
- `internal/externalagents/codex_executor.go`
- `internal/externalagents/opencode_executor.go`
- `internal/externalagents/claude_executor.go`
- `internal/httpapi/httpapi.go`
- `internal/auth/session.go`

## Recommended Design

1. Keep attachment payload ownership outside the executors.
   - Send-time shaping should happen once, before runtime activation.

2. Add an explicit Go attachment service instead of widening `send.go`.
   - Keep attachment collection, prompt-text building, token minting, and
     download resolution behind a narrow boundary.

3. Reuse the current session secret and canonical artifacts root as the source
   of truth.
   - Do not invent a second attachment storage path or heuristic URL scheme.

4. Keep the transport dependency minimal.
   - Land the token-backed attachment download route required by
     external-agent URLs, but do not broaden into full helper-route parity
     unless this slice requires it.

5. Stay adapter-explicit.
   - Claude: `attachmentText`
   - Codex: `attachmentTextNoImages` plus `attachmentUrls` for images
   - OpenCode: `attachmentUrls` for file parts

## Landing Outcome

1. Restored external-agent attachment payload shaping in the Go send path.
2. Restored a Go-owned token-backed attachment download route for
   external-agent URLs.
3. Added focused tests proving attachment prompt/url behavior and
   download-token validation.
4. Returned the remaining Phase 12 work to final closeout/inventory rather
   than another known external-agent slice.

## Verification

- `./scripts/go.sh test ./internal/externalagents -run 'Send|Codex|OpenCode|Claude|Attachment'`
- `./scripts/go.sh test ./internal/httpapi -run 'Attachment|AI|ExternalAgent'`
- `./scripts/go.sh test ./internal/chatattachments ./internal/externalagents ./internal/httpapi -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- treat attachment payload shaping as a real Phase 12 gap because the Go
  executors already consume those payload keys but the Go send path never
  populates them
- keep attachment payload construction out of the executors so adapter
  boundaries stay thin
- add only the attachment download route dependency required by external-agent
  URLs instead of migrating the broader attachment helper-route surface

## Open Questions

- whether any concrete product-visible external-agent gap still remains after
  restoring attachment payload shaping and token-backed downloads
  - recommendation: answer this with the final Phase 12 inventory/closeout
    pass rather than broadening attachment transport speculatively

## Next Recommended Step

- run the final Phase 12 external-agent inventory/closeout pass and only open
  another slice if that reassessment finds a concrete user-facing gap
