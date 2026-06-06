# Niri Terminal Implementation Plan

## Purpose

Replace the current synthetic Niri terminal surface with a real embedded terminal
pane while preserving the Niri workspace model, generated backend contracts, and
runtime budgeting behavior.

The target architecture is:

```text
Go backend
  PTY/session/process ownership
  generated HTTP contracts
  terminal event stream

Electron main/preload
  generated backend client
  safe IPC bridge and event forwarding
  no arbitrary process spawning exposed to renderer

Renderer
  Niri pane lifecycle
  xterm.js terminal view
  terminal input, focus, copy/paste, resize
```

The app should support terminal preferences through profiles and external
terminal launchers. It should not model Ghostty, WezTerm, zsh, bash, or Windows
Terminal as separate Niri surface kinds.

## Implementation Status

- Phase 0 is complete: benchmark terminal workload uses `fake-terminal`, while
  workspace-mode `terminal` is reserved for the product terminal surface.
- Phase 1 is complete: the product terminal pane is backed by xterm.js in the
  renderer, generated HTTP contracts, a dedicated `/terminals/events` stream,
  and `internal/terminal` PTY sessions owned by Go.
- Phase 2 is complete: session lifecycle, replay, buffering, process cleanup,
  renderer reload behavior, lost-session state, and close confirmation.

## Current State

The Niri workspace now has two terminal-like surface kinds:

- `terminal`: the product embedded terminal pane. It uses xterm.js in the
  renderer, generated preload/main/backend contracts, and Go-owned PTY sessions.
- `fake-terminal`: the synthetic benchmark surface. It keeps generated
  terminal-like output for Niri performance probes without spawning shells.

The Phase 2 implementation can create a shell, stream output, send input,
resize, attach to an existing running session by `workspaceId` and `paneId`,
replay bounded detached output, report buffer truncation, clean up Unix process
groups, escalate terminate to kill, recover renderer reloads, show lost-session
state on backend loss, and confirm active terminal close actions.

## Design Decisions

1. `surfaceKind: "terminal"` is the product embedded terminal pane.
2. Shells, themes, fonts, cwd behavior, and external terminal app choices live
   in terminal profiles and settings, not in Niri surface kinds.
3. Go owns PTY sessions and child process lifecycle.
4. xterm.js owns terminal emulation and rendering in the renderer.
5. Electron main/preload brokers safe IPC and generated backend calls.
6. Generated TypeScript backend contracts come from `internal/httpapi`.
7. Terminal byte streams are transported as terminal data, not log lines.
8. Hidden terminal sessions continue running and draining PTY output.
9. Hidden or snapshot terminal views may be detached from the renderer later,
   but backend session lifetime is independent from xterm view lifetime.
10. Ghostty, WezTerm, Kitty, Alacritty, iTerm2, Terminal.app, and Windows
    Terminal are external integration targets first.

## Non-Goals

- Do not build a terminal emulator from scratch.
- Do not embed Ghostty, WezTerm, Kitty, or Alacritty as the MVP.
- Do not put PTY or process spawning in the renderer.
- Do not expose an arbitrary `exec(command)` API to the renderer.
- Do not persist raw scrollback or typed input by default.
- Do not silently fall back to the fake terminal when real PTY support fails.
- Do not add compatibility shims for old terminal schemas or stale pane fields.

## Terminal Terminology

Use these terms consistently:

| Term | Meaning | Owner |
| --- | --- | --- |
| Shell | User command interpreter such as `zsh`, `bash`, `fish`, `pwsh`, or `cmd.exe`. | Backend launches it. |
| PTY | OS pseudoterminal that makes the shell behave like it is attached to a terminal. | Backend owns it. |
| Session | Running PTY plus child process tree, cwd/env/profile, dimensions, status, and subscribers. | Backend owns it. |
| Terminal stream | Opaque input/output bytes between xterm.js and the PTY. | Backend transports it; renderer writes it to xterm. |
| Terminal emulator | Parser and screen state for VT/ANSI escape sequences. | xterm.js for MVP. |
| Terminal renderer | Draws cells, cursor, selection, links, IME, and scrollback. | xterm.js for MVP. |
| Profile | User-configurable shell/cwd/env/theme/font/scrollback settings. | App config. |
| External terminal | Separate app launched with a cwd or command. | Electron main launches it. |

## Niri Model

Keep Niri layout generic. The pane system should know that a pane is a terminal
surface, but it should not know how terminal emulation works.

