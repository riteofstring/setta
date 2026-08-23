# Python Canvas

Python Canvas is a durable local application for authoring one named Python project. Go owns the
canonical project, generated Python, diagnostics, persistence, terminal runtime, and Basedpyright
lifecycle. React renders that state through the public `@setta/workspace` API.

The project contains callables, Parameter Dictionaries, Lists of Objects, their section forest, and
one generated Python document. Every browser or CLI mutation is bound to the current project ID and
revision, so stale writes fail with a typed conflict instead of replacing newer work.

## Run locally

Install the repository's pinned Node and pnpm versions plus its locked Code Polishy release. The
launcher also requires `curl` and resolves Go from that installed release.

Choose the exact path that will hold the project. Create a new project with:

```sh
mkdir -p .local/python-canvas
./scripts/run-python-canvas.sh \
  --project "$PWD/.local/python-canvas/project.json" \
  --create
```

The launcher installs the frozen pnpm dependencies, builds `@setta/workspace` and the production
frontend, starts the loopback backend, and serves the built app at `http://127.0.0.1:5173`. The
backend listens at `http://127.0.0.1:8080`. Both ports can be changed with `--preview-port` and
`--backend-port`.

Reopen the same project without `--create`:

```sh
./scripts/run-python-canvas.sh \
  --project "$PWD/.local/python-canvas/project.json"
```

`--create` is exclusive: it creates an absent file and refuses to overwrite an existing project.
There is no implicit project, discovery, clone, or save-as flow. Press Ctrl-C in the launcher
terminal to stop both local services.

## Live agent CLI

The `python-canvas` Go command also exposes a strict machine-readable CLI. `schema` works without a
running backend; `snapshot` and `apply` talk to the same live coordinator as the browser and never
edit `project.json` directly.

From the repository root, with the launcher running and Go available on `PATH`:

```sh
go -C apps/python-canvas/backend run ./cmd/python-canvas schema --pretty

go -C apps/python-canvas/backend run ./cmd/python-canvas \
  snapshot --wait-diagnostics --pretty

printf '%s\n' \
  '{"operation":"callable.createConfigured","name":"Ceiling","authoredExpression":"math.ceil","parameterValues":{"x":"7.25"}}' \
  | go -C apps/python-canvas/backend run ./cmd/python-canvas \
      apply --file - --wait-diagnostics --pretty
```

The configured-callable example assumes the project prefix already contains `import math`.

Use `--url http://127.0.0.1:<port>` when the backend uses a non-default port. Service URLs must be
absolute loopback HTTP URLs. `apply --file -` reads one operation from stdin; otherwise `--file`
names a JSON file.

`schema` is the authoritative operation inventory and includes the exact fields, nested V2 types,
and one example for every operation. The CLI fetches one canonical snapshot, binds an apply to its
exact ID and revision, submits it once, and never retries a revision conflict. Successful commands
write one JSON document to stdout. Failures write one stable JSON error to stderr and return exit
status `2` for invalid input or typed API failures and `1` for connection, timeout, malformed server
response, or unexpected failures.

`--wait-diagnostics` follows the project event stream until diagnostics match the returned project
revision and the provider is no longer pending. Its default timeout is 10 seconds; `--timeout` may
set a positive duration up to one minute and is valid only with `--wait-diagnostics`.

`callable.createConfigured` is the atomic intent operation for agents. It creates a callable,
resolves its provider-owned signature, and applies values by exact parameter name in one revision,
one file replacement, and one final publication. An unknown parameter, provider failure, validation
failure, or persistence failure leaves the published project and project file unchanged.

## Browser authoring

Right-click a blank part of the canvas to create a Python callable, Parameter Dictionary, or List of
Objects. Sections can be renamed, moved, resized where allowed, nested under lists, reordered, and
deleted through the workspace controls.

Each callable keeps an independent expression draft. Enter commits it and Escape restores the
canonical value. Basedpyright resolves provider parameters; app-authored and provider-derived rows
share the workspace parameter tools while provider-owned names and signature metadata remain
immutable. The trailing **Params** tab edits the selected callable or Parameter Dictionary through
the package-owned parameter configuration UI. The **Section** tab edits section settings, and the
leading **Outline** mirrors the canonical forest. Pane presentation is browser-local view state and
does not enter the project file.

**Generated Python** is one combined document. The prefix and suffix are editable; the generated
body from the canonical snapshot is protected. Completion requests include the whole document and
the exact protected UTF-16 range. Generated assignments are ordered from parsed authored
dependencies, with structural problems reported as diagnostics rather than guessed from keywords.

The Generated Python header can run the current document and create, show, hide, resize, or trash an
attached terminal. The PTY runs in the explicit project directory. Terminal sessions and pane state
are runtime state, not authored project data.

## HTTP and publication contract

`GET /api/v2/project` returns the current complete `ProjectSnapshotV2`.
`GET /api/v2/project/events` opens a server-sent event stream that immediately emits that same
snapshot and then publishes every authored or diagnostic update. The browser holds one stream and
does not poll. EventSource reconnection catches up by receiving the current complete snapshot.

The coordinator validates a complete mutation before its persistence boundary. Authored mutations
replace the project file atomically and publish one canonical snapshot. Provider work may later
publish a newer complete snapshot with settled diagnostics; unavailable provider work is surfaced
as a typed state, never as a plausible empty result.

## Verification

Focused checks:

```sh
pnpm --filter @setta/python-canvas test
pnpm --filter @setta/python-canvas run contract:check
go -C apps/python-canvas/backend test ./...
```

The standard browser acceptance is:

```sh
pnpm --filter @setta/python-canvas run browser:test
```

It starts local services and multiple disposable raw-headless Chrome sessions. The scenarios cover
the side panes, generated-code terminal, dependency ordering, asynchronous diagnostics, callable
and parameter authoring, protected target boundaries, Parameter Dictionaries, nested Lists of
Objects, persistence, and restart recovery. Run it only when that standard suite is authorized.

The browser harness never attaches to an existing browser profile. On macOS it resolves, in order,
a valid absolute `PYTHON_CANVAS_CHROME_BINARY`, then the highest valid Playwright
`chromium_headless_shell` revision in the user cache. GUI application executables are rejected. The
suite prints the resolved source and executable before launch.
