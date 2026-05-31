# Setta Agent-Friendly CLI and Skill Plan

## Purpose

Setta should be easy for AI agents to operate without memorizing the app's
internal APIs. The durable interface should be a self-describing `setta` CLI
with stable JSON behavior, workflow-oriented commands, generated low-level API
coverage, and a concise skill that teaches agents how to discover and use the
CLI.

The goal is not to make a giant static manual. The goal is to make Setta safe,
inspectable, and predictable from a shell.

## Current Repo Shape

- The Go backend process is `cmd/setta-backend`.
- The Electron main process starts the Go backend automatically for desktop use.
- The backend writes a JSON ready event with its loopback address on stdout.
- HTTP endpoint contracts are owned by `internal/httpapi/endpoints.go`.
- TypeScript backend contracts are generated from the Go registry by
  `cmd/generate-contracts`.
- Chat workflows include persistent conversations, runs, streamed activity,
  queueing, steering, approvals, Codex account state, and event streaming.

These constraints are important: a CLI, skill reference, and low-level API
surface must not become separate handwritten mirrors of the backend contracts.

## Design Principles

1. Keep Go as the contract owner.
   - Endpoint request and response contracts stay owned by `internal/httpapi`.
   - Low-level CLI API discovery is derived from `httpapi.Contracts()`.
   - Any generated TypeScript, JSON Schema, command index, or skill reference
     must be regenerated from owner-defined Go inputs.

2. Provide workflow commands first.
   - Agents should use commands such as `setta workspace open`,
     `setta conversation create`, `setta chat send`, and `setta run watch`.
   - Do not expose the backend endpoint registry as the primary UX.
   - Keep `setta api ...` as the complete low-level escape hatch.

3. Use production paths.
   - The CLI should talk to the backend over the same HTTP contracts used by
     the desktop app.
   - CLI workflow tests should use temporary app data and real backend/store
     paths.
   - Do not add direct store manipulation paths for convenience commands.

4. Make automation behavior explicit.
   - Data goes to stdout.
   - Diagnostics, warnings, progress, and logs go to stderr.
   - `--json` returns stable machine-readable output.
   - Streaming commands use newline-delimited JSON with stable event envelopes.
   - `--no-input` forbids prompts.
   - Destructive commands require explicit scope and `--confirm`.
   - `--dry-run` is advertised only when the backend can provide a real no-op
     preview. Do not fake dry-run estimates.

5. Prefer deterministic IDs over fuzzy lookup.
   - Commands that mutate or inspect workspace/chat state should require stable
     IDs returned by previous JSON output.
   - If convenience aliases are added later, they must be deterministic and
     visible in `setta help ... --json`.

6. Do not add legacy compatibility paths.
   - Setta is early-stage, so CLI and skill implementation should use the
     cleanest current contract shape.
   - Do not add backward-compatibility shims, transitional adapters, dual
     read/write paths, old-field aliases, silent compatibility fallbacks, or
     migrations unless that exact compatibility work is explicitly requested.
   - When a contract or command shape changes during development, update the
     owner-defined source and regenerate affected outputs instead of preserving
     the old shape.

## Proposed Architecture

### New User-Facing CLI

Add a separate user-facing binary:

```text
cmd/setta
internal/settacli
internal/settahttpclient
internal/agentdocs
```

`cmd/setta-backend` remains the backend daemon. `cmd/setta` becomes the
automation surface for humans, scripts, and agents.

The CLI should use a normal command registry, not ad hoc flag parsing spread
across files. The registry should power:

- command execution
- `setta commands --json`
- `setta help <path> --json`
- `setta schema <path> --json`
- generated skill reference material
- command coverage tests

### Backend Connection Model

Initial required connection modes:

```sh
setta --backend-addr http://127.0.0.1:PORT health --json
SETTA_BACKEND_ADDR=http://127.0.0.1:PORT setta health --json
setta backend start --app-data-dir DIR --json
```

The backend start command should print a stable ready object:

```json
{
  "schemaVersion": 1,
  "addr": "http://127.0.0.1:54321",
  "appDataDir": "/tmp/setta-app-data",
  "pid": 12345,
  "version": "dev"
}
```

Concrete first-slice usage:

```sh
APP_DATA_DIR="$(mktemp -d)"
setta backend start --app-data-dir "$APP_DATA_DIR" --json
```

The command prints the backend address. The caller then passes that address
explicitly:

```sh
setta --backend-addr http://127.0.0.1:54321 health --json
setta --backend-addr http://127.0.0.1:54321 workspace open "$PWD" --json
setta --backend-addr http://127.0.0.1:54321 conversation create --workspace WORKSPACE_ID --title "CLI test" --json
```