Target pane relationship:

```text
NiriPane
  paneId
  surfaceId
  surfaceKind: "terminal"
  terminalConfig
    profileId
    cwdMode
    cwdOverride
    titleOverride

Runtime terminal state
  paneId
  workspaceId
  sessionId
  attach status
```

Persist terminal pane configuration, not live session handles.

Persist:

- Pane layout.
- `surfaceKind: "terminal"`.
- Selected profile id.
- Cwd mode or explicit cwd override.
- Optional pane title override.

Do not persist:

- PTY handles.
- Process ids.
- Live session ids across app restart.
- Raw output.
- Scrollback.
- Typed input.
- Environment snapshots.

For renderer reload while the Go backend is still alive, support attaching by
`workspaceId` and `paneId`. For full app restart, restored terminal panes may
create fresh sessions automatically only for safe shell profiles. Custom command
profiles should wait for explicit user action before launching.

## Benchmark Surface Split

The fake terminal remains useful for Niri performance probes. The split is now
implemented: benchmark scenes use `fake-terminal`, while workspace-mode
`terminal` means a real embedded terminal.

The split was implemented by:

1. Renaming the previous synthetic `TerminalSurfaceAdapter` to
   `SyntheticTerminalSurfaceAdapter`.
2. Adding the benchmark-only `fake-terminal` surface kind for scenes that need
   synthetic terminal output.
3. Keeping runtime policy and metrics able to count synthetic terminal renderers
   as terminal-like workload when running benchmark scenes.
4. Ensuring workspace-mode `surfaceKind: "terminal"` always means a real embedded
   terminal.

This avoids spawning hundreds of real shells during benchmark scenes and avoids
confusing product behavior with performance fixtures.

## Backend Architecture

The Phase 1 implementation uses `internal/terminal`.

Core types:

```go
type Manager struct {
    // sessions keyed by session id and by workspace/pane attachment.
}

type Profile struct {
    ID         string
    Name       string
    ShellPath  string
    Args       []string
    Env        map[string]string
    CWDMode    CWDMode
    CWD        string
    Term       string
    Cols       int
    Rows       int
}

type Session struct {
    ID          string
    WorkspaceID string
    PaneID      string
    ProfileID   string
    CWD         string
    Cols        int
    Rows        int
    Status      SessionStatus
    CreatedAt   time.Time
}
```

Backend responsibilities:

- Resolve profiles.
- Validate workspace and cwd.
- Choose shell executable and args.
- Build environment.
- Set `TERM=xterm-256color`.
- Set `COLORTERM=truecolor`.
- Set an app marker such as `TERM_PROGRAM=setta`.
- Spawn PTY with initial rows and columns.
- Start a continuous PTY read loop.
- Batch output into bounded chunks.
- Publish output events with sequence numbers.
- Write input bytes to the PTY.
- Resize the PTY.
- Detect process exit.
- Clean up PTY handles and process trees.
- Fail loudly for unsupported platforms or missing shells.

### PTY Library Choice

Phase 1 targets macOS/Linux first, with macOS as the primary development path.
The current Unix PTY adapter uses `github.com/creack/pty`. Windows is
platform-gated with a specific unsupported error until a ConPTY adapter is
implemented.

The first implementation should prioritize one reliable backend over a broad but
shallow platform promise. If Windows is not implemented, the terminal pane must
show a clear unsupported state instead of fake output.

Add Windows later behind an internal PTY interface. At that point evaluate
`github.com/aymanbagabas/go-pty` or a direct ConPTY adapter.

## Contracts

All terminal request and response contracts must be owned by
`internal/httpapi`. Generated TypeScript should come from the existing contract
generator. Do not maintain a manual terminal type mirror in the renderer.

Add generated endpoints similar to:

```text
POST /terminals/create
POST /terminals/attach
POST /terminals/input
POST /terminals/resize
POST /terminals/close
GET  /terminals/events
```

Suggested request and response shapes:

