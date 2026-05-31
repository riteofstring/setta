# Chat Workflow Test Hardening

Status: implemented

## Problem

The new chat workflow gate is a major improvement, but it still has three
important gaps:

- It launches visible Electron windows repeatedly, which makes normal test runs
  distracting.
- The live-provider workflow is backend-only, so it does not prove that the
  actual desktop app works with live Codex.
- Some negative assertions check that text does not appear for a short time
  instead of proving the durable run and queue state.

The goal is not to make tests quieter by weakening them. The goal is to make the
real app-boundary tests easier to run all the time, then make them more
authoritative.

## Principles

- Keep app-boundary workflow tests as the primary gate for chat behavior.
- Run live-provider app-boundary tests whenever `.env` contains
  `OPENAI_API_KEY`.
- Prefer hidden Electron over browser-only headless tests for workflow coverage.
  Browser-only tests skip Electron main, preload, IPC, backend startup, and app
  packaging behavior.
- Assert durable product state, not timing accidents or implementation details.
- Use production HTTP/API surfaces for state assertions. If the right state is
  not observable, add a product-grade API or run-history surface rather than a
  hidden test-only state dump.
- Keep deterministic provider scripting clearly test-only and deliberately
  simple. It should simulate provider events; it should not duplicate production
  chat orchestration logic.
- Make failures produce enough evidence that the next debugging step is obvious:
  screenshot, renderer console, IPC log, backend HTTP log, backend event stream,
  and relevant run/message state.

## Phase 1: Hidden Electron By Default

Add a test-only hidden-window mode for Electron E2E runs.

Implementation:

- Add an env var such as `SETTA_E2E_VISIBLE=1`.
- In E2E runs, default to hidden mode when `SETTA_E2E_VISIBLE` is not set.
- Keep `BrowserWindow` created with `show: false`.
- Skip `mainWindow.show()` during hidden E2E runs.
- On macOS, hide the Dock icon during hidden E2E runs with `app.dock?.hide()`.
- Preserve a visible debugging path with
  `SETTA_E2E_VISIBLE=1 ./scripts/test_chat_workflows.sh`.
- Verify that screenshots and CDP DOM evaluation still work while the window is
  hidden.

Acceptance criteria:

- `./scripts/test_chat_workflows.sh` does not flash desktop windows by default.
- The same command can still run visibly for local debugging.
- Success and failure screenshots are still captured.
- The workflow remains a real Electron app test, not a browser-only renderer
  test.

## Phase 2: Reduce Launch Churn

Run compatible deterministic workflows inside fewer Electron launches.

Implementation:

- Keep fresh launches for restart/recovery tests, because process restart is the
  behavior under test.
- Run ordinary deterministic workflows in one app launch where possible:
  happy path, cancel queue, fail queue, and approvals.
- Use separate conversations, unique prompt markers, and a clean temporary app
  data directory for that launch.
- Keep the corrupt-chat recovery test isolated because it intentionally seeds
  bad local state.

Acceptance criteria:

- The deterministic suite uses one launch for normal workflows, plus separate
  launches only where restart or corrupt startup behavior is the point.
- Test isolation is preserved by conversation/workspace setup, not by accidental
  process churn.
- The suite remains easy to debug from named workflow steps and artifacts.

## Phase 3: Strengthen Queue And Run Assertions

Replace short negative waits with state-based assertions.

Current weak shape:

- Queue a message.
- Cancel or fail the active run.
- Wait briefly.
- Assert the queued assistant text is not visible.

Target shape:

- Queue a message.
- Capture the active run ID and queued run ID.
- Cancel or fail the active run.
- Assert the active run reaches the expected terminal status.
- Assert there is no active run after cancel/failure.
- Assert the queued run is still queued, cancelled, or otherwise explicitly not
  promoted according to the product contract.
- Assert the queued assistant response was not created or not completed.
- Assert the renderer shows the same state that the backend reports.

Implementation:

- Teach the Electron workflow script how to query backend state through
  production HTTP endpoints.
- Record the backend address as explicit test evidence if it is not already easy
  to discover.
- Use `/chat/messages/page`, `/chat/runs/active`, and any existing run/list
  endpoint that exposes the needed state.
- If queue/run state cannot be asserted through current production APIs, add a
  small product-grade run history endpoint. Do not add a private test-only state
  dump as the first choice.
- Keep the text assertion as a secondary UI assertion, not the source of truth.

Acceptance criteria:

- Cancel and failure tests fail if a queued run is wrongly promoted after the
  active run terminates.
- Tests assert run IDs and message statuses, not only visible strings.
- A delayed backend promotion bug cannot pass because of a 700 ms timing window.

