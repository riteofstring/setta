# Python Canvas Distribution and Python Environment Plan

## Status and purpose

**Status: Ready for implementation.**

Make Python Canvas installable from the reserved, currently unpublished `setta` PyPI project and
give every Python-dependent feature one explicit project environment. A packaged installation must
run without a Setta source checkout, Go toolchain, pnpm, or system Node installation. Diagnostics,
completion, callable parameter retrieval, the Run action, and the attached terminal must agree on
the same selected interpreter.

This is the only active plan in `docs/plans`. Completed plans remain available in Git history rather
than continuing to instruct later implementation. The existing source-checkout launcher remains a
development tool; this plan adds the first packaged-user contract and does not preserve an older
public Python Canvas CLI.

The PyPI project is reserved but empty. Building and verifying release artifacts is in scope.
Uploading a release to PyPI is a separate, explicitly authorized release action.

## Product outcome

A user can install and open Python Canvas with:

```text
python -m pip install setta
setta --project /path/to/project.json
```

`uv tool install setta` and `pipx install setta` are the recommended application-isolated forms of
the same package. The `setta` command starts one loopback, single-origin application server, opens
the browser unless `--no-open` is supplied, and keeps authored project data outside the installed
package.

The Generated Python section displays the selected environment compactly, for example
`Python 3.13 · .venv`. Selecting it opens a small environment chooser showing the current source,
interpreter path, version, and discovered alternatives. When no valid environment can be resolved,
the app opens normally but Python-dependent controls explain `Choose a Python environment` instead
of failing later with provider or process errors.

Changing environments is one deliberate project action. It restarts Basedpyright, re-evaluates all
diagnostics and signatures, closes the environment-bound terminal session, and makes every future
Run and terminal command use the new environment. The authored project revision does not change.

## Fixed decisions

### 1. Distribution and project state remain separate

The `setta` wheel is an application distribution and thin launcher. It contains:

- the Python console entrypoint;
- a platform-specific compiled Go server binary;
- the built frontend as packaged static assets; and
- exact dependency metadata for the app-owned Basedpyright distribution required for language
  features.

The wheel never contains user projects, generated programs, run output, terminal history, or a
mutable dependency environment. Installation, upgrade, and uninstall must not move or rewrite a
project file.

The current strict `python-canvas-project/v1` JSON remains the sole durable authored state. It keeps
the prefix, suffix, section forest, expressions, provider-derived parameter metadata, ordering, and
revision. It does not gain an absolute interpreter path, environment activation details,
diagnostics, generated Python, terminal state, or machine-local UI state.

Generated Python remains ordinary Python that defines `SettaState` inline. Running or exporting it
does not require `import setta`; installing the application through PyPI must not create an
unnecessary runtime dependency in generated programs.

### 2. One authoritative resolved Python environment

Add one backend-owned `ResolvedPythonEnvironment` boundary. Resolution happens at project startup
and whenever the user explicitly changes the environment. Downstream services receive the resolved
value; they do not independently search `PATH`, inspect virtual environments, or guess again.

The validated value contains at least:

- canonical interpreter path;
- resolution source;
- Python implementation and version;
- environment prefix and base prefix;
- whether the interpreter belongs to a virtual environment; and
- the environment root when one exists.

Validate a candidate by executing that exact interpreter with a short, timeout-bounded probe that
returns one strict JSON document. Parse it once at the process boundary. A missing, non-executable,
unsupported, or malformed candidate is a typed environment failure, never a silent fallback.

Resolution precedence is:

1. explicit `--python PATH`;
2. nonempty `SETTA_PYTHON`;
3. the user's machine-local selection for this project;
4. an active `VIRTUAL_ENV` inherited at launch;
5. `<project-directory>/.venv`; and
6. the absolute `sys.executable` supplied by the installed Python entrypoint.

There is no final `python3`/`python` search on arbitrary `PATH`. The Python entrypoint always passes
its own absolute interpreter to the Go server as the documented fallback. Source-checkout tooling
must pass an equally explicit development interpreter.

Machine-local selections live under Setta's OS-appropriate user config directory, keyed by the
project ID and canonical project path. They do not enter the portable project JSON. Store a
canonical absolute path plus enough validated identity to detect that the environment moved or was
replaced; re-resolution then reports the invalid saved choice and offers discovered alternatives.

### 3. Analysis and execution use the same environment