```go
type CreateTerminalRequest struct {
    WorkspaceID string `json:"workspaceId"`
    PaneID      string `json:"paneId"`
    ProfileID   string `json:"profileId,omitempty"`
    CWD         string `json:"cwd,omitempty"`
    Cols        int    `json:"cols"`
    Rows        int    `json:"rows"`
}

type AttachTerminalRequest struct {
    WorkspaceID string `json:"workspaceId"`
    PaneID      string `json:"paneId"`
}

type TerminalSessionResponse struct {
    Session TerminalSessionSummary `json:"session"`
}

type TerminalInputRequest struct {
    SessionID  string `json:"sessionId"`
    DataBase64 string `json:"dataBase64"`
}

type ResizeTerminalRequest struct {
    SessionID string `json:"sessionId"`
    Cols      int    `json:"cols"`
    Rows      int    `json:"rows"`
}

type CloseTerminalRequest struct {
    SessionID string            `json:"sessionId"`
    Mode      TerminalCloseMode `json:"mode"`
}
```

Use explicit validation:

- `workspaceId`, `paneId`, and `sessionId` must be non-empty.
- `cols` and `rows` must be bounded positive integers.
- `dataBase64` must decode successfully and stay below a per-request limit.
- `cwd` must exist and must be a directory.
- Close mode must be an explicit enum such as `terminate` or `kill`.

After editing these contracts, regenerate `desktop/src/generated/backend.ts`
before cleanup and before finishing the implementation.

## Terminal Event Stream

The existing app uses HTTP JSON and SSE. Phase 1 fits that model instead of
inventing a second ungenerated API.

Use a dedicated terminal SSE stream, separate from the chat event stream.
Terminal output is higher-volume and has different reconnect semantics, so chat
event-stream stability should not depend on terminal throughput.

Use one app/window-level terminal stream carrying events for all terminal
sessions:

```go
type TerminalEvent struct {
    SchemaVersion int               `json:"schemaVersion"`
    StreamID      string            `json:"streamId"`
    Sequence      int               `json:"sequence"`
    EventID       string            `json:"eventId"`
    Type          TerminalEventType `json:"type"`
    EmittedAt     string            `json:"emittedAt"`
    WorkspaceID   string            `json:"workspaceId"`
    PaneID        string            `json:"paneId"`
    SessionID     string            `json:"sessionId"`
    Payload       TerminalPayload   `json:"payload"`
}
```

Event types:

- `terminal.output`
- `terminal.started`
- `terminal.exited`
- `terminal.closed`
- `terminal.error`
- `terminal.bufferTruncated` in Phase 2

Output payload:

```go
type TerminalOutputPayload struct {
    DataBase64 string `json:"dataBase64"`
    ByteCount  int    `json:"byteCount"`
}
```

Phase 1 encoding:

- PTY output bytes are base64 encoded inside JSON SSE events.
- xterm.js receives decoded `Uint8Array` data.
- Renderer input is encoded as base64 before POSTing to the backend.
- Do not treat PTY data as UTF-8 logs in backend code.
- Do not split output by line.
- Include `workspaceId`, `paneId`, and `sessionId` on every event so renderers
  can filter deterministically.

Phase 2 transport upgrade:

- If profiling shows JSON/base64/SSE is the bottleneck, evaluate a binary local
  transport for terminal streams.
- Keep the session API stable so the transport can change without changing Niri
  pane semantics.

Phase 2 replay upgrade:

- Store bounded per-session output chunks in the backend while views or streams
  are detached.
- Replay available chunks after reconnect or renderer reload.
- Emit `terminal.bufferTruncated` when replay cannot cover missed output.
- Do not silently drop output events without exposing truncation state.

## Electron Main And Preload

The renderer should not know the backend URL or spawn processes. Add terminal
IPC through the existing shared IPC contract and preload API.

Main process responsibilities:

- Start and stop the terminal event stream when the backend is ready.
- Use the generated backend client for create, attach, input, resize, and close.
- Forward terminal events to renderer windows.
- Apply coarse input batching if needed before sending backend requests.
- Validate external URL and external terminal launch requests.
- Avoid exposing raw Electron or Node APIs to renderer code.

Preload responsibilities:

- Expose a narrow `terminal` API on `window.setta`.
- Decode generated terminal event payloads before invoking renderer listeners.
- Return unsubscribe functions for terminal event listeners.
- Do not expose backend URL, `fetch`, `child_process`, or broad filesystem APIs.

Expected renderer API shape after generated contracts exist:

```ts
window.setta.terminal.create(...)
window.setta.terminal.attach(...)
window.setta.terminal.input(...)
window.setta.terminal.resize(...)
window.setta.terminal.close(...)
window.setta.terminal.onEvent(...)
```

This is a preload facade over generated contracts, not a separate hand-owned
terminal contract.

## Renderer Architecture

