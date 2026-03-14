# anthropic-sdk-go

- Module: `github.com/anthropics/anthropic-sdk-go`
- Local status: pinned in `go.mod`; active for the managed-chat Anthropic
  provider edge
- Retrieved: 2026-03-12
- Local source of truth: the pinned module in the repo Go toolchain cache plus
  focused runtime tests in `internal/managedllm`
- Official repo: https://github.com/anthropics/anthropic-sdk-go
- Go package docs: https://pkg.go.dev/github.com/anthropics/anthropic-sdk-go
- Anthropic API docs root: https://docs.anthropic.com/

## Why It Exists In This Rewrite

- selected provider-edge boundary for Go-owned Anthropic managed-chat
  execution
- used by the active managed-chat Anthropic messages transport
- aligned with the rewrite rule to use official provider SDKs behind bounded
  adapters instead of widening bespoke provider transport code

## Official Guidance Captured Locally

- the pinned SDK exposes typed message request params plus streaming helpers
  through `Messages.NewStreaming(...)`
- request options include `WithBaseURL`, `WithAPIKey`, `WithJSONSet`,
  `WithMaxRetries`, and `WithEnvironmentProduction`
- tool use and tool result content blocks are first-class typed request and
  event shapes in the SDK

## API Surface To Evaluate First

- client construction and request-option wiring for API key, base URL, retry,
  and environment behavior
- streaming messages support used by `internal/managedllm`
- tool-use request/event shapes needed to preserve the current Setta managed
  tool execution contract
- custom base URL handling needed for test servers and Anthropic-compatible
  deployments

## Usage Rules For This Repo

- keep SDK usage behind internal Anthropic adapter helpers; do not let SDK
  types become repo-wide domain types
- keep Setta config as the source of truth for API keys and base URLs instead
  of inheriting ambient provider env behavior
- do not add new bespoke Anthropic HTTP or SSE clients in Go by default
- if a required Anthropic surface is missing or awkward in the SDK, stop and
  make that an explicit planning decision instead of silently widening raw
  transport code

## Repo-Local Migration Targets

- `internal/managedllm/anthropic_sdk.go`
  - active managed-chat Anthropic messages transport now uses
    `anthropic-sdk-go`
  - bounded adapter keeps Setta-owned request validation, tool execution, and
    websocket event mapping semantics intact

## Gotchas

- the SDK has environment-aware defaults, so the repo adapter should keep
  ambient `ANTHROPIC_*` env vars from silently overriding Setta config or test
  wiring
- Anthropic requires `max_tokens`; the repo adapter defaults that field to
  `4096` when the managed config does not set it so the Go runtime preserves
  the current Python/litellm behavior
- the rewrite still has to preserve Setta's existing tool-call and live
  websocket event contracts even when the upstream SDK prefers different
  payload or event shapes