The app-owned Basedpyright executable belongs to the Setta distribution, but its target Python
environment is the project's resolved environment. Start or configure Basedpyright with that exact
interpreter and project directory. Completion, signature help, automatic callable parameter
retrieval, and diagnostics all use the same provider session.

The Run action executes the immutable generated-program artifact with the resolved interpreter's
absolute path. Remove the terminal service's independent `python3`/`python` lookup. A Run request
captures the project ID, exact revision, and environment generation; a stale project or environment
generation is rejected without executing code.

The attached shell starts in the project directory with an environment derived from the same
selection. Prepend the selected interpreter directory to `PATH`, set or clear virtual-environment
variables coherently, and keep the rest of the inherited environment unchanged. Run continues to
invoke the explicit interpreter even if a user later changes `PATH` manually inside the shell.

Changing the selected environment closes the existing PTY before publishing the new environment.
This avoids a terminal that looks attached to one environment while Run and Basedpyright use
another. Reopening creates a fresh shell in the new environment.

Python execution remains local and unsandboxed with the user's permissions and inherited secrets.
The environment chooser must not imply isolation or safety that does not exist.

### 4. Packaged application boundary

Use main's proven thin-Python-entrypoint plus packaged-Go-binary shape as a reference, but keep this
application's smaller ownership model. Do not port main's plugin system, launcher manager, SDK,
deployment system, or multi-application runtime. Do not copy main's split Python selection, where a
shared resolver and the Run planner can still choose interpreters independently.

Add a pinned Python build backend and exact direct dependencies, including the Python-distributed
Basedpyright runtime. Produce platform wheels only for OS/architecture combinations exercised by
release CI. A completed installation must contain everything needed at runtime and must not
download Node, frontend assets, Go binaries, or Basedpyright on first launch. Do not publish a
nominal universal wheel around platform-specific binaries.

The packaged Go server serves the built SPA and API from one loopback origin. The Python entrypoint
selects an available loopback port, passes the project path and launcher interpreter explicitly,
waits for the readiness boundary, and opens the application URL. `--no-open` prints the URL for
headless or remote-forwarded use. Shutdown reaps the server, PTY, provider, and owned temporary
artifacts.

Supported initial commands are deliberately narrow:

```text
setta --project PATH [--create] [--python PATH] [--no-open]
python -m setta --project PATH [--create] [--python PATH] [--no-open]
```

Do not add project discovery, recent-project management, desktop shortcuts, self-update, global
daemon reuse, cloud execution, dependency installation, environment creation, or package-management
UI in this batch.

## UX contract

### Normal first run

1. The user installs `setta` and opens a project.
2. Setta resolves the explicit/active/project environment or falls back to the launcher Python.
3. The app opens with a compact environment label in Generated Python.
4. Basedpyright finishes against that environment and current diagnostics appear.
5. Run and the attached terminal use that same interpreter without further prompts.

### Missing or invalid environment

1. The canvas and authored project still open.
2. The environment label shows `Choose Python environment` with a warning state.
3. The chooser lists validated candidates and supports browsing to an interpreter.
4. Python-dependent actions remain unavailable with the same concise reason; no giant provider
   error panel or terminal command is emitted.
5. Selecting a valid interpreter starts analysis and enables execution.

### Switching environments

1. The user opens the environment chooser and selects another validated interpreter.
2. The chooser states that the current terminal will close; selecting the interpreter applies the
   change without a second confirmation dialog.
3. The environment label updates immediately to a pending analysis state without fading unrelated
   authored UI.
4. Basedpyright republishes diagnostics and callable availability for the new environment.
5. The next terminal and Run use the new interpreter.

## Architecture changes

### Python package and launcher

- Add the root Python distribution metadata, exact lock state, and a small `setta` package.
- Keep the Python entrypoint limited to locating packaged assets/binaries, forwarding explicit
  arguments, supplying `sys.executable`, process lifecycle, and user-facing startup failures.
- Resolve the installed Basedpyright command at this package boundary and pass it explicitly to Go;
  the server must not search source-tree `node_modules` or ambient `PATH`.
- Generate/stage the frontend and Go binary before wheel construction; fail the build if a required
  artifact is missing or stale.
- Keep Go authoritative for application semantics, project state, interpreter validation,
  environment selection, static serving, and API behavior.

### Backend

- Add the environment resolver, strict interpreter probe, local-selection store, and snapshot/API
  projection.
- Inject one resolved environment into the Basedpyright provider and terminal runtime.
- Replace independent executable lookup in Run with the injected absolute interpreter.
- Bind run requests and provider publications to an environment generation as well as project
  revision.
