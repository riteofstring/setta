# Setta Python Canvas Distribution Plan

## Status

**Approved for supervised implementation on `python-canvas-main-parity`.**

Trusted merge base: `main` at `043d3b2e9`. The public cutover is atomic: the
documented application command becomes `setta python-canvas ...` only after the
wheel, launcher, live-session bridge, Python environment, and AI run path pass
their acceptance tests together.

Publishing to PyPI, pushing the branch, and opening a pull request are outside
this implementation. They require separate authorization.

## Outcome

A user installs the Setta application distribution with:

```text
python -m pip install setta
```

The installation provides one extensible umbrella command:

```text
setta --version
setta apps --json
setta doctor --json
setta python-canvas ...
```

Python Canvas is the first registered Setta app. A packaged installation runs
from any working directory without a source checkout, Go, pnpm, curl, or a
system Node installation. The wheel contains the native Python Canvas server
and built web application, and has an exact runtime dependency on the packaged
Basedpyright distribution.

Python-dependent behavior has one rule that requires no setup:

1. Starting at the project-file directory, use the nearest valid `.venv` found
   while walking toward the filesystem root.
2. If there is no `.venv`, use the exact `sys.executable` that launched Setta.
3. If the nearest `.venv` exists but is invalid, stop with one concise typed
   startup error. Do not silently select a different Python.

Basedpyright, callable signature retrieval, diagnostics, generated-program
execution, and the attached terminal all receive that one resolved Python.
Nothing searches `PATH`, reads `VIRTUAL_ENV`, reads `SETTA_PYTHON`, or stores an
interpreter path in the authored project. Creating or replacing `.venv` takes
effect after restarting Python Canvas.

## Public command contract

The root command owns app registration, version reporting, runtime checks, and
dispatch. It does not own Python Canvas domain types.

```text
setta --version
setta apps [--json]
setta doctor [--json]

setta python-canvas schema [--pretty]
setta python-canvas open --project PATH [--create] [--no-open]
setta python-canvas session inspect --project PATH [--pretty]

setta python-canvas snapshot (--project PATH | --url URL) \
  [--wait-diagnostics] [--timeout DURATION] [--pretty]

setta python-canvas apply (--project PATH | --url URL) \
  --file PATH|- [--wait-diagnostics] [--timeout DURATION] [--pretty]

setta python-canvas run (--project PATH | --url URL) \
  [--wait-diagnostics] [--diagnostics-timeout DURATION] \
  [--run-timeout DURATION] [--pretty]
```

`python -m setta` is equivalent to `setta`. Unknown apps and commands fail
without invoking an app. `apps --json` is generated from the same registry used
for dispatch, so its inventory cannot drift.

`schema` works offline. It publishes a versioned Python Canvas command schema,
the authoritative closed operation registry, stable result shapes, typed error
codes, and exit semantics. Changing that shape increments its schema version.

Live commands require exactly one selector:

- `--project` resolves exactly one live Python Canvas session for the canonical
  project path. It never edits `project.json` directly and never starts an
  implicit session.
- `--url` is an expert/automation escape hatch restricted to an absolute
  loopback HTTP URL.

Normal successful commands write one JSON document to stdout. Invalid input or
a typed application rejection writes one JSON error to stderr and exits `2`.
Connection, timeout, malformed-response, or unexpected runtime failure writes
one JSON error to stderr and exits `1`.

A completed generated program is a result even when Python fails. `run` writes
that result to stdout and exits `0` for Python exit zero or `3` for a nonzero
exit, signal, timeout, or output-limit termination. Its result includes the
captured project revision, stdout, stderr, Python exit status when available,
termination reason, elapsed time, and truncation flags.

## Ownership boundaries

### Python distribution and app registry

The Python distribution lives under `packages/setta-runtime`. Its console
entrypoint owns only:

- the registry of installed Setta app adapters;
- root help, `--version`, `apps`, and `doctor`;
- locating and validating packaged runtime assets;
- live-session location by app ID and canonical project path;
- launching and supervising the private app server; and
- dispatching app-owned arguments without importing app domain models.

Adding a future app means registering another adapter and packaging its owned
runtime. It must not require adding that app's types or command branches to the
root dispatcher.

The app adapter owns Python Canvas argument validation, project/session
selection, and invocation of the private native command. The current Go
`python-canvas` executable remains an internal packaged server/adapter and is
no longer a documented public executable.

### Packaged runtime

The root `pyproject.toml` defines the `setta` distribution, exact build backend,
supported Python range, exact direct runtime dependencies, and the `setta`
console script. The exact Python package manager version is checked in, and a
frozen lockfile is used for normal development and release setup.