Replace the product terminal adapter with an xterm-backed surface.

Recommended shape:

```text
TerminalSurfaceAdapter
  kind: "terminal"
  owns host mount/unmount
  owns TerminalView lifecycle
  bridges Niri visibility/focus/viewport to TerminalView
  reports terminal metrics

TerminalView
  xterm.js Terminal
  FitAddon
  optional SearchAddon and WebLinksAddon later
  session attach/create logic
  input/output subscriptions
  resize measurement
  focused key handling
```

The adapter may be imperative, matching the current `SurfaceAdapter` model. It
does not need to be a React component unless that matches surrounding code after
implementation starts.

### Xterm MVP

Use:

- `@xterm/xterm`
- `@xterm/addon-fit`

Defer until after the core PTY path works:

- `@xterm/addon-search`
- `@xterm/addon-web-links`
- `@xterm/addon-serialize`
- `@xterm/addon-webgl`
- `@xterm/addon-ligatures`

Dependency changes must pin direct versions exactly. If lockfiles change, use
the repository dependency update workflow.

### Input

- Subscribe to `xterm.onData`.
- Encode input as bytes and send to backend.
- Coalesce rapid input within a short interval if needed.
- Chunk large paste payloads.
- Terminal focus should prevent global Niri shortcuts from stealing shell,
  editor, and TUI keybindings.

### Output

- Subscribe to terminal events.
- Filter by `sessionId` or by `workspaceId` and `paneId` before writing.
- Decode `dataBase64`.
- Write decoded bytes into xterm.
- Surface backend errors in the pane, not in console-only logs.

### Resize

- Use xterm fit measurement to compute columns and rows.
- Send resize only when cols or rows changed.
- Debounce resize events.
- Continue Niri pixel layout independently from terminal cell dimensions.

### Visibility And Runtime Policy

Backend sessions continue while panes are hidden or snapshotted. The renderer
view can be live, throttled, snapshotted, hidden, or destroyed according to Niri
runtime policy.

Rules:

- Hiding a pane must not stop backend PTY reads.
- During the MVP, keep xterm mounted for `live` and `live-throttled` runtime
  states.
- For `snapshot`, `hidden`, and `destroyed`, the backend session continues while
  the xterm view may be frozen, detached, or destroyed.
- Snapshotting a pane may detach or freeze the xterm view later, but not the
  backend session.
- Closing a terminal pane should close the session after confirmation if the
  process is still running.
- Destroying the xterm view should unsubscribe renderer listeners.
- Reopening a hidden pane should attach to the existing backend session when
  possible.

MVP may keep more xterm views alive while the pane exists if needed to reduce
reattach complexity, but the backend/session API must not require that long term.

## Profiles And Preferences

Start with one default profile. Add profile UI later. Store global terminal
profiles in a new settings domain. Persist only lightweight per-pane references
and overrides in the Niri layout.

Minimal profile fields:

```ts
type TerminalProfile = {
  id: string;
  name: string;
  shellPath?: string;
  args?: string[];
  cwdMode: "project" | "home" | "custom";
  cwd?: string;
  env?: Record<string, string>;
  fontFamily?: string;
  fontSize?: number;
  themeId?: string;
  scrollback?: number;
};
```

MVP defaults:

- macOS/Linux shell from `$SHELL`, with explicit fallback.
- Windows unsupported unless a ConPTY backend is implemented.
- Project terminal cwd defaults to workspace root.
- Ad hoc terminal cwd defaults to home.
- `TERM=xterm-256color`.
- `COLORTERM=truecolor`.
- Restored panes auto-create fresh sessions only for safe shell profiles.
- Custom command profiles require explicit user action after app restart.

Defer:

- Importing Ghostty, WezTerm, or Windows Terminal profiles.
- Per-profile keymaps.
- Word separators.
- Bell behavior.
- OSC 52 clipboard policy.
- Shell integration.
- Prompt/cwd reporting.
- SSH/container profiles.
- Persistent named sessions.

## External Terminal Integration

External terminal support is separate from embedded terminal support.

Add after the embedded path is stable:

- Preferred external terminal setting.
- "Open project root in external terminal".
- "Open current cwd in external terminal".
- Built-in launchers for Ghostty, WezTerm, Kitty, Alacritty, iTerm2,
  Terminal.app, and Windows Terminal.
- Custom command template with safe placeholder substitution.

Represent external launchers as app-level integrations, not terminal session
profiles that run inside the embedded pane.

