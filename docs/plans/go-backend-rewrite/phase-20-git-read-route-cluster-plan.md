# Phase 20 Git Read Route Cluster Plan

## Purpose

This doc records the next executable direct-frontend phase after the completed
Phase 19 project-shell route cluster.

The current frontend still calls back into Python for the bounded git read
surface:

- `POST /git/status`
- `POST /git/diff`
- `POST /git/log`
- `POST /git/commitDetails`
- `POST /git/commitFileDiff`

Those routes are the next highest-leverage caller-backed gap because the
project shell is now Go-owned for the current clean-break scope and the git
overview remains a live user-facing workflow with existing Playwright
coverage.

## Status

Current repo status as of 2026-03-10:

- Phase 19 project-shell route ownership is complete for the current
  caller-backed surface
- Slice 1 is now landed:
  - Go-owned `POST /git/status`
  - Go-owned `POST /git/diff`
  - explicit `internal/gitread` owner for repo-root discovery, bounded git
    CLI execution, porcelain-v2 status parsing, literal pathspec validation,
    and synthesized untracked diffs
  - thin `internal/httpapi` transport plus real IDE app wiring and focused
    service/route/app coverage
- the remaining Phase 20 caller-backed gap is now the commit-history slice:
  - `POST /git/log`
  - `POST /git/commitDetails`
  - `POST /git/commitFileDiff`

## Scope

Caller-backed route surface for this phase:

- `POST /git/status`
- `POST /git/diff`
- `POST /git/log`
- `POST /git/commitDetails`
- `POST /git/commitFileDiff`

Explicit non-goals for the first git phase:

- git write/mutation routes
- background repo watchers or push/pull orchestration
- broad deployment-mode redesign
- unrelated project-shell or listener-route work

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-19-remaining-direct-frontend-route-inventory-and-rerank.md`
- `backend/setta/routers/git.py`
- `backend/setta/types/git.py`
- `tests/routers/test_git_routes.py`
- `tests/utils/test_git.py`
- `frontend/src/state/actions/git.ts`
- `frontend/tests/e2e/git/git-diff-overlay.spec.ts`
- `frontend/tests/e2e/git/git-graph-overlay-core.spec.ts`
- `frontend/tests/e2e/git/git-graph-overlay-pagination.spec.ts`
- `internal/app/app.go`
- `internal/httpapi`
- `internal/devworktree/worktree.go`

## Existing Go Foundations

- `internal/httpapi`
  - thin route registration patterns, launcher/IDE guards, and typed error
    mapping patterns already used by adjacent route clusters
- `internal/app`
  - real IDE app wiring and focused app-handler test coverage patterns
- `internal/devworktree/worktree.go`
  - small existing repo-root resolution precedent through the real `git`
    binary, proving there is no need to invent a Git library abstraction first

What is still missing:

- commit-log pagination and projection
- commit-details and historical file-diff reads
- revision-validation helpers for the remaining history slice

## Desired Go Boundaries

### 1. `internal/gitread` owns repo-root resolution and subprocess execution

This owner should handle:

- workspace repo-root discovery through the real `git` binary
- bounded `git` subprocess execution with explicit timeouts and stdout/stderr
  caps
- typed projection of porcelain/status, diff, log, and show output into the
  frontend response shapes
- revision and path validation without route-local shelling out

Recommendation:

- use the real `git` CLI as the source of truth instead of reimplementing git
  semantics in Go or introducing a broad `go-git` compatibility layer

Rationale:

- product semantics depend on real repo config, exact diff/log behavior, and
  pathspec handling
- the Python implementation already relies on the real `git` binary for those
  semantics
- using the CLI keeps the transport thin and avoids reintroducing heuristic
  approximations

### 2. `internal/httpapi` keeps transport thin

The HTTP layer should only own:

- request decoding
- mode policy
- typed error mapping
- delegation to `internal/gitread`

It should not own:

- repo-root lookup details
- revision parsing
- path normalization
- subprocess orchestration

### 3. Real app wiring stays explicit

The app should inject the workspace root and any bounded runner dependencies
into the git-read service instead of creating another global singleton.

## Python Reference Behaviors To Preserve As Product Semantics

Read the current Python code/tests as product reference material:

- IDE-only access and clear non-repo errors
- literal pathspec handling for paths containing glob-like characters
- explicit file-only path validation for diff and historical file-diff routes
- synthesized untracked-file diffs without falling back to heuristics
- capped status/diff/log/show payloads with truncation flags
- revision validation and direct invalid-revision errors for log/details routes
- historical diff behavior when the current workspace path has become a
  directory

These behaviors matter. The Python router/module shape does not.

## Planned Slices

### Slice 1: Repo info, status, and working-tree diff

Routes:

- `POST /git/status`
- `POST /git/diff`

Deliverables:

- new `internal/gitread` service foundation
- repo-root discovery and typed non-repo handling
- porcelain-v2 status parsing
- staged/unstaged/untracked diff support
- literal pathspec handling plus file-only validation
- focused tests in service, route, and real app layers

Why this goes first:

- it is the live overview entry path
- the diff overlay depends on status shape and path validation
- it establishes the subprocess, timeout, and truncation boundary reused by
  the log/history slice

Status:

- complete

Completed:

- added `internal/gitread` as the explicit Go owner for:
  - workspace repo-root discovery through the real `git` CLI
  - bounded stdout/stderr capture with timeout and cap enforcement
  - porcelain-v2 status parsing with separate staged/unstaged entries
  - literal-pathspec diff loading
  - synthesized untracked-file diff generation
- added thin `internal/httpapi` transport for:
  - `POST /git/status`
  - `POST /git/diff`
- wired the real IDE app to the new git-read owner
- added focused tests in:
  - `internal/gitread`
  - `internal/httpapi`
  - `internal/app`

Decisions made:

- keep using the real `git` CLI as the source of truth instead of adding a
  Go git compatibility layer
- keep `POST /git/status` as a non-repo-tolerant read that returns
  `isGitRepo=false`
- keep `POST /git/diff` as a repo-required read that returns a direct
  client error when the workspace is not a repo
- enable explicit rename detection in the Go diff owner so staged rename diffs
  remain visible when the caller supplies `oldPath`

### Slice 2: Commit graph and historical diff reads

Routes:

- `POST /git/log`
- `POST /git/commitDetails`
- `POST /git/commitFileDiff`

Deliverables:

- bounded log pagination and ref-selection support
- commit details projection
- historical file diff support with commit/path validation
- focused route and app coverage for invalid revisions, path errors, and
  capped outputs

Why this is second:

- it builds directly on the subprocess and validation boundary from Slice 1
- it is heavier on pagination, revision verification, and output shaping

## Verification Plan

Add focused tests in:

- `internal/gitread`
  - disposable temp-repo subprocess and parser coverage
- `internal/httpapi`
  - mode guards and typed error mapping
- `internal/app`
  - real handler wiring for the active git route surface

Frontend E2E remains a reference and later regression target, not the first
backend verification gate for this phase.

## Next Recommended Step

Implement Slice 2 now:

- own `POST /git/log`
- own `POST /git/commitDetails`
- own `POST /git/commitFileDiff`
- reuse the landed `internal/gitread` subprocess, timeout, and path-validation
  boundary instead of creating route-local history helpers

## Verification

- `./scripts/go.sh test ./internal/gitread ./internal/httpapi ./internal/app -run 'Test(Service|RegisterGitRoutes|AppServesGitStatusAndDiffRoutes)' -count=1`
