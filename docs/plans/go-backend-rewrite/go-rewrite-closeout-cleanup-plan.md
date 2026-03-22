# Go Rewrite Closeout Cleanup Plan

Last updated: `2026-03-23`

Purpose: clean up repo guidance, docs, and developer script surfaces now that
the backend rewrite is effectively complete and Go owns the active backend
runtime, while the packaged Python entrypoint and Python SDK remain intentional
retained boundaries.

## Context

- The active source and packaged backend runtime now lives in Go under
  `cmd/setta`, `cmd/setta-server`, and `internal/*`.
- The retained packaged Python boundary is intentionally narrow:
  `python -m setta`, `backend/setta/entrypoint.py`, `backend/setta/__main__.py`,
  and the public Python SDK/listener surfaces under `backend/setta/api/*`.
- The repo guidance is still mixed. Current examples:
  - `AGENTS.md` still describes `backend/setta/routers/*`, FastAPI router
    organization, and `frontend/backendStart.sh` as a bridge to a Python
    server.
  - `README.md` is currently empty even though packaging metadata points at it
    as the project readme.
  - several docs still reference deleted or no-longer-primary Python backend
    files even when the active owner now lives under `internal/*`.
- The dev/build scripts are already mostly Go-first, but the documentation and
  help surface does not yet explain the boundary cleanly:
  - default dev loop: Go-first
  - packaged install story: Python wheel that dispatches into Go binaries
  - retained authoring/client SDK story: Python

## Goals

- Make the repo's written guidance match the current Go-owned runtime.
- Make the default dev/build/test flows obvious for new contributors.
- Preserve and clearly document the retained Python SDK and packaging boundary.
- Reduce misleading references to deleted Python backend ownership.
- Leave future cleanup sessions with a short, searchable list of follow-up
  docs/scripts tasks instead of ad hoc drift.

## Non-goals

- Removing the retained Python SDK, `python -m setta`, or wheel-facing package
  boundary.
- Reopening backend parity work that is already tracked elsewhere in the Go
  rewrite docs.
- Large runtime behavior changes just to simplify docs or script naming.
- Blindly deleting Python references that are still correct for codegen,
  packaging, listener SDK, or public client surfaces.

## Workstreams

### 1. Freeze the ownership story

Deliverable: one consistent repo-level narrative for what is Go-owned,
Python-owned, and shared.

Tasks:

- Write a short ownership summary to reuse across README/docs/AGENTS:
  - Go owns runtime, transports, CLI/server entrypoints, state, and services.
  - Python owns the retained SDK/client authoring surface plus the packaged
    wrapper entrypoint.
  - shared boundaries are explicit and narrow.
- Normalize the command story:
  - Go commands use `./scripts/go.sh`.
  - source/dev start does not require Python activation by default.
  - Python activation is required for Python tooling, the retained SDK tests,
    and packaging workflows that call `python`/`uv`.
- Decide which docs are source-of-truth for each area:
  - repo overview / contributor entrypoint
  - dev script guide
  - packaged install/build behavior
  - retained Python SDK boundary

### 2. Rewrite contributor-facing guidance

Deliverable: `README.md`, `docs/README.md`, and `AGENTS.md` stop teaching the
old Python-backend mental model.

Tasks:

- Replace stale structure language in `AGENTS.md` with the actual layout:
  - `cmd/*` entrypoints
  - `internal/*` Go runtime/services/routes
  - `backend/setta/*` retained Python package, SDK, packaging assets, and thin
    wrappers
  - `frontend/*` UI and generated bindings
- Replace Python-router guidance with the current Go route ownership split:
  - `internal/httpapi`
  - `internal/wsapi`
  - `internal/frontendbindings`
- Update command guidance so "backend tests" and "Python tests" are not treated
  as the same thing.
- Write a real top-level `README.md` that explains:
  - what Setta is
  - current repo architecture
  - Go-first dev loop
  - packaged wheel + Go binary install shape
  - retained Python SDK boundary
- Update `docs/README.md` so plan/doc links emphasize the current live docs
  instead of older phase-by-phase rewrite history.

### 3. Clean up dev/build/release script guidance

Deliverable: the script surface is documented in a way that matches current
behavior, and any misleading wrappers/help text are corrected.

Tasks:

- Inventory the script layers and declare the supported entrypoints:
  - top-level wrappers (`start.sh`, `reset.sh`, `ai.sh`, `build.sh`, etc.)
  - `scripts/*` helpers
  - `frontend/package.json` scripts