Do not trust command templates blindly. Validate cwd, avoid shell string
concatenation, and require confirmation before running arbitrary command
templates.

## Implementation Phases

### Phase 0: Prepare Niri Surface Boundaries

Status: complete.

Goal: make the fake terminal clearly fake and reserve `terminal` for product
terminal behavior.

Tasks:

- Rename the synthetic adapter to `SyntheticTerminalSurfaceAdapter`.
- Move benchmark scenes to `fake-terminal` or another explicit synthetic kind if
  needed.
- Keep terminal-like metrics for benchmark probes.
- Update tests that assert synthetic terminal behavior.

Definition of done:

- Workspace-mode `surfaceKind: "terminal"` no longer depends on synthetic
  output.
- Benchmark scenes still run without spawning real shells.

### Phase 1: Minimal Real Embedded Terminal

Status: complete.

Goal: one real terminal pane can run a shell in a workspace.

Backend:

- Add terminal manager.
- Add PTY backend for the first supported platform.
- Target macOS/Linux first; show a specific unsupported state on Windows until
  ConPTY support exists.
- Add create, attach, input, resize, close endpoints.
- Add dedicated terminal SSE event stream.
- Base64 encode output data in event payloads.
- Validate all requests.
- Clean up sessions on backend shutdown.

Electron:

- Add terminal IPC contract.
- Forward terminal events to preload.
- Use generated backend client.

Renderer:

- Add exact-pinned xterm dependency and fit addon.
- Replace product terminal adapter with xterm-backed adapter.
- Create or attach a backend session on mount.
- Send input and resize.
- Render output and exit/error states.
- Preserve session through pane hide/show within the running app.

Definition of done:

- Open workspace.
- Terminal pane starts a shell in project root.
- Typing commands produces output.
- Resize updates terminal columns and rows.
- Hide/show preserves the running shell.
- Closing the pane terminates or confirms termination of the session.
- No fake output is shown for product terminal panes.

### Phase 2: Robust Session Lifecycle

Status: complete.

Goal: terminal sessions behave correctly under common app lifecycle events.

Start with:

- Add bounded per-session output storage in the backend.
- Make terminal subscriptions replay from cursor when data is still available.
- Add `terminal.bufferTruncated` to Go-owned contracts and regenerate TypeScript.
- Replace silent event drops with observable truncation or backpressure behavior.

Backend tasks:

- Bounded detached-session output buffering.
- Start with 1-4 MB per session and a 5-10 minute detached-session time limit.
- Drop oldest buffered chunks on overflow and emit a buffer-truncated event.
- Output batching and backpressure.
- Process group cleanup on Unix.
- ConPTY/job cleanup if Windows is supported.
- Terminate first, then kill after a timeout when force closing.

Renderer and Electron tasks:

- Renderer reload attach by `workspaceId` and `paneId`.
- Replay buffered output when attaching to an existing session.
- Clear lost-session state when backend restarts.
- Exit overlay with restart and close actions.
- Confirm close for active sessions; exited sessions close immediately.

Test tasks:

- Tests for cleanup and reattach paths.
- E2E hide/show while output streams.
- E2E renderer reload attach or specific lost-session state.
- E2E backend crash/lost-session state.
- E2E close cleanup with a long-running command.

Definition of done:

- Hidden panes do not block child processes.
- Detached panes can replay buffered output when reattached.
- Buffer overflow is visible through a truncation event/state.
- Closing panes does not leak processes.
- Renderer reload either reattaches or shows a specific lost-session state.
- Backend crash produces a specific terminal lost state.

### Phase 3: Terminal Ergonomics

Goal: make the embedded terminal usable as a daily terminal.

Tasks:

- Search addon.
- Safe web links addon.
- Theme settings.
- Font settings.
- Scrollback setting.
- Copy/paste policy.
- Paste chunking and large paste warning.
- Focus/keybinding layer so terminal shortcuts reach the PTY.
- Accessibility review.

Definition of done:

- Common TUIs work: `vim`, `less`, `top`, `tmux`, `fzf`.
- Copy/paste follows platform conventions.
- App navigation shortcuts do not break normal shell/editor usage.

### Phase 4: Profiles

Goal: users can create and choose terminal profiles.

Tasks:

- Default profile.
- Profile storage.
- Shell path and args.
- Cwd mode.
- Env overrides.
- Theme/font/scrollback.
- Per-pane selected profile.
- Shell detection.