Or stores it in the environment:

```sh
export SETTA_BACKEND_ADDR=http://127.0.0.1:54321
setta health --json
setta workspace open "$PWD" --json
```

For the first implementation slice, the CLI should either start a backend with
explicit app data or receive an explicit backend address. It should not guess
which desktop backend to use.

Auto-discovery of a running desktop backend should be a later milestone. If
Setta writes a discoverable connection file, add local-process protection first:

- bind only to loopback
- write connection metadata under the app data directory with owner-only file
  permissions
- include a random per-backend token
- require that token on HTTP requests from external CLI clients
- rotate the token on backend restart

Do not make an unauthenticated backend discoverable merely to simplify CLI use.

### Low-Level API Escape Hatch

Add generated low-level coverage from `httpapi.Contracts()`:

```sh
setta api endpoints --json
setta api schema OpenWorkspace --json
setta api call OpenWorkspace --input request.json --json
setta api call ListConversations --input - --json
setta api stream EventStream --cursor 123 --ndjson
```

This should exist for completeness, debugging, and rare agent tasks. It should
not replace workflow commands.

### Workflow Command Tree

Use stable nouns and a small verb set:

```text
get, list, open, create, send, queue, edit, remove, select,
close, cancel, watch, submit, start, stop, refresh, logout
```

Recommended initial command families:

```sh
setta version --json
setta health --json
setta commands --json
setta help <command-path> --json
setta schema <command-path> --json
setta errors --json

setta backend start --app-data-dir DIR --json
setta backend status --json

setta workspace session --json
setta workspace open PATH --json
setta workspace select WORKSPACE_ID --json
setta workspace close WORKSPACE_ID --json
setta workspace recent remove WORKSPACE_ID --confirm --json
setta workspace reorder --ids-file ids.json --json

setta conversation list --workspace WORKSPACE_ID --json
setta conversation create --workspace WORKSPACE_ID --title TITLE --json
setta conversation mark-read --workspace WORKSPACE_ID --conversation CONVERSATION_ID --json

setta message page --workspace WORKSPACE_ID --conversation CONVERSATION_ID --limit 100 --json

setta chat send --workspace WORKSPACE_ID --conversation CONVERSATION_ID --prompt-file - --json
setta chat send --workspace WORKSPACE_ID --conversation CONVERSATION_ID --prompt-file prompt.md --wait --ndjson
setta chat queue --workspace WORKSPACE_ID --conversation CONVERSATION_ID --prompt-file - --json
setta chat queue edit --workspace WORKSPACE_ID --conversation CONVERSATION_ID --message MESSAGE_ID --prompt-file - --json
setta chat queue remove --workspace WORKSPACE_ID --conversation CONVERSATION_ID --message MESSAGE_ID --json
setta chat steer --workspace WORKSPACE_ID --conversation CONVERSATION_ID --prompt-file - --json
setta chat steer-immediate --workspace WORKSPACE_ID --conversation CONVERSATION_ID --prompt-file - --json

setta chat command list --workspace WORKSPACE_ID --conversation CONVERSATION_ID --json
setta chat command execute --workspace WORKSPACE_ID --conversation CONVERSATION_ID --raw "/goal ..." --json
setta chat model set --workspace WORKSPACE_ID --conversation CONVERSATION_ID --model MODEL_ID --json
setta chat reasoning-effort set --workspace WORKSPACE_ID --conversation CONVERSATION_ID --effort high --json

setta run active --workspace WORKSPACE_ID --conversation CONVERSATION_ID --json
setta run list --workspace WORKSPACE_ID --conversation CONVERSATION_ID --json
setta run activity --workspace WORKSPACE_ID --run RUN_ID --limit 200 --json
setta run item-output --workspace WORKSPACE_ID --run RUN_ID --item RUN_ITEM_ID --after 0 --limit 200 --json
setta run watch --workspace WORKSPACE_ID --conversation CONVERSATION_ID --run RUN_ID --ndjson
setta run cancel --workspace WORKSPACE_ID --conversation CONVERSATION_ID --confirm --json

setta approval list --workspace WORKSPACE_ID --conversation CONVERSATION_ID --json
setta approval submit --workspace WORKSPACE_ID --conversation CONVERSATION_ID --approval APPROVAL_ID --approve --json
setta approval submit --workspace WORKSPACE_ID --conversation CONVERSATION_ID --approval APPROVAL_ID --deny --json
setta approval answer --workspace WORKSPACE_ID --conversation CONVERSATION_ID --approval APPROVAL_ID --answers-file answers.json --json
setta approval cancel --workspace WORKSPACE_ID --conversation CONVERSATION_ID --approval APPROVAL_ID --json

setta codex account get --json
setta codex account refresh --json
setta codex login start --json
setta codex login cancel --json
setta codex logout --confirm --json

setta agent guide --format markdown
setta agent skill export --output DIR
```