Each published artifact is a platform wheel, never a nominal universal wheel.
It contains:

- the Python launcher and adapters;
- a manifest with one format version and hashes for owned runtime assets;
- the native `python-canvas` server for that wheel tag; and
- the production Vite output served by that server from the same loopback
  origin as its API.

Basedpyright is pinned as a Python runtime dependency that provides its own
Node runtime. The launcher resolves its installed language-server entrypoint
once and passes the exact command to Go. The server never probes global PATH,
source `node_modules`, or a package manager at runtime.

Wheel construction builds the frontend and native server before staging. It
fails if an asset is missing, stale, a pnpm symlink, outside the staging root,
or inconsistent with the manifest. Native CI runners build and smoke-test each
supported OS/architecture because the tree-sitter backend requires CGO. Initial
publication targets are declared only after their native smoke jobs exist.

No source distribution is published until it can produce the same complete
runtime under an explicit, tested toolchain contract.

### Live-session locator

`open` is a foreground supervisor. It canonicalizes the project path, acquires
one app/project ownership record, starts the packaged server on a loopback
ephemeral port, waits for API and web readiness, records the live URL, and opens
the browser unless `--no-open` is present. It removes its record and reaps its
child on normal exit or signal.

The generic record contains only locator data: format version, app ID,
canonical project path, loopback URL, owner process identity, and a random
instance nonce. It lives in an owner-only OS runtime/cache directory and is
written atomically. Resolution validates both process liveness and an
app-specific readiness identity before returning a URL. A stale record is
removed; PID existence alone is insufficient because PIDs are reused.

The locator is transient runtime state. It is never written into a project,
committed, treated as a daemon, or used to infer a default project. Concurrent
`open` calls for the same app/project yield one owner or one typed
already-running result; they cannot both publish records.

### Python environment

Go owns one immutable `ResolvedPythonEnvironment` created before materializer,
project, provider, or terminal startup. It contains the canonical interpreter,
selection source, implementation/version, prefix/base prefix, virtualenv root
when applicable, and the prepared child-process environment.

A `.venv` candidate must have `pyvenv.cfg` and the platform interpreter
(`bin/python` or `Scripts/python.exe`). Interpreter symlinks are valid. The
resolver validates the selected executable through a bounded subprocess that
returns one strict JSON object. External values are parsed once into the typed
environment. A direct private-server invocation without either a valid project
`.venv` or the launcher's exact Python is an error; there is no ambient fallback.

Consumers receive explicit values:

- Basedpyright is configured with the exact interpreter before any generated
  document is opened.
- Interactive Run invokes that interpreter's absolute path.
- Noninteractive AI Run invokes the same absolute path without a shell.
- A new PTY starts in the project directory with the selected interpreter
  directory first on `PATH`; `VIRTUAL_ENV` is set only for a selected virtual
  environment, and inherited Python-selection variables are removed.

The selection is machine-local and startup-only. It does not change project
bytes, project revision, snapshot V2, or UI state. Shell startup files may
subsequently change an interactive shell because that is explicit user action;
Setta still uses the absolute interpreter for its Run actions.

### Python Canvas server and web boundary

The private server receives explicit internal startup inputs for project path,
launcher Python, Basedpyright command, and web root. It binds loopback itself,
derives the exact same-origin terminal origin from the bound listener, emits
one strict readiness message to its supervisor, and serves:

- the existing `/api/v2` application contract;
- terminal endpoints;
- the new noninteractive run endpoint; and
- production web assets with SPA fallback, safe path handling, correct content
  types, and no directory exposure.

Startup validates every input before creating or writing a new project. A
failure after acquiring resources closes them in reverse ownership order. The
source checkout script is a development convenience only and exercises the
same internal startup inputs; it is not part of the installed product.

### AI-native mutation and execution

`snapshot` and `apply` retain their current live-coordinator semantics.
`apply` obtains one canonical snapshot, binds its project ID and revision,
submits one mutation batch, and never retries a conflict.

`run` is a separate noninteractive runner, not a wrapper around the attached
terminal. For one request it:

1. captures immutable generated Python through the existing coordinator seam
   at the requested project ID and exact revision;
2. writes one owner-only temporary artifact in the project directory;
3. executes the resolved interpreter directly with project directory as CWD;
4. captures stdout and stderr separately with a default 30-second timeout and
   1 MiB limit per stream;
5. terminates the owned process tree on timeout or output limit; and
6. removes the artifact on every completion path.

