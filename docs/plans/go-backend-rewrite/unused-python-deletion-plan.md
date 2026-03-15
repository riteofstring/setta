# Unused Python Deletion Plan

Last verified: `2026-03-15`

Purpose: remove superseded Python implementation and tests after rewrite
completion, without repeating the earlier mistake of deleting code before
proving the surviving behavior already exists in Go or is no longer required.

This is the final cleanup phase of the Go rewrite. It is not a new migration
phase and it is not a blanket "delete Python until tests pass" effort.

The output should be:

- no unused Python backend implementation remains in-tree
- no legacy Python tests remain for still-supported behavior unless they still
  prove an explicit retained Python boundary
- every deleted file has either:
  - an identified Go/frontend replacement owner and proof, or
  - an explicit justification for why no replacement is needed

The output should not be:

- zero Python files at any cost
- accidental deletion of retained SDK, packaging, asset, or sidecar boundaries
- deletion justified only by old rewrite docs or assumption
- local inlining or micro-cleanup inside Python code that should instead be
  deleted as part of a larger proven batch

## Inputs

Start from current code and the live rewrite docs:

- `CURRENT.md`
- `go-backend-rewrite-plan.md`
- `caller-backed-backend-surface-checklist.md`
- `backend-capability-coverage-checklist.md`

Use those docs as routing help only. For each deletion decision, re-check the
current code, active callers, and tests.

## Non-goals

Do not delete the explicit retained Python boundaries unless a separate product
decision changes that boundary:

- `backend/setta/__main__.py`
- `backend/setta/entrypoint.py`
- public Python APIs under `backend/setta/api/*`
- share-listener authoring/runtime boundary under
  `backend/setta/share/listener_runtime.py`
- Python support modules still imported by those retained APIs

Do not delete explicit shipped asset/process boundaries as part of this plan:

- `backend/setta/agentic/external_adapters/sidecars/*`
- `backend/setta/vendor/node/*`
- `backend/setta/plugins/schemas/*`
- `backend/setta/launcher_artifacts/assets/*`
- `backend/setta/go_bin/*`

If any of those boundaries should shrink later, treat that as a separate,
bounded cleanup with its own proof.

## Deletion Rules

### Rule 1: Deletion unit

The deletion unit is a single file or a tight file cluster that implements one
behavior surface together.

Prefer the largest safe batch that shares one behavior surface and one proof
story.
If both a small local deletion and a larger cluster deletion are supportable,
choose the larger cluster unless it would mix classifications, widen retained
boundary risk, or make verification meaningfully less clear.

Do not delete broad trees in one step unless every file in the tree shares the
same proven classification.
Do not spend time simplifying internals of candidate files before deletion
unless that edit is required to sever a retained import, isolate a retained
support module, or unlock the larger batch.

### Rule 2: Required proof per deleted implementation file

Before deleting a Python implementation file, record all of:

- current classification:
  - retained boundary
  - explicit asset/process boundary
  - dead/reference tail
  - still-active debt
- active caller check:
  - which current non-test caller would reach this code, if any
- runtime owner:
  - exact Go/frontend owner if the behavior still exists
- proof:
  - Go/frontend code references
  - targeted tests already covering the behavior, or
  - explicit justification that the behavior is no longer part of the current
    product surface

Do not delete an implementation file on "looks dead" alone.

### Rule 3: Required proof per deleted test file

Before deleting a Python test, record one of:

- replacement proof:
  - the Go/frontend tests that now prove the same surviving behavior
- dead-path proof:
  - the implementation path under test is no longer active or shipped
- retained-boundary exemption:
  - the test still proves a retained Python boundary and should stay

Do not require fake one-for-one test translation. Behavioral replacement or
dead-path proof is enough. Lack of both is not enough.

## Required working artifact: deletion ledger

Maintain a running deletion ledger while executing this plan. It can live in a
temporary working note, PR description, or commit message draft, but each
deletion batch must have the same fields:

- Python file(s)
- type:
  - implementation
  - test
  - support module
- current classification
- current caller evidence
- Go/frontend replacement owner, or explicit no-replacement justification
- proof tests
- decision:
  - delete now
  - keep for later
  - retained permanently

No deletion batch should merge without that evidence trail.

## Execution sequence

Do this cleanup in steps. Finish and verify each step before moving on.

### Step 1: Freeze the keep-list

Goal:

- make the intentional Python boundary explicit before deleting anything

Actions:

- restate the retained Python/API/asset boundaries from `CURRENT.md`
- re-check current imports from:
  - `backend/setta/api/*`
  - `backend/setta/share/listener_runtime.py`
  - `backend/setta/__main__.py`
  - `backend/setta/entrypoint.py`
- mark files as:
  - retained
  - candidate for deletion review

Exit gate:

- the keep-list is explicit enough that later cleanup cannot accidentally eat
  a retained Python boundary

### Step 2: Rebuild the candidate inventory from code

Goal:

- convert the current Python tree into deletion candidates grouped by real
  behavior clusters

Expected candidate clusters include:

- legacy transport shell:
  - `backend/setta/server_state.py`
  - `backend/setta/routers/*`
  - `backend/setta/websockets/*` except retained client helpers
  - `backend/setta/runtime/*`
  - `backend/setta/middleware/*`
  - `backend/setta/mcp/server.py`
- superseded backend subsystems:
  - package-root detached-run residue:
    - `backend/setta/run_manager.py`
    - `tests/run_manager/*`
  - package-root startup/launcher/ssh residue:
    - `backend/setta/launch.py`
    - `backend/setta/launcher_metadata.py`
    - `backend/setta/launcher_setup.py`
    - `backend/setta/launcher_workspace_store.py`
    - `backend/setta/ssh_common.py`
    - `backend/setta/ssh_connect.py`
    - `tests/start/test_launch_grace.py`
    - `tests/start/test_launch_process_cleanup.py`
    - `tests/start/test_launcher_metadata.py`
    - `tests/start/test_launcher_setup.py`
    - `tests/start/test_launcher_workspace_store.py`
    - `tests/start/test_ssh_common.py`
    - `tests/start/test_ssh_connect.py`
    - `tests/start/test_ssh_tunnel_metadata.py`
  - package-root trusted-origin residue:
    - `backend/setta/trusted_frontend_origins.py`
    - `tests/auth/test_trusted_frontend_origins.py`
  - terminal runtime residue:
    - `backend/setta/terminals/*`
    - `tests/terminals/*`
  - `backend/setta/project_state/*` except retained typed support
  - `backend/setta/llm/*` except retained `llm/chat_toolkit/*`
  - `backend/setta/agentic/*` except explicit sidecar assets
  - `backend/setta/plugins/*` except explicit retained assets or proven public
    Python surface
  - `backend/setta/terminals/*`
  - `backend/setta/deployments/*`
  - `backend/setta/lsp/*`
  - `backend/setta/ui_settings/*`
  - `backend/setta/database/*`
  - `backend/setta/file_watchers/*`
  - `backend/setta/binary/*`
  - `backend/setta/app/*`

Current tree note:

- `backend/setta/server_state.py`, `backend/setta/routers/*`,
  `backend/setta/middleware/*`, and `backend/setta/mcp/server.py` are already
  gone in the current worktree.
- `backend/setta/run_manager.py` and `tests/run_manager/*` are also gone in
  the current worktree because detached-run runtime ownership already lives in
  Go under `internal/detachedruns` plus
  `internal/httpapi/detached_run_routes.go`; the retained Python runner
  boundary is only the thin `setta.api.SettaRunner` HTTP client.
- `backend/setta/launch.py`, `backend/setta/launcher_metadata.py`,
  `backend/setta/launcher_setup.py`,
  `backend/setta/launcher_workspace_store.py`, `backend/setta/ssh_common.py`,
  `backend/setta/ssh_connect.py`, and their `tests/start/` mirrors are also
  gone in the current worktree because the active local launch, launcher home,
  launcher management, and SSH connect/runtime surfaces already live in Go
  under `internal/launcher`, `internal/workspacelaunch`, `internal/sshx`,
  `internal/settacmd`, and `internal/settacli`.
- `backend/setta/trusted_frontend_origins.py` and
  `tests/auth/test_trusted_frontend_origins.py` are also gone in the current
  worktree because trusted frontend-origin storage, launcher-origin proof
  handling, and workspace-launch trust now live in Go under
  `internal/frontendorigins`, `internal/workspacelaunch`, and
  `internal/httpapi`.
- `backend/setta/terminals/*` and `tests/terminals/*` are also gone in the
  current worktree because terminal PTY runtime, terminal websocket
  attach/history/resize behavior, terminal cleanup routes, and `runCode`
  execution all already live in Go under `internal/terminals`,
  `internal/wsapi/routes.go`, `internal/httpapi/terminal_routes.go`, and the
  Go `runs`/project-state runtime.
- Recompute the remaining Step 3 batch from live imports before deleting more
  websocket helpers. `backend/setta/websockets/binary_frames.py` remains tied
  to the retained Python listener SDK, while `websocket_manager.py` and
  `msg_handlers/frontend_sender.py` are intertwined with broader superseded
  Python subsystem clusters and should be deleted with those dependents rather
  than by themselves unless current code review proves a clean smaller batch.

Actions:

- use current imports, entrypoints, and caller scans to place every candidate
  file into a real cluster
- rank the candidate clusters by safe size and leverage so the first deletion
  batch is the biggest low-risk batch, not the smallest obvious edit
- do not mix retained support modules into a delete batch just because they
  sit next to dead code

Exit gate:

- every candidate file belongs to a bounded cleanup batch

### Step 3: Delete the lowest-risk legacy transport shell first

Goal:

- remove the old Python server skeleton before touching trickier support code

Expected first batch:

- `backend/setta/server_state.py`
- `backend/setta/routers/*`
- `backend/setta/websockets/*` except retained client-side helpers such as
  `binary_frames.py`
- `backend/setta/runtime/*`
- `backend/setta/middleware/*`
- `backend/setta/mcp/server.py`

Current tree note:

- In the current worktree, that batch is already mostly complete. The
  remaining low-risk residue in the legacy transport-shell slice is the unused
  `backend/setta/runtime/*` package plus dead-path Python tests that only
  validate the superseded Python websocket manager surface.

Required proof:

- active callers already terminate in Go routes/websockets
- no retained Python API imports these modules
- Go tests already cover the surviving runtime/transport behavior

Suggested verification:

- targeted Go route/websocket/app tests
- targeted Python retained-boundary tests to confirm no import breakage

Exit gate:

- the old Python server shell is gone and retained Python APIs still import and
  run

### Step 4: Delete superseded subsystem clusters one cluster at a time

Goal:

- remove dead backend logic behind the old Python server shell

Recommended batch order:

1. `project_state`
2. `terminals`
3. `deployments`
4. `lsp`
5. `ui_settings`
6. `database`
7. `file_watchers`
8. `binary`
9. `app`
10. `llm`
11. `agentic`
12. `plugins`

Reason for this order:

- early batches are easier to map to obvious Go owners
- late batches contain more retained helper overlap or a higher chance of
  mistaken deletion
- this ordering also biases the work toward high-leverage cluster deletion
  before granular file-by-file cleanup

Per-batch requirements:

- map each deleted Python file to the current Go owner or to an explicit
  removal justification
- name the current Go package(s) and tests
- confirm no retained Python boundary imports the deleted files

Exit gate for each cluster:

- cluster-specific Go ownership or non-replacement justification is documented
- relevant tests pass
- no retained Python boundary was widened accidentally

### Step 5: Delete legacy Python tests only after replacement mapping

Goal:

- remove Python tests that now only exercise dead Python backend code

Actions:

- walk `tests/` cluster by cluster
- for each Python test file:
  - identify the behavior it actually proved
  - point to the current Go/frontend proof if the behavior still exists
  - otherwise prove the path is dead and no longer shipped

Likely keepers:

- tests for retained Python packaging/module entrypoints
- tests for retained Python listener SDK and runner client boundaries

Likely deletion candidates:

- tests whose only target was the legacy Python server/runtime path now proven
  dead

Exit gate:

- every deleted Python test has either replacement proof or dead-path proof

### Step 6: Tighten packaging and dependency boundaries after source deletion

Goal:

- make packaging metadata match the new slimmer source tree

Actions:

- review `pyproject.toml`, build includes, force-includes, and any source-only
  Python dependency extras
- remove packaging references to Python modules no longer present
- keep explicit retained assets and boundaries intact

Exit gate:

- package metadata does not reference deleted Python source
- install/build smoke still works

### Step 7: Final sweep

Goal:

- prove no unused Python implementation/tests remain outside the retained
  boundary

Actions:

- rescan `backend/setta/*` and `tests/**`
- classify everything left as:
  - retained boundary
  - retained boundary support
  - explicit asset/process boundary
  - live current test for retained boundary
- if anything else remains, either delete it or justify it explicitly

Exit gate:

- no unclassified Python implementation/test files remain

## Batch verification contract

For each deletion batch, run the narrowest tests that prove the touched
boundary. Prefer targeted suites over one giant end-of-phase run.

Minimum expectation per batch:

- search/import verification for retained Python boundaries
- targeted Go tests for the surviving owner
- targeted Python tests if the batch touches retained Python support
- targeted frontend tests if the deleted behavior was partly frontend-owned

Recommended final sweep verification:

- retained Python boundary pytest targets
- targeted frontend transport/plugin/runtime tests
- targeted Go app/httpapi/wsapi/plugins/settacmd tests
- packaged/module-entrypoint smoke where packaging boundary changed

## Decision table for "no Go equivalent"

It is acceptable to delete a Python file without a Go equivalent only when one
of these is true:

- the behavior was never part of the supported final product surface
- the behavior was a legacy transport/runtime path with no active caller
- the behavior was purely duplicate/reference code after a Go cutover
- the behavior was an abandoned test-only helper for a dead path

It is not acceptable when:

- the behavior is still shipped or user-visible
- the behavior is part of a retained Python public API
- the behavior still exists in product scope but has not been tied to a
  current owner yet

## Common failure modes to avoid

- deleting Python because the folder "looks legacy"
- deleting tests before identifying what behavior they proved
- assuming parity from docs instead of code-and-test proof
- deleting support modules that are still imported by retained Python APIs
- treating packaged assets or sidecars as dead source code
- mixing several clusters into one giant cleanup commit that cannot be audited

## Done means

This cleanup track is done only when:

- all non-retained unused Python implementation has been deleted
- all non-retained legacy Python tests have been deleted or explicitly kept
  with reason
- every deletion has a replacement-owner or no-replacement justification
- retained Python boundaries still import, package, and behave correctly
- the remaining Python tree is intentionally small and fully classified

## Next recommended step

Start with Step 1 and Step 2 only.

Do not begin by deleting files.
The first executable deliverable should be a deletion ledger and a bounded
first batch, with the legacy transport shell as the default starting point
unless current code review shows a retained import dependency there.
Do not start by inlining or simplifying dead Python within a candidate batch.
Use those smaller edits only when they are necessary to unlock the chosen
batch or after the major cluster deletions are complete.
