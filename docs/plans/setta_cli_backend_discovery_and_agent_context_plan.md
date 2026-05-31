# Setta CLI Backend Discovery and Agent Context Plan

## Purpose

The `setta` CLI should be easy for agents to use without requiring every
backend-backed command to include `--backend-addr`. The common workflow should
be:

```sh
setta workspace session --json
setta conversation list --workspace "$SETTA_WORKSPACE_ID" --json
setta chat send --conversation "$SETTA_CONVERSATION_ID" --prompt-file - --json
```

The CLI still needs deterministic behavior. It should not scan ports, guess
between unrelated desktop instances, or make an unauthenticated loopback backend
discoverable.

This plan assumes the primary agentic workflow is launched from the Setta
Electron app. In that workflow, Setta already knows the active backend,
workspace, conversation, and run context, so it should pass that context to the
agent instead of forcing the agent to rediscover it.

## Goals

- Remove `--backend-addr` from the normal agent workflow.
- Keep explicit backend addressing available for tests, scripts, and debugging.
- Make desktop backend discovery deterministic and local to the app data root.
- Add backend request authentication before adding automatic desktop discovery.
- Inject useful Setta context into agents launched from the frontend.
- Preserve production HTTP paths; do not add direct store access paths for CLI
  convenience.

## Non-Goals

- Do not introduce fixed backend ports.
- Do not scan loopback ports to find a backend.
- Do not support fuzzy selection between multiple running Setta app data roots.
- Do not make local auth a security boundary against malicious code already
  running as the same OS user. The token mainly prevents accidental or
  cross-user loopback access and stale-port confusion.
- Do not add legacy compatibility shims for old unauthenticated desktop
  discovery behavior.

## Current Repo Signals

- `internal/settacli/run.go` currently resolves the backend only from
  `--backend-addr` or `SETTA_BACKEND_ADDR`.
- `desktop/src/main/backend-supervisor.ts` starts the backend on an ephemeral
  loopback port and receives a stdout ready event.
- `cmd/setta-backend` defaults app data to `SETTA_APP_DATA_DIR` or `~/.setta`.
- `internal/settahttpclient/client.go` currently sends no backend auth header.
- `internal/httpapi.NewHandler` currently registers routes without auth
  middleware.
- Codex app-server launches through `codexapp.ProcessConfig.Env`, so Setta has
  a natural place to inject CLI context into agent processes.

## Connection Resolution Model

The CLI should resolve backend connection data in this order:

1. Explicit command line flags:
   - `--backend-addr URL`
   - `--backend-token TOKEN` when token auth is enabled
2. Environment variables:
   - `SETTA_BACKEND_ADDR`
   - `SETTA_BACKEND_TOKEN`
3. Runtime connection file under the selected app data directory:
   - `SETTA_APP_DATA_DIR/runtime/backend.json`
   - default app data: `~/.setta`

If none of these produce a valid connection, backend-backed commands should fail
with a specific diagnostic:

```text
backend connection was not found; start Setta, set SETTA_BACKEND_ADDR, or pass --backend-addr
```

The CLI should validate any discovered connection before using it:

- URL must be `http://` and loopback.
- Runtime file must have the expected schema version.
- Runtime file permissions must be owner-only where the platform supports it.
- PID must still be alive when the platform supports that check.
- A health request with the token must succeed.

## Runtime Connection File

When a Setta backend is started by desktop or `setta backend start`, Setta should
write a runtime connection file:

```json
{
  "schemaVersion": 1,
  "addr": "http://127.0.0.1:54321",
  "token": "random-per-backend-token",
  "pid": 12345,
  "appDataDir": "/Users/kevin/.setta",
  "startedAt": "2026-06-03T12:00:00Z",
  "version": "dev"
}
```

File rules:

- Path: `<appDataDir>/runtime/backend.json`.
- Create parent directories with owner-only permissions.
- Write atomically through a temp file plus rename.
- Use `0600` for the file on Unix-like systems.
- Remove the file on expected backend shutdown.
- Treat missing, malformed, stale, or auth-failing files as unavailable.
- Never write this file for non-loopback backend URLs.

The token should be rotated for every backend start. Do not reuse a previous
token from the runtime file.

## Backend Auth

Add a random backend token to the normal backend launch path before enabling
runtime-file discovery.

Recommended request header:

```text
Authorization: Bearer <SETTA_BACKEND_TOKEN>
```

Implementation shape:

- Add `AuthToken` to `runtime.Config`.
- Desktop backend supervisor generates a token before spawning the backend.
- `setta backend start` generates a token before spawning the backend.
- Pass the token to `cmd/setta-backend` through an explicit flag or environment
  variable.
- Add HTTP middleware around `httpapi.NewHandler` that rejects missing or
  mismatched tokens.
- Update `settahttpclient.Client` to store an optional token and send the auth
  header on normal calls and streams.
- Update desktop backend client and event stream code to send the token.

For development and tests, prefer explicit test configuration over silent
unauthenticated fallback. If a no-auth mode is needed for narrow handler unit
tests, keep it local to test helpers rather than making production discovery
silently tolerate missing tokens.

## Setta-Launched Agent Context

The primary agent-friendly path is not discovery. It is context injection from
the app that launched the agent.

When Setta starts Codex app-server or any future agent subprocess, inject:

```sh
SETTA_BACKEND_ADDR=http://127.0.0.1:54321
SETTA_BACKEND_TOKEN=<token>
SETTA_APP_DATA_DIR=/Users/kevin/.setta
SETTA_WORKSPACE_ID=<current workspace id>
SETTA_WORKSPACE_ROOT=<current workspace root>
SETTA_CONVERSATION_ID=<current conversation id>
SETTA_RUN_ID=<active run id when applicable>
```

Context should be scoped to what is known and relevant. For example, do not set
`SETTA_CONVERSATION_ID` when an agent is launched outside a conversation.

This lets agents use the CLI without extra addressing:

```sh
setta workspace session --json
setta message page --conversation "$SETTA_CONVERSATION_ID" --limit 100 --json
```

If commands can infer workspace or conversation from injected environment, that
inference should be explicit in command metadata and help output. Stable IDs
remain preferred for mutations and destructive operations.

## CLI UX Changes

Keep `--backend-addr` but stop requiring it in examples for normal desktop
agent usage.

Add:

```sh
setta backend connection --json
```

This command should print the resolved backend connection metadata without
printing the token by default:

```json
{
  "schemaVersion": 1,
  "addr": "http://127.0.0.1:54321",
  "source": "environment",
  "appDataDir": "/Users/kevin/.setta",
  "authenticated": true
}
```

Optionally add a narrowly documented debug flag:

```sh
setta backend connection --show-token --json
```

Only add `--show-token` if there is a concrete workflow that needs it. Prefer
environment injection and runtime-file reads over printing tokens.

Update generated command references and skill docs so backend examples use this
progression:

1. If launched from Setta, run `setta backend connection --json`.
2. If standalone, open Setta or run `setta backend start --app-data-dir DIR`.
3. Use `--backend-addr` only for explicit non-default backends.

## Multiple Instances

The default discovery path should only read the app data root selected by the
CLI process:

- `SETTA_APP_DATA_DIR` when set.
- Otherwise `~/.setta`.

If multiple Setta desktop instances exist with different app data directories,
the CLI should not search all of them. The caller must set `SETTA_APP_DATA_DIR`
or pass explicit connection values.

If one app data root has a stale runtime file, the CLI should report that
specific file as stale and not try to find another backend.

## Implementation Milestones

### Milestone 1: Connection Data Types

- Add shared Go types for backend connection metadata.
- Add CLI connection resolution helpers.
- Add unit tests for precedence:
  `--backend-addr` > environment > runtime file.
- Add stale-file and malformed-file tests.

Definition of done: CLI can resolve and validate connection metadata without
changing backend auth yet.

### Milestone 2: Backend Token Auth

- Add token configuration to backend startup.
- Add auth middleware to production HTTP server construction.
- Update Go CLI HTTP client to send the token.
- Update Electron main backend client and event stream code to send the token.
- Update handler/server/client tests for authorized and unauthorized requests.

Definition of done: production backend HTTP paths reject missing tokens and all
first-party callers pass the token.

### Milestone 3: Runtime File Lifecycle

- Write `<appDataDir>/runtime/backend.json` after the backend is ready.
- Use owner-only permissions and atomic writes.
- Remove the file on expected shutdown.
- Have CLI discovery validate URL, PID, token, and health.
- Add tests for stale PID, wrong token, wrong host, and shutdown cleanup.

Definition of done: `setta health --json` works without `--backend-addr` when
the default desktop backend is running.

### Milestone 4: Setta-Launched Agent Env Injection

- Pass backend address, token, app data, workspace, and conversation context to
  Codex app-server through `codexapp.ProcessConfig.Env`.
- Thread active workspace/conversation IDs into the launch context where
  available.
- Add deterministic workflow coverage proving an agent-launched command can call
  `setta` without `--backend-addr`.

Definition of done: a Setta chat agent can use `setta` commands through injected
environment alone.

### Milestone 5: CLI and Skill Documentation

- Add `setta backend connection --json`.
- Update CLI help examples to prefer implicit connection in Setta-launched
  agent workflows.
- Update `skills/setta-cli/references/backend-connection.md`.
- Regenerate generated command references if command metadata changes.

Definition of done: fresh agents learn the implicit connection path before the
explicit `--backend-addr` fallback.

### Milestone 6: End-to-End Verification

Because this touches backend contracts, Electron main/backend wiring, event
streaming, Codex harness process environment, and chat workflow behavior, final
verification should include deterministic Electron app workflow tests through
production main/preload/renderer/HTTP/store paths.

Required focused checks:

- Go tests for CLI connection resolution and HTTP auth behavior.
- Electron main tests for backend supervisor token generation and runtime file
  handling.
- Electron E2E workflow where the app launches the backend, opens a workspace,
  starts a chat, and the agent runs at least one `setta` command without
  `--backend-addr`.
- Live Codex E2E when `.env` contains `OPENAI_API_KEY`; skip narrowly and
  report the skip when absent.

Final broad gate before committing executable changes:

```sh
./scripts/format.sh
./check_quality.sh --all
```

## Suggested First Slice

The smallest useful slice is:

1. Add backend connection resolution types and tests.
2. Add `setta backend connection --json`.
3. Add runtime-file read support without enabling desktop writes yet.
4. Keep `--backend-addr` and `SETTA_BACKEND_ADDR` behavior unchanged.

This proves the CLI UX and diagnostics before the higher-risk backend auth and
Electron launch changes.

The first slice should not claim automatic desktop discovery is complete. That
claim should wait until token auth and runtime file lifecycle are implemented.
