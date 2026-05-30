# Setta 3 Phase 1: Platform Skeleton

## Objective

Build the smallest running Setta 3 app that proves the core architecture before
adding product complexity.

Phase 1 should answer these questions:

- Can Electron start a thin desktop shell reliably?
- Can Electron start and supervise a local Go backend?
- Can the renderer talk to Go through a narrow typed bridge?
- Can the app host a browser pane and automate it well enough for future
  generated-UI verification?
- Do the repo quality and dependency-update scripts work for the new Go and
  TypeScript structure?

## Principles

- Keep the Electron renderer thin. Go owns durable state, runtime behavior,
  validation, agent orchestration, browser automation, and future MCP/tool
  handlers.
- Avoid old Setta compatibility paths. This phase should not recreate old
  `backend/` or `frontend/` assumptions.
- Prefer a small working vertical slice over broad scaffolding.
- Use explicit typed boundaries between Electron main, preload, renderer, and Go.
- When Go-owned response or request contracts need TypeScript surfaces, generate
  the TypeScript from Go-owned inputs. Do not maintain hand-written mirrors.
  Phase 1 should use the smallest useful generator, not a heavy API generation
  stack.
- Prove browser automation early, before building features that depend on it.

## Proposed Repo Shape

```text
cmd/
  setta-backend/
    main.go
internal/
  httpapi/
  runtime/
desktop/
  package.json
  pnpm-lock.yaml
  src/
    generated/
    main/
    preload/
    renderer/
```

Notes:

- `desktop/` contains Electron main, preload, and renderer code. It replaces the
  old idea of a generic `frontend/` folder for this rewrite.
- `cmd/setta-backend` is the local Go backend that Electron starts in dev.
- `internal/httpapi` should stay thin. Phase 1 only needs health/status endpoints.
- More Go packages should appear only when the first real behavior needs them.

## Scope

### Go Backend

- Create a Go module.
- Add `cmd/setta-backend`.
- Add a minimal local HTTP server.
- Add `GET /health` returning structured JSON such as:

```json
{
  "ok": true,
  "name": "setta-backend",
  "version": "dev"
}
```

- Treat the health response as a Go-owned contract. If TypeScript needs the
  shape, add a small Go-owned generator that writes a generated TypeScript
  artifact under `desktop/src/generated/`. For Phase 1, generating a single
  `backend.ts` file is enough; do not introduce OpenAPI or a broader codegen
  stack just for `/health`.
- Bind only to loopback.
- Support either an explicit port flag/env var or port `0` with the selected
  address reported to Electron in a deterministic way.
- When binding to port `0`, report readiness with one machine-readable JSON line
  on stdout after the listener is bound, such as:

```json
{
  "event": "ready",
  "addr": "127.0.0.1:54321"
}
```

  Electron should treat this line as the backend readiness contract. Other
  stdout/stderr output is logging, not readiness signaling.
- Support graceful shutdown.
- Use tests for the health endpoint, invalid startup configuration, listener
  startup behavior, and graceful shutdown.

### Electron Desktop

- Create a TypeScript Electron app under `desktop/`.
- Use React + Vite for the renderer.
- Use Tailwind 4 and shadcn/ui only for app-shell surfaces.
- Keep `contextIsolation` enabled and `nodeIntegration` disabled.
- Add a preload bridge with a very small API, initially enough for:
  - backend health/status
  - app/runtime version metadata
- Keep direct backend details out of the renderer by default. The renderer should
  call a typed preload API such as `window.setta.backend.health()` rather than
  receiving and fetching a raw backend URL, unless a later feature creates a
  concrete need for direct renderer access.
- Electron main should start the Go backend in dev, pass the local backend URL to
  main/preload-owned code, and stop the backend when the app exits.
- Backend supervision should define:
  - readiness timeout and failure reporting
  - stdout/stderr capture
  - behavior when the backend exits unexpectedly
  - cleanup on app quit and process signals
  - how an already-running backend is selected, if that mode is supported

### Renderer

- Show a minimal app shell, not a landing page.
- Show backend connection status.
- Show a placeholder workspace/app area.
- Avoid implementing Project Chat, nodes, settings, or state machines in this
  phase.

### Browser Pane Spike

Add a minimal browser pane proof using Electron `WebContentsView` unless the
spike proves a different API is more practical.

Electron owns the embedded browser surface in this phase. The spike should also
record how future Go-owned orchestration would call into the chosen browser
automation path through an explicit main/preload/backend boundary.