## Phase 4: Add Live Codex Electron Smoke Coverage

Add one live-provider workflow that drives the built Electron app through the
same app boundary as the deterministic tests.

Implementation:

- Keep the current backend-only live test as lower-level coverage.
- Add an Electron workflow mode that uses the real Codex harness instead of the
  scripted workflow harness.
- Run it from `./scripts/test_chat_workflows.sh` whenever `.env` contains
  `OPENAI_API_KEY`.
- Use a bounded prompt with low ambiguity, such as asking Codex to reply with a
  short exact phrase or one short sentence.
- Assert through the UI that a non-empty assistant response is rendered.
- Assert through backend state that the run completes and no critical diagnostics
  are recorded.
- Add a queued-message variant if runtime is still acceptable.

Acceptance criteria:

- With `OPENAI_API_KEY` in `.env`, the chat workflow gate exercises live Codex
  through Electron main, preload, renderer, IPC, backend startup, HTTP, event
  stream, persistence, and UI rendering.
- If the key is absent, the skip is narrow and explicit.
- A broken renderer/IPC integration cannot pass solely because the backend-only
  live test passed.

## Phase 5: Harden The Scripted Harness Boundary

Keep deterministic workflows fast and reliable, but make the test harness harder
to misuse.

Implementation:

- Rename the env var to make the scope explicit, for example
  `SETTA_E2E_CHAT_HARNESS=scripted-workflow`.
- Require a second E2E guard env var before accepting the scripted harness from
  the production backend entry point, for example `SETTA_E2E=1`.
- Document that scripted harness modes are not user-facing configuration.
- Consider moving scripted harness construction behind a test/e2e package or
  narrowly-scoped factory so the normal runtime path defaults to Codex and cannot
  accidentally select test behavior.
- Replace ad hoc prompt-substring branching over time with declarative scripted
  provider fixtures:
  - expected user prompt label
  - stream chunks
  - approval requests
  - wait gates
  - terminal outcome

Acceptance criteria:

- Normal app startup cannot accidentally use the scripted harness from a single
  loose env var.
- The scripted harness remains simple provider simulation, not a duplicate
  implementation of chat orchestration.
- Adding a new workflow scenario means adding a readable fixture/script, not
  scattering more substring conditions.

## Phase 6: Make Run State The Architectural Source Of Truth

The long-term fix is to make chat workflow correctness easier to reason about,
not only better tested.

Target architecture:

- Go owns durable conversation, message, run, and queue state.
- Every user turn has a run record, including queued, running, completed,
  cancelled, and failed runs.
- Run promotion is a backend state transition with explicit invariants.
- The event stream is a projection of durable state, not a second source of
  truth.
- Renderer state is reconciled from backend snapshots and event cursors.
- UI operations cannot regress terminal statuses with stale HTTP responses or
  stale event ordering.
- Queue behavior is defined as a small state machine and tested at both service
  and app-boundary levels.

Implementation:

- Add or formalize a run history/list endpoint if the UI and tests need to
  observe queued and terminal runs.
- Attach monotonic revisions or event cursors to message/run updates so the
  renderer can reject stale updates deterministically.
- Keep operation responses and event-stream patches consistent by using the same
  backend projection code.
- Add service-level tests for run promotion invariants.
- Keep Electron workflow tests for the user-visible path through those
  invariants.

Acceptance criteria:

- There is one obvious place in the backend that decides whether a queued run can
  promote.
- Renderer tests do not need timestamp-rank heuristics to prevent status
  regression.
- App-boundary tests can assert the authoritative state after each workflow step.

## Gate Shape

`./scripts/test_chat_workflows.sh` should become the single chat workflow gate:

- Build desktop once unless `--skip-build` is passed.
- Run hidden deterministic Electron workflows by default.
- Run live Electron Codex workflow when `.env` has `OPENAI_API_KEY`.
- Run backend-only live Codex workflow as supplemental lower-level coverage.
- Print named workflow results rather than a hardcoded count.
- Write artifacts under `test-results/electron-integration`.
- Support useful local flags:
  - `--visible`
  - `--deterministic-only`
  - `--live-only`
  - `--keep-artifacts`

`./check_quality.sh --all` should continue to call this gate.

## Recommended Order

1. Hidden Electron mode.
2. Replace hardcoded workflow count with named results.
3. State-based queue assertions.
4. Live Codex Electron smoke workflow.
5. Reduce deterministic launch churn.
6. Harden scripted harness configuration.
7. Run-state architecture cleanup.

This order makes the tests less annoying first, then makes them more
authoritative, then cleans up the architecture that made the bugs easy to create
in the first place.