`setta approval list` may require a new explicit backend endpoint if pending
approvals cannot be represented cleanly through existing run activity responses.
Prefer adding a typed endpoint over teaching agents to scrape activity output.

## Machine-Readable Discovery

Add a Go command metadata type similar to:

```go
type CommandSpec struct {
    Path              []string `json:"path"`
    Summary           string   `json:"summary"`
    Stability         string   `json:"stability"`
    Mutates           bool     `json:"mutates"`
    Dangerous         bool     `json:"dangerous"`
    RequiresBackend   bool     `json:"requiresBackend"`
    SupportsJSON      bool     `json:"supportsJson"`
    SupportsNDJSON    bool     `json:"supportsNdjson"`
    SupportsDryRun    bool     `json:"supportsDryRun"`
    RequiredFlags     []string `json:"requiredFlags"`
    OptionalFlags     []string `json:"optionalFlags"`
    InputSchemaName   string   `json:"inputSchemaName"`
    OutputSchemaName  string   `json:"outputSchemaName"`
    RelatedOperations []string `json:"relatedOperations"`
    Examples          []string `json:"examples"`
}
```

Workflow command specs are hand-authored because they are product UX.
Request/response schemas referenced by workflow specs should come from Go types
or explicitly owned CLI input/output structs.

Low-level API command specs are generated from `httpapi.Contracts()`.

`setta help <path> --json` should include:

- usage
- required flags
- optional flags
- examples
- mutation and danger metadata
- backend requirement metadata
- input schema
- output schema
- exit codes

## Output and Error Contracts

Use a stable success envelope for machine-readable workflow output:

```json
{
  "schemaVersion": 1,
  "command": "workspace open",
  "data": {},
  "warnings": []
}
```

Use stable NDJSON envelopes for streaming:

```json
{"schemaVersion":1,"type":"run.started","runId":"run_123"}
{"schemaVersion":1,"type":"item.delta","runId":"run_123","itemId":"item_456","delta":"..."}
{"schemaVersion":1,"type":"run.completed","runId":"run_123","status":"completed"}
```

Use a stable error envelope on stdout when `--json` is set and stderr for human
diagnostics:

```json
{
  "schemaVersion": 1,
  "error": {
    "code": "workspace_not_found",
    "message": "workspace not found: ws_123",
    "retryable": false
  }
}
```

Recommended exit codes:

```text
0  success
2  invalid command or invalid arguments
3  backend unavailable
4  authentication or account state failure
5  permission or approval denied
6  not found
7  conflict or active-run state mismatch
8  backend/runtime failure
9  validation failure from backend contract
10 interrupted or cancelled
```

Map backend `ErrorResponse.error.code` values into these exit classes without
discarding the original backend code.

## Skill Package

Create one initial skill package, not one skill per command. This package is a
runtime/distribution artifact, not a documentation plan, so the source of truth
should not live under `docs/`.

```text
skills/setta-cli/
  SKILL.md
  agents/
    openai.yaml
  references/
    command-index.md
    backend-connection.md
    workspaces-and-conversations.md
    chat-runs-and-approvals.md
    codex-account.md
    low-level-api.md
  scripts/
    smoke-test-setta-cli.sh
```

Package this directory with the app distribution. If the desktop build later
needs bundled resources under a desktop-specific path, copy from
`skills/setta-cli/` during packaging instead of maintaining a second skill copy.

The main `SKILL.md` should stay short. It should teach the operating procedure:

1. Run `setta version --json`.
2. Run `setta commands --json`.
3. Use `setta help <path> --json` before unfamiliar commands.
4. Prefer `--json` or `--ndjson`.
5. Use `--no-input` for automation.
6. Use explicit workspace, conversation, run, and approval IDs.
7. Use `--confirm` only when the user has requested the destructive operation.
8. Use `setta api ...` only when no workflow command covers the task.

Reference files should be loaded only when relevant. The detailed command index
should be generated from the CLI command registry, not handwritten. Any
handwritten reference should explain workflows and safety rules, not duplicate
schemas that can be discovered with `setta schema`.

`setta agent guide --format markdown` should print a tiny bootstrap guide that
can be pasted into `AGENTS.md`, `CLAUDE.md`, or similar files. If Setta later
adds a write mode, it must be explicit:

```sh
setta agent guide --write AGENTS.md --confirm
```

## Implementation Milestones

