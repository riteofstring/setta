# Chat Workflow E2E Testing Plan

## Status

Implemented.

The chat workflow gate is `./scripts/test_chat_workflows.sh`. It builds the
desktop app unless `--skip-build` is passed, runs deterministic Electron
workflow tests, runs live Codex workflow coverage when `.env` contains
`OPENAI_API_KEY`, and prints an explicit deterministic/live/skip summary.

## Problem

The app can pass unit, service, HTTP, renderer-store, build, and current
Electron integration checks while still breaking obvious user-facing chat
workflows. The missing safety net is end-to-end workflow coverage that drives
the same app boundary a user drives.

Chat features are deceptively cross-cutting. Sending, streaming, queueing,
steering, approvals, cancellation, restart recovery, and provider protocol
handling cross:

- Go chat service and durable file state
- Codex harness and provider protocol mapping
- generated HTTP contracts
- HTTP handlers and event stream
- Electron main process and IPC
- preload API
- renderer store
- transcript and composer UI

Layer tests are still useful, but they are not enough to prove the app works.

## Goals

- Make real app-path chat workflow tests mandatory for chat-related changes.
- Treat live-provider E2E tests as the highest-fidelity verification for Codex
  behavior.
- Keep deterministic E2E tests as the reproducible baseline that runs in every
  development environment.
- Make one command prove the chat workflow gate.
- Reduce future ambiguity by documenting the run/queue state machine and testing
  it through user-visible behavior.

## Non-Goals

- Replacing unit, service, HTTP, or renderer tests.
- Depending only on live-provider tests for all coverage.
- Testing against real developer app state.
- Making provider tests run when credentials are absent.

## Test Strategy

Use both deterministic and live-provider E2E tests.

Deterministic E2E tests:

- Must drive the production Electron/main/preload/renderer/HTTP/store path.
- Must use temporary app data.
- May use a scripted fake Codex/provider harness.
- Should force important timing and failure cases reliably.
- Should run in normal `./check_quality.sh --all` verification.

Live-provider E2E tests:

- Must drive a real Codex provider integration.
- Should be treated as the highest-fidelity verification for chat/Codex changes.
- Should read `OPENAI_API_KEY` from `.env`.
- May skip only when credentials are absent.
- Should clearly report when skipped, because a skip does not prove provider
  integration works.

## Required Workflow Coverage

Add deterministic Electron E2E coverage for:

- open workspace
- create chat
- send message
- receive streamed assistant output
- queue a follow-up while a run is active
- steer an active run
- complete an active run and promote the queued run
- cancel an active run and verify queued-work behavior matches the product rule
- fail an active run and verify queued-work behavior matches the product rule
- submit command/file/permission approvals through the UI
- submit user-input approvals through the UI
- restart/reload with durable chat state
- recover visibly from corrupt durable chat state without blocking new chats

Add live-provider E2E coverage for:

- open workspace
- create chat
- send a simple prompt
- receive non-empty streamed assistant output
- send a second prompt on the same conversation/thread
- queue or steer when the provider supports the workflow under test
- surface provider diagnostics or protocol drift loudly

## Implementation Plan

### Phase 1: Test Harness Entry Point

Create a single chat workflow command:

```sh
./scripts/test_chat_workflows.sh
```

The command should:

- build the desktop app when needed
- run deterministic Electron chat workflow tests
- run live-provider E2E tests when `.env` contains `OPENAI_API_KEY`
- print an explicit summary of deterministic tests run, live tests run, and live
  tests skipped
- fail if deterministic workflow tests fail
- fail if live tests are eligible but fail

Wire this command into `./check_quality.sh --all` for chat-capable projects, or
call it from the Electron integration section.

### Phase 2: Deterministic Electron Chat Workflows

Add Electron workflow tests that launch the production built app with temporary
app data. The tests should interact through DOM/CDP or an equivalent Electron
automation path and verify rendered UI plus recorded IPC/backend evidence.

Start with one happy-path workflow:

1. Launch app with temp app data and scripted fake provider.
2. Open a temp workspace.
3. Create a chat.
4. Send a message.
5. Wait for streamed assistant text to render.
6. Queue a follow-up while the run is active.
7. Send a steering message while the run is active.
8. Complete the active run.
9. Verify the queued run promotes and renders.

Then add targeted workflows for approvals, cancel/fail behavior, restart, and
corrupt state.

### Phase 3: Live Codex E2E

Extend the existing live Codex coverage so it is clearly part of the chat
workflow gate when credentials exist.

Requirements:

- Read `OPENAI_API_KEY` from `.env`.
- Use isolated temp `CODEX_HOME`.
- Use temp app data and temp workspace roots.
- Never mutate real developer state.
- Keep prompts cheap and deterministic enough to assert shape, not exact text.
- Assert non-empty assistant output, durable state, and no critical diagnostics.
- Report skip reason when `.env` lacks the key.

Prefer adding an Electron live-provider workflow after the deterministic app
path exists. Backend-only live tests are useful, but they do not prove the
renderer/IPC app path.

### Phase 4: Run/Queue State Machine Contract

Document the product rules for run and queue transitions.

Minimum states:

- queued
- running
- completed
- cancelled
- failed

Minimum events:

- send
- queue
- promote queued
- steer
- assistant delta
- approval requested
- approval resolved
- provider completed
- provider cancelled
- provider failed
- user cancelled
- backend restarted

Explicitly decide and test:

- whether queued work promotes after completion
- whether queued work remains queued after cancellation
- whether queued work remains queued after failure
- what the UI should show for each state
- what restart recovery does for running and queued work

Implemented product rules:

- `send` creates one `running` run and a streaming assistant message when the
  selected conversation has no active run and no queued work.
- `queue` creates a `queued` run and a pending queued user message. If the
  conversation is idle, the oldest queued run promotes immediately. If another
  run is active, queued work remains queued.
- `steer` is allowed only after the active provider turn has linked a thread and
  turn. Steering writes a `steering` user message and forwards the prompt to the
  active harness turn.
- `assistant delta` appends streamed text to the active assistant message and
  persists deltas at the service persistence interval.
- `approval requested` marks the active run as having one pending approval and
  renders the approval UI. Command, file-change, permission, and user-input
  approvals are submitted through `chat:submit-approval`.
- `approval resolved` clears the run's pending approval before the provider turn
  continues.
- `provider completed` marks the active run `completed`, marks the assistant
  message `complete`, and promotes the oldest queued run.
- `user cancelled` marks the active run `cancelled`, marks the assistant message
  `cancelled`, clears pending approval, and leaves queued work queued.
- `provider cancelled` follows the same terminal UI rule as user cancellation
  and leaves queued work queued.
- `provider failed` marks the active run `failed`, marks the assistant message
  `error`, records the provider error, clears pending approval, and leaves
  queued work queued.
- `backend restarted` marks interrupted `running` runs as `failed` with a
  restart error. Existing queued work remains queued and visible after reload.

### Phase 5: Regression Rules

For every future chat/Codex workflow bug:

- add or extend an E2E workflow test first when practical
- reproduce the bug through the app boundary
- fix the bug
- keep the regression test in the workflow suite

Do not accept a fix that only adds a service, store, component, or HTTP test
when the failure was visible through the app UI.

## Acceptance Criteria

- `./scripts/test_chat_workflows.sh` exists and is documented.
- `./check_quality.sh --all` runs deterministic chat workflow E2E coverage.
- Live Codex E2E runs automatically when `.env` contains `OPENAI_API_KEY`.
- Live Codex E2E skip is explicit when credentials are absent.
- A new chat workflow cannot be considered done without app-boundary E2E
  coverage of the changed behavior.
- Run/queue product rules are written down and covered by workflow tests.

## Resolved Decisions

- Deterministic workflow tests use CDP against the production built Electron
  app.
- The fake provider harness is selected by `SETTA_TEST_CHAT_HARNESS` and uses
  the production backend HTTP and durable store path.
- Live-provider coverage remains in Go runtime tests and is invoked by the chat
  workflow gate when `.env` contains `OPENAI_API_KEY`.
- Queued work promotes after completion and remains queued after cancellation or
  failure.
