# Python Canvas Attached Terminal Plan

## Status and purpose

**Status: Implemented and verified.**

Add code execution and a real interactive terminal to Python Canvas without introducing an
application-level Run/Stop header or standalone Terminal sections. Generated Python owns one
runtime terminal that is visually joined below its editor. The terminal opens independently,
runs the exact canonical generated program on request, remains usable as a normal shell, and
stays outside the authored project document and diagnostic revision lifecycle.

This document replaces the completed
`python-canvas-structural-latency-parity-plan.md`. Git retains that batch and its verification
history; the obsolete completed plan is deleted so `docs/plans` contains one authoritative active
plan.

Frozen `main` at `043d3b2e9c69caf99d1246f1408b3ad7194b7864` is the reference for the attached
terminal's appearance, sizing, xterm behavior, and user interaction. Python Canvas deliberately
does not port main's global Run/Stop header, standalone or detachable Terminal sections, or
persisted terminal-child document model.

## Reference contract

Main establishes the relevant behavior:

- a code-section header offers a local Run action and a terminal toggle;
- the toggle reads `Create terminal`, `Hide terminal`, or `Show terminal` according to state;
- creating a terminal does not run code;
- a first run creates a visible terminal when none exists, while a later run reuses an existing
  terminal without changing its hidden/visible state;
- the terminal is joined below the editor, follows its width, and resizes vertically without
  changing the editor's height;
- hiding preserves the same PTY session and output history;
- the embedded terminal has no second section header and exposes a small trash control;
- xterm fits on mount and resize and forwards normal input, including `Ctrl+C`, to a real PTY;
- the server publishes a ready boundary, retained history, and then live output; and
- output remains scoped to the terminal that owns the run.

Python Canvas currently has one code section, Generated Python. This batch implements that one
owner completely rather than adding speculative multi-code-section or generic attachment models.

## Fixed product outcome

### 1. One code-local terminal, no global terminal structure

Generated Python contributes two compact main-style header controls ahead of the ordinary lock,
minimize, and delete controls:

- `Run this code block`; and
- a terminal toggle labelled `Create terminal`, `Hide terminal`, or `Show terminal`.

There is at most one terminal session for Generated Python. The toggle creates a shell without
running code. Run creates a visible shell when none exists or reuses the existing shell without
unhiding it, then executes the current canonical Generated Python. No app header, global Run/Stop
control, Terminal creation-menu entry, detached
terminal, top-level terminal card, or terminal workspace child is introduced.

The terminal is runtime state, not `ProjectSnapshotV2`, authored JSON, the workspace section
forest, or project revision state. Opening, hiding, showing, resizing, running, interrupting, and
closing it must not schedule Basedpyright work, clear or fade diagnostics, change callable pending
state, lock a section, or publish a project mutation announcement.

### 2. Main-style joined presentation and lifecycle

When visible, the terminal is full-width directly below the Generated Python editor inside the
same card. It has a separating top rule, no duplicate title/header, and a compact trash control.
The current editor height remains stable when the terminal opens, closes, or changes height.

The terminal pane starts at main's 220 px height and has a 100 px minimum. Dragging its local
vertical resize handle changes the pane and owning card by the same delta. The Generated Python
section's ordinary resize handle continues to resize the editor portion. Hiding subtracts only the
terminal pane; showing restores its prior terminal height. Width always follows the owner.

Creating, showing, and running do not steal keyboard focus. Hiding unmounts the visible terminal
surface but retains the backend PTY and bounded history. A show or remount within main's 1.2 second
grace period reuses the existing xterm instance and WebSocket without replaying history. A later
show reconnects to the same backend session and restores retained history exactly once. The trash
control terminates and reaps the PTY, clears its history, removes the pane, and returns the toggle
to `Create terminal`. This last lifecycle is an intentional simplification from main's structural
trash path: because Python Canvas has no persisted Terminal child or reusable detached terminal,
leaving an unreachable PTY behind would be a runtime leak.

Run is a code-local action, not a structural or authored mutation. Like main's Play control, it
does not acquire a visible in-flight disabled state. Only duplicate terminal creation is suppressed
while its create request is in flight. There is no section-wide pending style, lock flash, spinner
overlay, height flash, or giant error panel. A failure is reported by the existing compact
application alert boundary and leaves the shell usable when possible.

There is no attached-terminal Stop button in frozen main. Python Canvas follows that model:
terminal `Ctrl+C` sends the ordinary PTY interrupt character to the foreground process. Closing
the terminal terminates the entire shell session.

