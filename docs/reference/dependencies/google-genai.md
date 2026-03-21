# google-genai

- Module: `google.golang.org/genai`
- Local status: pinned in `go.mod`; active for the managed-chat Gemini
  standard/tool-execution provider edge
- Retrieved: 2026-03-12
- Local source of truth: the pinned module in the repo Go toolchain cache plus
  focused runtime tests in `internal/managedllm`
- Official repo: https://github.com/googleapis/go-genai
- Go package docs: https://pkg.go.dev/google.golang.org/genai
- Gemini API docs root: https://ai.google.dev/gemini-api/docs

## Why It Exists In This Rewrite

- selected provider-edge boundary for Go-owned Gemini managed-chat execution
- used by the active managed-chat Gemini standard/tool-execution transport
- aligned with the rewrite rule to use the official provider SDK behind a
  bounded adapter instead of widening bespoke provider transport code

## Official Guidance Captured Locally

- the pinned SDK exposes typed client construction plus streaming
  `GenerateContent` support for Gemini models
- the SDK includes typed request/config structs for generation config, system
  instruction, function tools, and function responses
- request options include explicit base URL and HTTP client wiring, which the
  repo adapter uses to keep test servers and provider-compatible endpoints
  under Setta control

## API Surface To Evaluate First

- client construction and option wiring for API key, base URL, retries, and
  HTTP client behavior
- `Models.GenerateContentStream` support used by `internal/managedllm`
- function-call and function-response shapes needed to preserve the current
  Setta managed MCP tool loop
- custom base URL handling needed for local test servers and Gemini-compatible
  deployments

## Usage Rules For This Repo

- keep SDK usage behind internal Gemini adapter helpers; do not let SDK types
  become repo-wide domain types
- keep Setta config as the source of truth for API keys and base URLs instead
  of inheriting ambient provider env behavior
- do not add new bespoke Gemini HTTP or SSE clients in Go by default
- if a required Gemini surface is missing or awkward in the SDK, stop and make
  that an explicit planning decision instead of silently widening raw
  transport code

## Repo-Local Migration Targets

- `internal/managedllm/gemini_sdk.go`
  - active managed-chat Gemini standard/tool-execution transport now uses
    `google.golang.org/genai`
  - bounded adapter keeps Setta-owned request validation, tool execution, and
    websocket event mapping semantics intact

## Gotchas

- the pinned SDK still has ambient env fallback behavior that the repo adapter
  cannot cleanly disable from outside the package, so the current slice
  requires explicit `api_key_env` for Gemini managed configs
- Gemini thinking/runtime-support reachability is still intentionally deferred;
  this landed slice only covers standard turns plus the existing managed MCP
  tool loop
- the rewrite still has to preserve Setta's existing tool-call and live
  websocket event contracts even when the upstream SDK prefers different
  payload or event shapes