Boundary rule: Electron main owns `WebContentsView` lifecycle and direct
Electron browser APIs. Go may later request browser actions through a typed local
protocol or IPC boundary, but Go should not directly reach into Electron internals.

The spike should prove:

- loading a local preview URL
- screenshot capture
- DOM inspection
- console capture
- network capture if practical
- click/type interaction
- resize and focus behavior

Acceptable automation paths to evaluate:

- Playwright's Electron support
- CDP attachment
- Electron `webContents.debugger`

The result should be one repeatable smoke test or script, plus notes on which
automation path was chosen and why.

Screenshot capture, DOM inspection, console capture, click/type interaction,
resize, and focus are required proof points. If any of those are blocked, stop
and update the architecture plan with the blocker and replacement approach
before building product features on top of the browser pane. Network capture may
remain optional in Phase 1, but a missing network path must be documented as a
known gap with the next concrete investigation step.

### Quality And Dependency Scripts

- Update `./check_quality.sh` so it covers:
  - Go formatting, vetting, tests where appropriate, and complexity checks
  - TypeScript/JavaScript formatting, lint, typecheck, tests where appropriate,
    build checks, and complexity checks for the `desktop/` project
- Decide how TypeScript formatting and typechecking are invoked, then wire them
  into the normal verification path.
- Make the quality script detect `desktop/package.json` as its own TypeScript
  project instead of assuming only a root `package.json`.
- Update `./update_dependencies.sh` only as needed so it handles:
  - root `go.mod`
  - `desktop/package.json`
  - `desktop/pnpm-lock.yaml`
- Keep exact direct dependency versions.
- Either add a fresh dead-code check for the new structure or remove the current
  `AGENTS.md` reference to dead-code checks until a real check exists.

## Non-Goals

Do not build these in Phase 1:

- Project Chat
- Codex harness
- MCP server/client/bridge
- Runs, traces, or trajectories
- Terminals
- Git UI
- State machines
- Workspace persistence beyond what is needed to start the shell
- Settings UI
- Plugin system
- Packaging, signing, auto-update, licensing, or auth
- Full browser-node product UX beyond the automation spike

## Implementation Order

1. Clean current guidance mismatch.
   - Resolve the `AGENTS.md` dead-code check reference.

2. Bootstrap Go.
   - Add `go.mod`.
   - Add `cmd/setta-backend`.
   - Add `GET /health`.
   - Add focused Go tests.

3. Add the first generated contract path.
   - Define the Go-owned health contract.
   - Generate the TypeScript health type used by preload/renderer code.
   - Make generated files clearly marked and excluded from manual edits.
   - Keep the generator narrow: one Go-owned input, one generated TypeScript file,
     no OpenAPI stack yet.

4. Bootstrap Electron.
   - Add `desktop/package.json`.
   - Add Electron + React + Vite + TypeScript.
   - Add a minimal renderer shell.
   - Add secure preload defaults.

5. Wire Electron to Go.
   - Electron main starts Go backend in dev.
   - Backend readiness is detected from the machine-readable stdout ready event.
   - Renderer calls health through the typed bridge.
   - App shutdown cleans up the Go process.
   - Backend startup, readiness, logging, unexpected exit, and shutdown behavior
     are covered by tests or a repeatable smoke script.

6. Prove the browser pane.
   - Add one `WebContentsView` preview pane.
   - Add one repeatable automation smoke path.
   - Record the chosen automation approach and known gaps.

7. Finish verification.
   - Update quality and dependency scripts.
   - Run `./update_dependencies.sh`.
   - Run `./check_quality.sh --all`.
   - Document dev commands in `README.md`.

## Acceptance Criteria

Phase 1 is complete when:

- A fresh checkout can install/update dependencies with `./update_dependencies.sh`.
- `./check_quality.sh --all` passes.
- Go tests pass through `./scripts/run_go_tests.sh`.
- The Electron app starts locally.
- The Electron app starts or connects to the Go backend.
- The renderer displays backend health through a typed preload bridge.
- Any TypeScript shape that mirrors Go-owned backend data is generated from
  Go-owned inputs.
- Closing the app stops the backend process it started.
- A browser pane smoke test proves screenshot, DOM inspection, console capture,
  resize/focus behavior, and basic click/type interaction. Network capture is
  either proven or documented as an explicit Phase 1 gap.
- The main architecture plan is updated if any Phase 1 spike changes a major
  assumption.

## Follow-Up Phase

After this skeleton is stable, the next phase should add workspace open flow and
minimal persisted project state. Project Chat and Codex harness work should wait
until the app shell, backend lifecycle, and verification path are reliable.
