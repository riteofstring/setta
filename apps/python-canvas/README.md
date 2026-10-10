# Python Canvas

Python Canvas is a durable local application for authoring one named Python project. Go owns the
canonical project, generated Python, diagnostics, persistence, terminal runtime, and Basedpyright
lifecycle. React renders that state through the public `@setta/workspace` API.

The project contains callables, Parameter Dictionaries, Lists of Objects, their section forest, and
one generated Python document. Every browser or CLI mutation is bound to the current project ID and
revision, so stale writes fail with a typed conflict instead of replacing newer work.

## Playground

After [source setup](../../CONTRIBUTING.md#source-setup), launch the model workshop:

```console
pnpm python-canvas:playground
```

The **Start here** pane walks through assembling real scikit-learn objects into a classifier.
Press **Run** in **Generated Python**: the terminal draws its learned decision boundary, marks
mistakes on unseen samples, and reports training and unseen accuracy. The initial recipe uses
`StandardScaler`, `PolynomialFeatures`, and `LogisticRegression`. Change **Features → degree**
from 1 to 3 and run again: the straight boundary becomes curved. Try beating 90% on unseen samples,
then raise **Data → noise** or replace the classifier expression with `SVC` and press Enter.

**Build & run** shows the ingredients beside the program. **Data & wiring** shows the shared
dataset and the `make_pipeline(*steps)` composition. The guide switches views for you; both are
also available through Saved Views. The plotted A/B samples come from the held-out 30% of the data;
only the training split fits the pipeline, including its preprocessing. A fixed seed keeps the
example repeatable. This small synthetic exercise illustrates composition and generalization; its
score is not an estimate of performance on real-world data.

Your working project is `tmp/python-canvas-playground/model-workshop`. The launcher prepares its
pinned, frozen NumPy/scikit-learn environment automatically using prebuilt wheels. The first launch
needs network access for uncached packages. Later launches preserve settings, code, and your canvas
arrangement; the checked-in fixture stays untouched.

The working folder includes `recipe.py`, a short handwritten equivalent of the starting recipe.
Run it with `uv run --frozen --no-build python recipe.py` from that folder to compare the same
workflow without Setta. It is a reference recipe, not a synchronized export of later canvas edits.
**Download Python** in the Generated Python header saves the currently displayed program as
`canvas_recipe.py`, including your prefix and suffix drafts. Place it in the working folder beside
`model_workshop.py` and run `uv run --frozen --no-build python canvas_recipe.py` there to use your
edited recipe independently. The download contains code; its imports still need the project's
helper and dependencies.

```console
pnpm python-canvas:playground --fresh
pnpm python-canvas:playground --no-open
pnpm python-canvas:playground --workspace /path/to/your/working-copy
```

`--fresh` starts another copy without replacing earlier work. The launcher prints the exact command
to resume it. `--no-open` prints the local URL without opening a browser. The command returns when
the app is ready; you can close the terminal. Running it again reopens the same live playground.
Stop it with `pnpm python-canvas:playground --stop`, or add `--workspace PATH --stop` for another
copy. Use **Start here** in the left sidebar whenever you want the guide back.

## Install and open a project

Complete the [source setup](../../CONTRIBUTING.md#source-setup), then create a project from the
repository root. PyPI publication is deferred.

```sh
mkdir -p .local/python-canvas
python3 packages/setta-runtime/scripts/run_local_setta.py python-canvas open \
  --project "$PWD/.local/python-canvas/project.json" \
  --create
```

`open` foreground-supervises the local server and opens its browser UI. Press Ctrl-C in that
terminal to stop it. Reopen the project later by omitting `--create`; creation is exclusive and
never overwrites an existing file. There is no implicit project or background daemon.

The commands below use `setta` as shorthand for the repository-local runner.
If the initial browser load fails, **Try again** reconnects
without a page reload. Save, completion, and terminal errors remain visible beside the workspace
so you can recover while continuing to inspect your project.

Python selection needs no setup. Python Canvas uses the nearest `.venv` above the project file. If
none exists, it uses the Python that launched Setta. Basedpyright diagnostics and completion,
interactive Run, AI Run, and the terminal all use that same selection. An invalid nearest `.venv`
stops startup with a clear error instead of silently choosing something else.

## AI-native CLI

The CLI exposes a strict offline schema and controls the same live coordinator as the browser. Keep
`open` running in one terminal, then use a second terminal for automation:

```sh
setta python-canvas schema --pretty

setta python-canvas snapshot \
  --project "$PWD/.local/python-canvas/project.json" \
  --wait-diagnostics --pretty

printf '%s\n' \
  '{"operation":"callable.createConfigured","name":"Ceiling","authoredExpression":"math.ceil","parameterValues":{"x":"7.25"}}' \
  | setta python-canvas apply \
      --project "$PWD/.local/python-canvas/project.json" \
      --file - --wait-diagnostics --pretty

setta python-canvas run \
  --project "$PWD/.local/python-canvas/project.json" \
  --wait-diagnostics --pretty
```

The configured-callable example assumes the project prefix already contains `import math`.
`snapshot`, `apply`, and `run` resolve the canonical project path to one verified live session;
they never edit the project file directly or start an implicit server. `--url` is an expert escape
hatch restricted to an absolute loopback HTTP URL.

`schema` is the authoritative command and operation inventory, with exact fields, result shapes,
errors, and exit semantics. `apply` binds one mutation to the current project ID and revision and
never retries a conflict. `--wait-diagnostics` waits for diagnostics from that exact revision.
Successful commands write one JSON document to stdout. Typed input or application failures write
JSON to stderr and exit `2`; operational failures exit `1`. `run` also writes completed Python
failures as results and exits `3` for a nonzero exit, signal, timeout, or output limit.

Project, CLI, HTTP, terminal-control, and interpreter-probe JSON inputs share one strict lexical
contract: valid UTF-8, one JSON value, unique object keys, at most 32 nested containers, and at most
8 MiB per decoded string, field name, or number, within each boundary's smaller byte limit. Closed
contract documents also reject unknown fields before Python Canvas applies semantic validation.

Generated Python runs locally and unsandboxed with your user permissions. AI clients should inspect
`schema`, apply the smallest intended mutation, confirm the returned snapshot, and use bounded
`run` for noninteractive execution.

## Source-checkout development

Contributors can build and run the same private, same-origin server boundary with:

```sh
./scripts/run-python-canvas.sh \
  --project "$PWD/.local/python-canvas/project.json" \
  --create
```

This script requires the repository's pinned Node, pnpm, and locked Code Polishy toolchain. It is a
development convenience, not an installed product command.

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

The leading **Saved Views** tab manages named canvas presentations for the current project. A view
captures top-level section positions, the camera, and which sections are visible; callable content,
parameter values, list hierarchy, pane state, terminals, and project data remain shared. Python
Canvas starts with an Overview view and stores later accepted view changes in one strict versioned
browser payload scoped to the canonical project id. A malformed or unavailable value falls back to
the valid in-memory Overview state and is reported in the app.

Switching views or changing their visibility is browser-local. It sends no backend forest mutation,
and later canonical project snapshots retain the active presentation while reconciling added and
deleted sections. Workspace owns validation, switching, visibility behavior, and the management
pane; Python Canvas owns this storage policy and its failure feedback. Structural Undo and Redo do
not include saved-view changes.

Right-click a blank part of the canvas and choose **Auto Layout** to arrange unlocked top-level
sections with package-owned spacing. Locked roots, including Generated Python, remain fixed. The
operation changes browser-local workspace coordinates only, so Python Canvas sends no backend
forest mutation and retains the resulting geometry when a later canonical project snapshot is
projected. Nesting and root order remain backend-authored placement and continue through the
revision-checked forest command.

Python Canvas currently leaves Workspace structural history disabled because the backend has no
revision-safe undo authority. Structural Undo and Redo are therefore unavailable; Cmd/Ctrl+Z inside
an active text editor continues to use that editor's local history.

Authored Python callable, Parameter Dictionary, and List of Objects sections support **Copy**,
**Paste**, and **Duplicate** through Workspace menus and the command palette. `Cmd/Ctrl+C` and
`Cmd/Ctrl+V` use the system clipboard; Duplicate leaves it unchanged. Copying a List includes its
complete descendant subtree. Generated Python, pending creation placeholders, diagnostics, provider
state, and terminal runtime are never copyable project content.

Paste allocates fresh canonical ids and collision-free names in one revision-checked backend
mutation. Internal parsed `state.*` references follow their cloned targets, while references outside
the copied subtree remain external. The browser applies the copied relative root layout and section
presentation only after the backend returns a complete accepted snapshot, then selects the new
roots in that same Workspace publication. A revision conflict loads the latest project and reports
the conflict without replaying the operation. Clipboard operations do not enable browser-local
Workspace history.

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

`POST /api/v2/project/clipboard/copy` is a read-only preparation command bound to an observed
revision and selected canonical root ids. It returns the closed clipboard V1 authored payload.
`POST /api/v2/project/clipboard/paste` accepts that payload with an expected revision and returns
one complete accepted snapshot plus the newly allocated canonical root ids. Workspace geometry and
section chrome stay in the browser's structural envelope rather than entering Go transport or
durable project state.

`POST /api/v2/project/run` captures and executes one exact generated-code revision with bounded,
separate stdout and stderr. `GET /api/v2/runtime/session` exposes only the identity used to verify a
foreground live-session record. The production web app and every API route share one loopback
origin.

The coordinator validates a complete mutation before its persistence boundary. Authored mutations
replace the project file atomically and publish one canonical snapshot. Provider work may later
publish a newer complete snapshot with settled diagnostics; unavailable provider work is surfaced
as a typed state, never as a plausible empty result.

Clipboard paste is one structural transaction rather than a loop over entity-create routes.
Invalid payload, reference rewrite, render, materialization, or persistence failure publishes
nothing. After durable acceptance, provider diagnostics follow the ordinary asynchronous structural
analysis path; a later provider failure reports provider state without rolling back the authored
paste.

## Local security and process lifetime

The loopback listener accepts only its exact `127.0.0.1:<port>` authority and the matching
`localhost:<port>` browser alias. Rejecting every other `Host` value prevents an attacker-controlled
DNS name that resolves to loopback from becoming same-origin with the local project API. Terminal
WebSocket upgrades also require the configured browser origin and an opaque, single-use attachment
ticket.

The production asset tree is validated before the live session is published. Only regular,
non-symlink files below that tree are served. Exact API paths remain API paths and never fall
through to the single-page application document; missing browser assets remain 404s, while only
extensionless client routes receive the application entry point.

Generated runs and attached terminals use platform process-ownership boundaries so timeouts,
output limits, terminal deletion, and launcher shutdown can terminate and reap descendants.
Windows places a non-executing guardian or suspended ConPTY root in a Job Object before user code
can create descendants. Linux guardians become child subreapers and use revalidated process
identity when signaling. macOS applies an inherited syscall policy that keeps descendants inside
the owned process group or terminal session. A noninteractive run is refused on another POSIX
platform when no comparable process-tree boundary is available. These mechanisms own process
lifetime; they do not sandbox Python permissions. Generated Python still runs with the current
user's access.

## Verification

Focused checks:

```sh
python3 -m unittest discover \
  -s packages/setta-runtime/tests -t packages/setta-runtime -p 'test_*.py'
pnpm --filter @setta/python-canvas test
pnpm --filter @setta/python-canvas run contract:check
go -C apps/python-canvas/backend test ./...
```

After reviewed frozen setup, build the current-platform wheel with:

```sh
python3 packages/setta-runtime/scripts/build_setta_wheel.py
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