### 3. A real, scoped PTY service

Add one backend runtime package that owns a real platform PTY and default interactive shell in the
authored project's directory. It is separate from the project aggregate, renderer, materializer,
coordinator diagnostics worker, and Basedpyright process adapter.

The service owns:

- idempotent creation/reuse of the one Generated Python session;
- a platform-appropriate default shell and inherited environment;
- input, output, positive column/row resize, and foreground `Ctrl+C` behavior;
- a 64 KiB output-history limit with an atomic history-plus-live attachment boundary;
- an explicit ready message before user input is accepted;
- exactly one active browser stream attachment to the PTY, with detach/reconnect across
  hide/show;
- safe detach without killing the session;
- explicit terminal deletion; and
- deterministic process reaping during backend shutdown.

Use a WebSocket only for the bidirectional terminal stream. REST remains the command boundary for
create/reuse, run, and close. The Go contract is authoritative for route names and request/response
shapes and generates the TypeScript surface. WebSocket control messages have one small validated
protocol for ready and resize; output/input are binary UTF-8 terminal bytes.

The browser first obtains an opaque, session-scoped attachment ticket through a same-origin JSON
request. The launcher supplies the backend with the exact loopback Vite application origin; the
WebSocket validates both that proxy-aware configured origin and the ticket before attaching. It
must not compare the browser Origin to the backend listener address, because the supported Vite
proxy intentionally gives them different ports. No route accepts a caller-selected executable,
shell command, working directory, filesystem path, or environment override.

Vite development and preview proxies forward WebSocket upgrades to the existing loopback backend.
The frontend must continue using the isolated raw-headless Chrome harness and must never open the
user's Chrome profile or macOS Keychain.

### 4. Exact generated-code execution

The Run request carries project identity and the frontend's expected canonical revision. The
backend validates both and captures the complete generated program for that exact revision under
the coordinator's existing serialization boundary. A stale revision is a typed conflict and never
runs a newer or older plausible program.

Before issuing the shell command, the run adapter creates a permission-restricted, immutable
revision-specific Python artifact in the project directory so imports resolve exactly as they do
for Basedpyright and the canonical materialization. The adapter resolves `python3` and then
`python`, shell-quotes only backend-owned executable and artifact paths, writes the command through
the PTY's managed run boundary, and owns cleanup of every run artifact. The authored project file
and canonical generated materialization are never executed through a race-prone mutable path.

Frontend Run first flushes any debounced Generated Python target edit into the controller-owned
operation chain, then enters that chain itself. Merely waiting for already-enqueued work is not
sufficient because target edits deliberately wait behind a debounce timer. Run captures the
revision only after the forced flush settles; it does not advance the revision or block later
diagnostics settlement. Repeated runs reuse the terminal and append output without duplicating
previous history.

### 5. One narrow workspace sizing command

The existing section-kind `renderContent` and `renderHeaderControls` seams are sufficient for the
app-owned UI. The only missing public primitive is a supported way for that UI to change its
owning section's size while preserving the package's clamp, width-propagation, overflow validation,
store publication, and document-change notification rules.

Expose one public `setWorkspaceSectionSize(host, sectionId, partialSize)` command backed by the
existing single `persistSectionSizeChange` funnel. Do not expose stores, add terminal concepts to
`@setta/workspace`, restore main's joined-child branches, or introduce a generic attachment
framework. Python Canvas owns terminal visibility, terminal height, the splitter, and the composed
Generated Python body.

## Dependencies and supply-chain boundary

Use the exact proven versions already present on frozen main unless dependency review rejects one:

- `@xterm/xterm@6.0.0`;
- `@xterm/addon-fit@0.11.0`;
- `github.com/coder/websocket@v1.8.14`;
- `github.com/creack/pty@v1.1.21` for Unix PTYs; and
- `github.com/aymanbagabas/go-pty@v0.2.2` for the Windows PTY adapter.

Before installing them, generate candidate JavaScript and Go lock state without lifecycle scripts
and run `code-policy dependency-review --base <trusted-merge-target>`. Review the direct and
transitive delta, release age, native-code audit, licenses, and OSV findings. Do not add a terminal
emulator, WebSocket, process, state-management, or styling dependency beyond this set.

## Acceptance behavior

Prove the requested product behavior causally:

1. `Create terminal` opens a visible 220 px joined pane and a usable shell without executing
   Generated Python. The editor height and existing diagnostics do not change.
2. The terminal accepts a typed shell command and shows its output. Hide/show restores the same
   session and prior marker exactly once.
