# Terminal Close Safety Plan

Date: 2026-07-04

## Problem

Closing a terminal pane currently asks for confirmation whenever the terminal
session status is `running` or `starting`. That treats an idle shell prompt the
same as a shell with an active foreground command.

The latest recording showed the exact failure mode:

- The terminal was created and reported `status: "running"` in
  `.recordings/20260704T200147Z/ipc.jsonl`.
- The close click happened at `20:02:00.156`.
- The confirmed `terminal:close` IPC started at `20:02:01.818`.
- `/terminals/close` completed at `20:02:03.826`, after a `2007ms` backend
  request.

That two second backend wait matches `DefaultCloseKillTimeout`. The close path
sends `SIGTERM`, waits for the process to exit, and only then escalates. An idle
interactive shell can still be a running process that does not exit on that
signal, so the UI waits even though there is no user command running.

## Decision

Add a backend-owned terminal close safety assessment and make pane close behavior
depend on that assessment, not on the generic terminal lifecycle status.

Do not remove the confirmation unconditionally. A terminal can be `running`
because it is only an idle shell, because it has a foreground command, because it
has background jobs, or because Setta cannot reliably inspect the process tree.
Only the backend has enough information to make that distinction. When the
backend cannot prove that close is safe, Setta should require confirmation.

Replace the current close contract in place. Do not add backward-compatibility
shims, legacy aliases, migrations, dual-read/write paths, fallback request
shapes, or transitional renderer/backend branches.

## Target Model

Introduce a terminal close safety contract owned by `internal/terminal` and
surfaced through `internal/httpapi`.

Suggested value set:

- `safe`: closing is not expected to terminate user work.
- `destructive`: closing is expected to terminate or orphan user work.
- `unknown`: Setta cannot prove the close is safe.

Suggested assessment payload:

- `safety`: the typed value above.
- `reason`: a typed reason value, for example `no_session`, `already_closed`,
  `idle_shell`, `foreground_process`, `background_jobs`, `inspection_failed`.
- `requiresConfirmation`: boolean derived by the backend.
- `summary`: short user-facing text for the confirmation dialog when needed.

The renderer should not derive confirmation from `SessionStatus`. It should ask
the backend to close, then show confirmation only if the backend returns a typed
confirmation-required result. The confirmed close request must be revalidated by
the backend immediately before mutation so process state changes between the
first request and confirmation are handled correctly.

## Backend Plan

1. Add Go-owned value sets for terminal close safety and close assessment reason
   in `internal/terminal/types.go`. Regenerate TypeScript surfaces from the Go
   contracts; do not manually edit generated output.

2. Replace the close contract so `CloseTerminal` returns either:

   - closed session result, or
   - confirmation-required result with the backend assessment.

   The request should include an explicit `confirmed` boolean. If assessment is
   `destructive` or `unknown` and `confirmed` is false, the backend returns the
   confirmation-required result without closing anything.

   Remove the old request/response shape everywhere in the same change. Do not
   keep compatibility handling for callers that still pass only `sessionId` and
   `mode`.

3. Add a platform-specific process inspector behind an interface owned by the
   terminal manager. The first Unix implementation should inspect the terminal
   shell PID, process group, session, and child processes without relying on
   terminal output or prompt text.

4. Treat `safe` as a narrow proof, not a guess. A Unix shell session is safe only
   when the backend can prove there is no active foreground command and no live
   child or job that should survive the shell. If inspection fails, return
   `unknown`.

5. Add a fast close path for safe sessions. It should dispose the PTY, mark the
   session closed, publish `terminal.closed`, and return without waiting for the
   terminate-before-kill timeout. Reaping can happen asynchronously through the
   existing process wait path.

6. Keep the existing terminate/kill path for confirmed destructive or unknown
   closes. That path can keep the grace timeout because the user explicitly
   confirmed termination risk.

## Renderer Plan

1. Replace `terminalPaneCloseRequiresConfirmation(sessionStatus)` with a backend
   driven close flow.

2. On pane close:

   - call `terminal.close(sessionId, { confirmed: false })`;
   - if the result is closed, remove the pane immediately;
   - if the result requires confirmation, show the backend-provided summary;
   - if the user confirms, call `terminal.close(sessionId, { confirmed: true })`.

3. Preserve the no-session and already-closed immediate remove behavior, but keep
   it consistent with backend assessment when a session exists.

4. Keep in-flight close protection so repeated clicks do not issue duplicate
   close requests.

## Non-Goals

- Do not parse shell prompts or recent terminal output to infer idleness.
- Do not add polling from the renderer.
- Do not add compatibility aliases, migrations, transitional adapters, old-field
  support, or fallback handling for the old close contract.
- Do not make `running` mean anything other than the terminal lifecycle state.

## Verification

Use narrow checks first, then broaden after the contract and renderer behavior
are stable.

1. Backend unit tests:

   - idle shell assessment returns `safe`;
   - foreground command returns `destructive`;
   - background job returns `destructive`;
   - inspector failure returns `unknown`;
   - unconfirmed destructive or unknown close does not mutate the session;
   - safe close returns without waiting for `DefaultCloseKillTimeout`.

2. HTTP contract tests:

   - `CloseTerminal` returns a closed result for safe close;
   - `CloseTerminal` returns confirmation-required for destructive unconfirmed
     close;
   - confirmed destructive close uses the terminate/kill path.

3. Renderer tests:

   - idle close removes the pane without calling `confirm`;
   - destructive close asks once with the backend message;
   - declining confirmation keeps the pane;
   - confirming retries close with `confirmed: true`;
   - repeated close clicks while in flight do not duplicate requests.

4. Deterministic Electron workflow test through production main, preload,
   renderer, HTTP, and store paths:

   - open a temporary app data directory;
   - create a workspace with a terminal pane;
   - close an idle terminal and assert no confirmation dialog and no two second
     delay;
   - close a terminal running a foreground command and assert confirmation;
   - confirm destructive close and assert the pane is removed.

5. Final gates for implementation changes:

   - `./scripts/format.sh`
   - `./check_quality.sh --git-changes`

For this plan-only document, automated code gates are not required beyond diff
inspection.