Generated Python executes locally, unsandboxed, with the user's permissions and
remaining inherited environment. CLI help and documentation state this plainly.

## Implementation sequence

### 1. Freeze contracts and package skeleton

- Check in this plan and record the trusted base/candidate.
- Add the root Python project, exact package-manager pin, app registry, package
  resource manifest, and offline root-command tests.
- Generate the candidate Python lock without installing dependencies.
- Run `code-polishy dependency-review --base main` before any dependency install.

### 2. Make the server package-owned

- Replace CWD app-root discovery with explicit internal runtime paths.
- Serve the production frontend and API from one bound loopback listener.
- Add the strict readiness boundary and clean shutdown behavior.
- Stage the current-platform native binary and frontend into a tagged wheel.

### 3. Unify Python

- Add the typed startup resolver and real-venv validation.
- Inject it into Basedpyright, interactive Run, and PTY construction.
- Prove all three surfaces with a fixture installed in only one of two real
  temporary virtual environments.

### 4. Add live project sessions and AI Run

- Add atomic app/project session ownership and `session inspect`.
- Resolve `snapshot`, `apply`, and `run` through the verified live session.
- Add the noninteractive runner, HTTP contract, CLI command, and generated
  TypeScript contract where the browser boundary requires it.
- Version the offline schema so command inventory, operations, and dispatch are
  mechanically checked together.

### 5. Complete the installable product

- Add deterministic staging/build scripts and native release CI.
- Add clean-wheel inspection and installation tests from an unrelated CWD.
- Cut documentation to the `setta python-canvas` public surface.
- Add the runtime module, dependency direction, build check, focused tests, and
  wheel artifact target to `.code-polishy.json`.

### 6. Verify, review, and commit

- Run focused tests while each slice is edited.
- Run the clean-install acceptance from a built wheel with repository tools
  removed from `PATH`.
- Run `code-polishy test --changed`.
- Bind the requested agent review to base `043d3b2e9` and the exact final dirty
  candidate, including committed, staged, unstaged, and untracked files.
- Resolve findings, then run `code-polishy merge-gate --base main` exactly once
  for the final candidate.
- Commit only task-owned changes in coherent commits. Do not push or publish.

## Required acceptance evidence

1. A clean temporary environment installs the built platform wheel. From an
   unrelated directory, `setta --version`, `setta apps --json`,
   `python -m setta`, `setta doctor --json`, and
   `setta python-canvas schema` work.
2. With Go, pnpm, Node, curl, and the repository absent from runtime `PATH`,
   `setta python-canvas open --project ... --create --no-open` serves root HTML,
   hashed assets, API, Basedpyright diagnostics, and terminal endpoints from one
   loopback origin.
3. A live project is discoverable only by its canonical path; stale and missing
   sessions return typed errors and make no project mutation request.
4. An AI client can inspect schema, create/configure a callable with `apply`,
   wait for exact-revision diagnostics, snapshot the canonical result, and run
   the generated program with deterministic output and exit reporting.
5. A dependency installed only in project `.venv` A is seen by diagnostics,
   signature retrieval, interactive Run, noninteractive Run, and the terminal.
   When no project `.venv` exists, all five use the launcher Python. An invalid
   nearest `.venv` fails before creating a requested project file.
6. Run tests cover exact-revision conflict, stdout/stderr separation, Python
   nonzero exit, timeout, output limit, process cleanup, artifact cleanup, and
   no PTY creation.
7. Wheel inspection proves a platform tag, correct native executable format and
   mode, manifest/hash agreement, packaged web assets, no source paths, and no
   broken pnpm links. Native CI performs this smoke on every declared release
   target.
8. Existing project mutation, persistence, strict V2 snapshot, frontend
   contract, and browser behavior remain green.

## Explicit non-goals

- PyPI upload, signing credentials, branch push, or pull request creation.
- A global daemon, background service, recent-project list, or implicit project.
- Environment variables, activation instructions, interpreter preference UI,
  dependency installation, environment creation, or automatic environment
  mutation.
- Cloud execution, containers, or a Python security sandbox.
- Plugin loading, remote apps, self-update, desktop packaging, or porting the
  unrelated legacy Setta CLI from `main`.
- Compatibility aliases for a public `python-canvas` executable.

## Supervision contract

Implementation may proceed in private, non-overlapping batches. The primary
agent owns this plan, shared interfaces, dependency review, integration,
repository policy, final review, commits, and subagent quiescence. Subagents do
not commit, weaken tests, change the locked `code-polishy` release, or expand
their assigned ownership without approval. Every batch returns changed files,
tests run, known limitations, and unresolved risks for supervisory review.
