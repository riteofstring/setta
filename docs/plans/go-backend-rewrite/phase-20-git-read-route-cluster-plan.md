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
- there is no landed Go git-read owner yet
- the git read cluster is now the next caller-backed direct-frontend phase

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

- a dedicated Go git-read owner above subprocess execution
- typed repo-root, revision, and path validation helpers outside route code
- explicit stdout/stderr cap and timeout ownership on the Go side

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

Implement Slice 1 now:

- add `internal/gitread`
- own `POST /git/status`
- own `POST /git/diff`
- keep transport thin and keep the real `git` CLI as the source of truth