- Update docs/help text so these boundaries are explicit:
  - `frontend/backendStart.sh` starts the Go-backed dev server path
  - `scripts/run_setta_server.sh` builds and runs the Go server binary
  - `scripts/build_packaged_go_binaries.sh` stages packaged Go binaries
  - `scripts/build_python_distribution_with_go_binaries.sh` builds the wheel
    around those packaged binaries
  - `dev_install.sh` is the default Go-first install
  - `dev_install_python.sh` is opt-in Python tooling setup
- Remove or rename stale wording that implies Python still owns the dev server.
- If any wrapper/help entrypoint still lacks a minimal usage contract, add one
  while touching that script instead of leaving behavior implicit.

### 4. Patch or retire stale reference docs

Deliverable: reference docs either point at the active Go owner or are clearly
marked as retained Python boundary docs.

Tasks:

- Run a search-driven docs audit for stale patterns, starting with:
  - `backend/setta/routers`
  - `FastAPI`
  - `uvicorn`
  - `backend/setta/start.py`
  - `backend/setta/dev_start.py`
  - `backend/setta/server.py`
  - "Python backend" when the runtime is now Go-owned
- Triage each hit into one of three buckets:
  - replace with the active Go owner/path
  - keep, but relabel as retained Python boundary
  - delete/archive if it only describes removed behavior
- Prioritize high-traffic docs first:
  - `docs/guides/dev-quickstart.md`
  - `docs/guides/worktree-dev-quickstart.md`
  - `docs/guides/dev-scripts.md`
  - `docs/reference/dev-vs-built.md`
  - `docs/reference/setta-cli-commands.md`
  - `docs/reference/logging-and-error-handling.md`
- For behavior docs that still need historical Python references as source
  context, make that explicit instead of writing as if those files are still
  active runtime owners.

### 5. Make the retained Python SDK boundary explicit

Deliverable: contributors can tell the difference between "dead Python backend
tail" and "intentional Python API/package surface."

Tasks:

- Document the kept boundary in one place and cross-link it:
  - `python -m setta`
  - `setta.api.SettaListener`
  - `setta.api.ListenerHotReloader`
  - `setta.api.chat_toolkit`
  - `setta.api.SettaRunner`
  - share-listener entrypoints and retained listener helpers
- Review docs and tests that still say "Python backend" and tighten them to one
  of:
  - retained Python SDK/client surface
  - source-only packaging/build helper
  - dead reference slated for deletion
- Review `pyproject.toml` comments/extras docs so contributors understand why
  the packaged dependency surface is narrow but repo-local extras remain broad.

### 6. Verify and land in bounded batches

Deliverable: cleanup lands in small batches with explicit verification instead
of one giant docs/scripts rewrite.

Suggested batches:

1. ownership narrative + `README.md` + `AGENTS.md`
2. dev/build script docs and help text
3. stale reference-doc path fixes
4. retained Python SDK boundary docs

Verification per batch:

- Search checks:
  - stale-pattern `rg` queries shrink or are relabeled deliberately
- Script smoke checks when touching script behavior/help:
  - `./scripts/go.sh version`
  - `./scripts/run-dev-instance.sh --help`
  - `source activate.sh && python -m setta --help`
- Packaging/build checks when touching build/install docs or scripts:
  - `./build.sh`
  - `./verify_install.sh`
- Tests when behavior actually changes:
  - `./scripts/go.sh test ./... -count=1`
  - `./scripts/run_backend_tests.sh` for retained Python boundaries that were
    edited

## Suggested Sequencing

1. Write the top-level ownership story first.
2. Rewrite `AGENTS.md` and the top-level `README.md` to match that story.
3. Update the dev/build script docs and any touched help text.
4. Sweep the high-traffic reference docs for stale Python-owner paths.
5. Finish with the retained Python SDK/package boundary docs so the remaining
   Python references are obviously intentional.
6. Run the packaging/install smoke path at the end, because that is the place
   where the Go runtime and retained Python wheel boundary meet.

## Exit Criteria

- `README.md`, `docs/README.md`, and `AGENTS.md` all describe the repo as
  Go-first with an explicit retained Python SDK/package boundary.
- No high-traffic developer doc still implies FastAPI/router ownership for the
  active backend runtime.
- Script docs and help text identify the real Go-backed start/build/package
  flow.
- The retained Python SDK/package surface is documented clearly enough that
  future cleanup work does not accidentally delete or misdescribe it.
- Search-driven stale-doc queries are either empty or only hit intentional,
  labeled retained-boundary references.