- Add one mutation for selecting/clearing a machine-local environment without changing authored
  project state.

### Frontend

- Add the compact environment label and chooser to Generated Python using existing section/header
  primitives.
- Keep environment pending/failure presentation local and stable; do not lock the section, fade
  diagnostics, resize the card, or add an application header.
- On environment change, dispose the current attached-terminal client and reconnect only after the
  backend publishes the new environment.

No `@setta/workspace` change is expected. The environment chooser and status are application-owned,
and the current section header/popover seams are sufficient. Change the workspace package only if
a concrete implementation blocker demonstrates a missing generic primitive.

## Dependency and release policy

Before installing or changing Python dependencies:

1. generate the candidate Python lockfile without lifecycle scripts;
2. run `code-policy dependency-review --base <trusted-merge-target>`;
3. review direct and transitive deltas, release ages, native contents, licenses, and OSV results;
4. pin the build backend, direct runtime dependencies, Python version range, and package manager;
   and
5. retain no vulnerable or unreviewed version merely to match main.

Build artifacts must be reproducible from one commit. CI signs/checksums each wheel and tests its
metadata, contents, supported tags, and absence of source-checkout paths. Actual PyPI credentials
and publication are not part of ordinary implementation or verification.

## Acceptance behavior

1. A wheel installs into a clean temporary environment and `setta --project ... --no-open` starts
   the production app without a repository, Go, pnpm, or system Node.
2. The packaged app serves its frontend and API from one loopback origin and opens the same strict
   project format used by the source launcher.
3. Resolution precedence is observable and deterministic for explicit `--python`, `SETTA_PYTHON`,
   saved selection, active virtualenv, project `.venv`, and launcher fallback.
4. A malformed or unavailable interpreter produces one typed environment state and never falls
   through to another unreported Python.
5. With a fixture dependency installed only in environment A, Basedpyright completion, signature
   retrieval, diagnostics, Run, and terminal `python` all see it in A.
6. After switching to environment B, the old PTY is gone and those same five surfaces all agree
   that the fixture dependency is absent until it is installed in B.
7. Switching environments does not modify the authored project file or revision and does not cause
   diagnostic flicker, section locking, layout movement, or a giant error panel.
8. An exact-revision Run rejected after an environment switch executes neither the old nor new
   interpreter.
9. Generated Python runs without importing the `setta` package.
10. Clean shutdown removes the current materialization and run artifacts and reaps all child
    processes.

Use temporary project directories, two real isolated Python environments, the production packaged
server, pinned Basedpyright, a real PTY, and the existing isolated raw-headless Chrome harness.
Assert interpreter identities and import results rather than mocking environment discovery.

## Implementation sequence

1. Establish candidate Python packaging and dependency state, review it, and build a local wheel
   containing the production frontend and Go binary.
2. Implement the authoritative environment resolver, strict probe, local selection store, and
   public snapshot contract with focused Go tests.
3. Inject the resolved environment into Basedpyright, Run, and terminal creation; remove all
   independent Python lookup paths.
4. Add the Generated Python environment label and chooser, including missing, pending, switching,
   and invalid states.
5. Add clean-wheel and two-environment production acceptance tests, then run changed-scope and the
   policy-selected merge gate.

Stop when the ten acceptance behaviors pass. Do not expand into dependency management, automatic
venv creation, broad interpreter discovery, desktop installation, remote execution, sandboxing,
plugin architecture, migration support, or general settings redesign.

## Completion checklist

### Distribution

- [ ] Exact Python packaging dependency candidate reviewed
- [ ] Platform wheel contains the Go server/frontend and declares the exact Basedpyright runtime
- [ ] `setta` and `python -m setta` start the production single-origin app
- [ ] Clean-wheel smoke runs without repository toolchains

### Environment ownership

- [ ] One strict resolver and interpreter probe implemented
- [ ] Resolution source and environment identity published to the frontend
- [ ] Machine-local project selection persisted outside authored JSON
- [ ] Basedpyright, Run, and terminal consume the same resolved environment
- [ ] Environment generation prevents stale analysis or execution

### UX and acceptance

- [ ] Generated Python environment label and chooser implemented
- [ ] Invalid and switching states remain compact and layout-stable
- [ ] Existing terminal closes coherently on environment change
- [ ] Two-real-environment raw-headless acceptance passes
- [ ] Required Code Policy changed-scope and merge gate pass