3. Run after an enqueued Generated Python edit executes the exact resulting canonical revision in
   the same terminal. A stale direct run request is rejected and produces no marker.
4. A second Run reuses the same PTY and appends only the second result; it does not create another
   pane, WebSocket history duplicate, workspace section, or project revision.
5. A long-running Python command is interrupted by `Ctrl+C`, returns to the usable shell prompt,
   and does not stop the backend.
6. Resizing the terminal changes its rows and outer-card height while leaving the code editor
   height stable. Owner width changes refit xterm and keep the terminal aligned.
7. Trash terminates the PTY, removes the pane, and restores `Create terminal`. Reopening starts a
   fresh shell without old history.
8. Backend shutdown reaps the shell and removes its owned run artifacts.

Use the existing production raw-headless Chrome/CDP lifecycle, a disposable browser profile, a
temporary authored project, the real Go service, the real PTY, and pinned Basedpyright. Assert DOM
geometry and causal markers rather than wall-clock animation thresholds.

## Observable tests

- PTY service tests for shell creation/reuse, history-plus-live attachment, input, resize,
  interrupt, deletion, bounded history, and shutdown cleanup.
- HTTP/WebSocket tests for exact routes, attachment ticket and origin checks, protocol validation,
  stale-revision rejection, run-artifact ownership, and typed failure mapping.
- Coordinator tests only for the exact read-only generated-code/revision capture; do not move
  terminal concerns into coordinator tests.
- Workspace public-API and focused size tests for the one supported size command and existing
  clamping/notification funnel.
- Frontend component tests for header labels, create versus run, hide/show reuse, close, error
  presentation, stable diagnostics, and editor/terminal size accounting.
- One focused extension of the production browser walkthrough covering the eight acceptance
  behaviors in one session.

Do not add timing matrices, multi-client arbitration, shell-selection settings, terminal themes,
detachment, multiplexing, scrollback persistence across backend restarts, arbitrary command APIs,
plugin hooks, remote terminal access, fuzzing, mutation testing, or a broad main-parity audit. Once
the eight acceptance behaviors pass, stop implementation work.

## Implementation sequence

1. Generate and review the exact dependency candidates.
2. Add the narrow workspace size command with focused public-boundary tests.
3. Implement the PTY runtime, secure stream boundary, exact generated-run capture, and backend
   shutdown ownership with deterministic tests.
4. Add the Generated Python header controls, app-owned terminal state, joined xterm body, local
   splitter, and WebSocket proxying.
5. Extend the raw-headless production acceptance, run focused and changed checks, and stop.

The public cutover is atomic: do not leave a pipes-only console, fake terminal, feature flag,
compatibility route, dormant Terminal section kind, alternate terminal protocol, or partially
wired control in a commit presented for completion. A blocker must identify a concrete conflict
between this plan and checked-in code; possible future terminal features are not blockers.

## Implementation checklist

### Phase 1 — Boundary and dependencies

- [x] Candidate dependency state reviewed
- [x] Workspace size command exported and tested
- [x] Generated REST/WebSocket contract established

### Phase 2 — Runtime

- [x] Real PTY session, history, input, resize, interrupt, reuse, and close
- [x] Exact revision capture and immutable run artifact
- [x] HTTP/WebSocket security and shutdown ownership

### Phase 3 — UI

- [x] Main-style Generated Python Run and terminal controls
- [x] Joined xterm pane with stable editor geometry and local resize
- [x] Hide/show history reuse, error handling, and trash lifecycle

### Phase 4 — Acceptance

- [x] Focused backend, workspace, and frontend tests
- [x] Production raw-headless terminal lifecycle acceptance
- [x] Required Code Policy changed-scope verification

## Completion evidence

The required dependency-review command was attempted against `origin/main`. Code Policy 0.13.0
stopped before evaluating the candidate because it cannot parse the trusted base's existing
`uv.lock` entry whose exact version is `5.0`. A supplemental exact-start-base review enumerated
only the five planned dependencies and reported no known vulnerabilities; the same exact versions
are already present on frozen main. No policy file or lock governing Code Policy was changed to
work around that base-input failure.

Focused Go, workspace, frontend, generated-contract, and production-build checks pass. The
production raw-headless walkthrough uses the real launcher, PTY, WebSocket proxy, and xterm and
causally covers all eight acceptance behaviors in one disposable project. It launches only the
raw Playwright `chrome-headless-shell` with an isolated disposable profile, mock keychain, and
muted audio.