### Milestone 1: CLI Foundation

- Add `cmd/setta`.
- Add a command registry with global flags: `--json`, `--no-input`,
  `--backend-addr`, `--timeout`, `--verbose`, and `--quiet`.
- Add `version`, `commands`, `help`, `schema`, and `errors`.
- Add unit tests for command parsing, output routing, error envelopes, and
  discovery JSON.

Definition of done: an agent can inspect the CLI without a running backend.

### Milestone 2: Contract-Derived API Layer

- Add a Go HTTP client that uses the existing endpoint registry metadata.
- Add `setta api endpoints`, `setta api schema`, `setta api call`, and
  `setta api stream`.
- Add JSON Schema generation from Go-owned request and response types.
- Reuse or factor the existing contract generator logic instead of creating a
  second list of contract types.

Definition of done: every endpoint in `internal/httpapi/endpoints.go` is
reachable through `setta api` without maintaining a separate endpoint list.

### Milestone 3: Workspace and Conversation Workflows

- Add backend connection support.
- Add workspace session/open/select/close/reorder/recent commands.
- Add conversation list/create/mark-read commands.
- Add message page retrieval.
- Test against a real backend with temporary app data.

Definition of done: an agent can open a temp workspace, create a conversation,
and inspect conversation/message state using only workflow commands.

### Milestone 4: Chat Runs, Streaming, Queueing, and Steering

- Add `chat send`, `chat queue`, `chat steer`, and `run` commands.
- Add `--wait --ndjson` for commands that start or observe a run.
- Add `run watch` backed by the production event stream.
- Preserve cursor/restart behavior where applicable.
- Keep large output bounded with `--limit`, `--after`, and item-output paging.

Definition of done: an agent can send a message, watch streamed assistant
output, queue while a run is active, steer, and inspect completion state.

### Milestone 5: Approvals and Codex Account Workflows

- Add approval list/submit/answer/cancel commands.
- Add an explicit pending-approvals endpoint if existing responses do not
  expose approvals cleanly.
- Add Codex account get/refresh/login/logout commands.
- Require `--confirm` for logout and any destructive approval action.

Definition of done: an agent can discover pending approvals and respond to them
without scraping transcript text.

### Milestone 6: Skill Package and Agent Bootstrap

- Add `skills/setta-cli/SKILL.md`.
- Add one-level-deep reference files.
- Generate `references/command-index.md` from the command registry.
- Add `setta agent guide --format markdown`.
- Add a smoke script that validates the skill's first-step commands.

Definition of done: a fresh agent can load the skill, inspect the CLI, open a
workspace, create a conversation, and send or watch a chat task without hidden
repo knowledge.

### Milestone 7: Quality Gates

- Add focused Go tests for CLI registry, schemas, output envelopes, and errors.
- Add CLI workflow E2E tests with temporary app data and the scripted chat
  harness.
- Add live Codex CLI workflow coverage when `.env` contains `OPENAI_API_KEY`.
- Keep the existing Electron app workflow gate for changes touching chat,
  Codex harness behavior, provider protocol handling, run lifecycle, queueing,
  steering, approvals, event streaming, IPC/preload contracts, generated
  backend contracts, renderer chat state, or transcript UI.
- Integrate the CLI workflow gate into `./check_quality.sh --all` once stable.

Definition of done: CLI behavior is covered as an agent surface, and app
workflow coverage remains intact for desktop production paths.

## First Useful Vertical Slice

The smallest slice that proves the approach:

1. `cmd/setta` with `version`, `commands`, `help`, and `errors`.
2. `setta backend start --app-data-dir DIR --json`.
3. `setta workspace open PATH --json`.
4. `setta conversation create --workspace WORKSPACE_ID --title TITLE --json`.
5. `setta chat send --workspace WORKSPACE_ID --conversation CONVERSATION_ID --prompt-file - --json`.
6. Deterministic backend E2E test using temporary app data and the scripted
   chat harness.
7. Draft `skills/setta-cli/SKILL.md` that tells agents to discover commands at
   runtime.

This slice keeps the scope small while proving the central promise: an agent can
operate Setta through a stable CLI without reading the codebase.

## Open Decisions

- Binary name: default to `setta` unless product distribution requires another
  name.
- CLI framework: choose a Go command framework only if it improves command
  registry quality without obscuring generated discovery.
- Backend auto-discovery: defer until local auth and connection metadata are
  designed.
- Skill distribution format: keep source-of-truth files in `skills/setta-cli`
  and decide later whether the packaged output is shipped directly, packaged as
  a Codex plugin, exported by `setta agent skill export`, or copied into a
  desktop resource directory at build time.
