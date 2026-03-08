# Phase 12 External-Agent Prompt And App-Generation Parity

## Purpose

This doc narrows the remaining concrete Phase 12 external-agent gap into one
bounded follow-on over the already-landed Go runtime, route, and executor
ownership.

The goal of this slice is to close the send-time prompt-shaping behavior that
Python still owns today:

- agent-profile `systemPrompt` content must reach external-agent runs
- external app-generation-mode prompt sections must reach external-agent runs
- reference-image prompt inputs for image-guided app generation must be
  normalized and gated before they reach external-agent runs

This is the highest-leverage next step because the earlier "final closeout"
inventory found a real user-facing omission in the current Go send path rather
than another executor/runtime gap.

## Current Status

Completed before this slice:

- Go-owned external-agent send/hydrate/stop/approval/question transport
- Go-owned active runtime ownership and Codex/OpenCode/Claude executors
- Codex/OpenCode/Claude rich item plus MCP-status parity
- Codex raw non-`response_item` tool-item parity

Still missing before this slice:

- Go external-agent send path does not yet compose app-generation-mode prompt
  sections the way Python `route_get_llm_response` does
- Go external-agent send path does not yet include agent-profile
  `systemPrompt` content in the prompt payload sent to Codex/OpenCode/Claude
- Go does not yet normalize image-reference prompt inputs for external
  app-generation mode, so those fields are currently accepted by the route but
  ignored by the runtime
- focused Go tests do not yet prove this prompt-shaping behavior for external
  runs

## Scope

This slice should deliver:

- bounded prompt-shaping helpers in `internal/externalagents`
  - build external app-generation-mode prompt sections from:
    - `appGenerationMode`
    - `appSpecStreamingEnabled`
    - `appGenerationReferenceImageUrl`
    - `appGenerationReferenceImageNotes`
  - normalize and size-guard reference-image inputs
  - merge agent-profile `systemPrompt` content with the app-generation prompt,
    runtime execution policy prompt, and required completion-gate prompt
- send-path ownership in `internal/externalagents/send.go`
  - external runs should receive the composed `systemPrompt` in executor inputs
  - keep tool allowlist ownership on the profile boundary already used by
    Claude/OpenCode/Codex executors
- focused tests covering:
  - external send service prompt composition with an agent profile
  - external send service app-generation prompt composition
  - image-reference prompt inclusion only for image mode
  - reference-image normalization/size validation

## Non-Goals

- another executor/runtime rewrite
- porting the entire Python external-runner object graph
- reopening Codex/OpenCode/Claude item/runtime parity work
- broad agentic-context or websocket redesign
- heuristic prompt synthesis beyond the explicit route/profile inputs already
  used by Python

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-12-managed-chat-runtime-and-ai-route-foundation.md`
- `docs/reference/external-agents.md`
- `backend/setta/routers/ai.py`
- `backend/setta/agentic/system_prompt.py`
- `tests/routers/test_ai_agent_run_chats.py`
- `tests/routers/test_ai_app_generation_mode.py`
- `internal/externalagents/send.go`
- `internal/httpapi/ai_routes.go`
- `internal/agentprofiles/store.go`

## Recommended Design

1. Keep ownership in the Go external-agent send service.
   - Do not broaden routes or executors for prompt construction.

2. Add explicit helpers instead of widening `StartChat(...)` further.
   - Keep app-generation prompt building and reference-image normalization in
     dedicated helpers near `send.go`.

3. Preserve the existing executor boundary.
   - Executors should continue consuming a composed `inputs["systemPrompt"]`
     string rather than reaching into profile/system-prompt composition logic.

4. Reuse the profile boundary only for profile-owned data.
   - Keep tool allowlists on `request.Profile`.
   - Flow prompt text through the canonical `systemPrompt` input payload.

5. Keep the slice bounded to Python-proven prompt behavior.
   - Do not broaden into full Python `ExternalAgentRunner._build_system_prompt`
     parity unless a concrete user-visible gap remains after this landing.

## Landing Outcome

1. Restore external agent-profile system-prompt delivery in the Go send path.
2. Restore external app-generation prompt shaping, including reference-image
   prompt text where applicable.
3. Add focused tests proving external prompt composition and input validation.
4. Reassess whether Phase 12 is back to final closeout/inventory after this
   landing.

## Verification

- `./scripts/go.sh test ./internal/externalagents -run 'Send|Codex|OpenCode|Claude'`
- `./scripts/go.sh test ./internal/httpapi -run 'AI|ExternalAgent|GetLLMResponse'`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- treat external prompt shaping as a real Phase 12 gap because the current Go
  route accepts those fields but the runtime drops them
- keep prompt composition in `internal/externalagents/send.go` instead of
  duplicating it inside each executor
- flow prompt text through `inputs["systemPrompt"]`, which is already the
  shared executor contract across Codex/OpenCode/Claude

## Open Questions

- whether a later slice should also port more of Python's broader external
  system-prompt scaffolding, such as additional project/profile framing beyond
  the profile system prompt and app-generation sections
  - recommendation: not in this slice; land the clearly observed prompt gap
    first and reassess from concrete behavior

## Next Recommended Step

- land this bounded external prompt/app-generation slice, then reassess whether
  Phase 12 can return to final closeout/inventory