Definition of done:

- Users can create project shell, home shell, custom command, and PowerShell/WSL
  profiles where supported.

### Phase 5: External Terminal Launchers

Goal: users can jump from Setta to their preferred standalone terminal app.

Tasks:

- Preferred external terminal setting.
- Launcher detection.
- Launch templates for Ghostty, WezTerm, Kitty, Alacritty, iTerm2,
  Terminal.app, and Windows Terminal.
- Custom launcher template.
- Safe cwd and placeholder handling.

Definition of done:

- Users can open a workspace or current terminal cwd in their preferred external
  terminal without changing embedded terminal behavior.

### Phase 6: Advanced Engines

Only evaluate after the xterm path is stable and measured.

Candidates:

- `@xterm/headless` plus serialize for reconnect.
- `ghostty-web` as an xterm-shaped renderer/parser experiment.
- `libghostty-vt` for backend/headless screen state.
- `libvterm` for backend/headless screen state.
- Native terminal surfaces.
- GPU/WebGL/WebGPU renderer upgrades.

Definition of done:

- There is measured evidence that xterm.js is insufficient for a real use case.
- The session/renderer abstraction lets the experiment avoid rewriting Niri
  layout and pane lifecycle code.

## Verification

Terminal implementation touches backend process lifecycle, generated contracts,
Electron IPC/preload, renderer state, Niri runtime policy, and event streaming.
Use focused checks first, then broaden.

Focused backend checks:

- Terminal manager unit tests with a fake PTY.
- Real PTY integration tests on supported platforms using temporary directories.
- Process cleanup tests.
- Request validation tests for all terminal HTTP endpoints.
- Event stream ordering and reconnect cursor tests.
- Event stream replay and buffer-truncation tests.
- Output flood tests that verify bounded memory and observable truncation.

Focused renderer checks:

- Terminal adapter mount/unmount tests.
- Resize-to-cols/rows tests.
- Event filtering by session id.
- Hidden/snapshot lifecycle tests.
- Keybinding focus boundary tests.

Electron E2E checks:

- Open a temporary workspace.
- Open or focus the terminal pane.
- Type a command and assert output appears through production
  backend/main/preload/renderer paths.
- Resize terminal and assert rows/cols update.
- Hide/show the pane while output streams.
- Close the pane and assert the backend session exits.
- Reload renderer and assert attach or specific lost-session behavior.
- Disconnect and reconnect the terminal event stream while output is produced.
- Force backend restart and assert terminal panes show a specific lost-session
  state.

Performance checks:

- Preserve existing Niri performance probes.
- Add a terminal output flood scenario with a disposable shell command.
- Verify terminal output floods do not starve chat/workflow event forwarding.
- Record before/after performance results under `docs/reports/performance/` for
  performance-relevant refactors.

Final gates before committing executable changes:

- Regenerate generated contracts after editing `internal/httpapi` contracts.
- Run `./scripts/format.sh`.
- Run focused checks that cover the changed behavior.
- Run `./check_quality.sh --all`.
- Run `./scripts/check_supply_chain.sh` when dependency manifests, lockfiles, Go
  modules, or supply-chain tooling changed.

For documentation-only changes, inspect the diff and run only directly relevant
checks. If no automated check applies, state that the full workflow was skipped
because the change is documentation-only.

## Resolved Decisions

1. Phase 1 targets macOS/Linux first, with macOS as the primary development
   path. Windows shows a specific unsupported state until ConPTY support is
   implemented.
2. Terminal events use a dedicated app/window-level SSE stream, separate from
   chat events. Every event carries `workspaceId`, `paneId`, and `sessionId`.
3. Global terminal profiles live in a new settings domain. Niri layout persists
   only per-pane profile references and lightweight overrides.
4. Restored terminal panes may auto-create fresh sessions only for safe shell
   profiles. Custom command profiles require explicit user action after app
   restart.
5. Detached terminal buffering starts with 1-4 MB per session and a 5-10 minute
   time limit. Overflow drops oldest chunks and emits a buffer-truncated event.
6. The MVP keeps xterm mounted for `live` and `live-throttled` runtime states.
   For `snapshot`, `hidden`, and `destroyed`, the backend session continues
   while the xterm view may be frozen, detached, or destroyed.
7. Exited sessions close immediately. Running sessions require confirmation.
   Force close terminates first, then kills after a timeout.
