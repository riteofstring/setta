# Merge-Readiness Cleanup Plan

Last updated: `2026-03-25`

Purpose: prepare this branch for merge by getting the repo into a state where
Go is simply the backend runtime, Python is only the intentionally retained
package/SDK surface, and the docs no longer talk as if the backend "used to be
Python."

Use this file as a temporary tracker. The likely end state is that
`docs/plans/go-backend-rewrite/` is removed, including this file, once any
still-useful content has been rehomed.

## Target State

- Contributor-facing docs assume the backend is Go-owned under `cmd/` and
  `internal/`.
- Python is documented only where it is still true today:
  - packaged entrypoint/wheel boundary
  - source Python SDK/listener authoring surface
  - narrow build/test/tooling workflows that really require Python
- Docs do not explain the repo in migration terms.
- Branch-only rewrite planning docs are gone.
- Branch-only dependency doc dumps are gone unless a tiny, explicit subset is
  proved useful for current contributor work.
- Unrelated docs that still belong on `main` remain unless there is a separate,
  non-rewrite reason to delete them.

## Current Baseline

- `docs/plans/go-backend-rewrite/` currently contains 260 files and is
  branch-only relative to `main`.
- `docs/reference/dependencies/` currently contains 63 files and is
  branch-only relative to `main`.
- `backend/setta/**/*.py` currently contains 86 Python files.
- Some top-level docs such as `useful_prompts.md`, `branch_intent.md`, and
  `cumulative_review.md` still exist on `main`; cleanup should not delete them
  just because they are unrelated to the Go migration.

## Rules

- Compare against `main` before deleting any doc outside obviously branch-only
  rewrite surfaces.
- Treat `docs/plans/go-backend-rewrite/` as delete-first, not preserve-first.
  Only extract present-day operational content that still matters.
- Treat `docs/reference/dependencies/` as delete-first, not archive-first.
  Keep something there only if a live doc or workflow still needs it.
- Remove rewrite framing rather than relabeling it. The default docs should not
  read like merge-prep notes.
- Keep the retained Python surface explicit, but do not describe it as the
  backend.
- Allow limited legacy references only when they are truly current:
  - negative tests/assertions
  - logger names or compatibility labels
  - explicit comparisons against `main` while cleanup is still in progress

## Workstream 1: Freeze The Keep/Delete Matrix

Goal: establish the delete policy before touching large doc trees.

- [x] Diff doc surfaces against `main` and classify each bucket:
  - exists on `main`, unrelated to rewrite cleanup
  - branch-only rewrite planning/history
  - branch-only active product doc
  - branch-only dependency dump
- [x] Record an explicit keep-list for non-rewrite docs that still exist on
  `main`.
- [x] Record an explicit delete-first list for:
  - `docs/plans/go-backend-rewrite/`
  - `docs/reference/dependencies/`
- [x] Record any content that must be extracted before deletion because it is
  still genuinely useful in a normal post-merge repo.

Frozen matrix:

- Keep by default because they still exist on `main` and are not rewrite-only:
  - `useful_prompts.md`
  - `branch_intent.md`
  - `cumulative_review.md`
  - `CLAUDE.md`
- Keep and continue editing as normal current-state docs:
  - `README.md`
  - `AGENTS.md`
  - `docs/README.md`
  - normal guides/reference docs under `docs/guides/` and `docs/reference/`
- Delete-first branch-only rewrite tree:
  - `docs/plans/go-backend-rewrite/` (`260` files, all branch-only vs `main`)
  - external callers that must be removed or deleted with it:
    - `scripts/backend_gap_hunt_candidates.py`
    - `scripts/prompts/backend-behavior-gap-hunt.txt`
    - `scripts/prompts/backend-behavior-gap-hunt-followup.txt`
    - `scripts/prompts/backend-behavior-parity-matrix-gap-check.txt`
    - `scripts/prompts/backend-behavior-parity-matrix-gap-check-followup.txt`
- Delete-first branch-only dependency dump:
  - `docs/reference/dependencies/` (`63` files, all branch-only vs `main`)
  - no non-rewrite external callers were found; current references are inside
    the rewrite-doc tree itself
- Extract-before-delete candidates:
  - none proved yet from `docs/reference/dependencies/`
  - none proved yet from `docs/plans/go-backend-rewrite/` beyond short
    current-state wording that can be folded into `README.md`, `AGENTS.md`, or
    `docs/README.md` if still needed
- Branch-only but not automatically preserved just because they are docs:
  - `docs/notes/chatgpt-go-backed-python.md`
  - `scripts/backend_gap_hunt_candidates.py`
  - `scripts/prompts/backend-behavior-*`
  - `scripts/prompts/backend-behavior-parity-*`
  - treat these as likely cleanup companions to the rewrite-doc deletion, not
    as long-term repo fixtures

Verification:

- `git diff --name-status main...HEAD -- README.md AGENTS.md CLAUDE.md docs useful_prompts.md branch_intent.md cumulative_review.md`
- `git diff --name-status main...HEAD -- docs/plans/go-backend-rewrite docs/reference/dependencies`

## Workstream 2: Front-Door Docs Must Read Like A Normal Go Repo

Goal: the repo landing path should present the current architecture without any
rewrite framing.

- [ ] Re-audit `README.md`, `docs/README.md`, `AGENTS.md`, and `CLAUDE.md` as a
  single set.
- [x] Remove links that send normal contributors into
  `docs/plans/go-backend-rewrite/`.
- [ ] Remove wording that explains the backend in migration terms.
- [ ] Keep only current-state ownership statements:
  - Go runtime/CLI/server ownership
  - retained Python package/SDK boundary
  - frontend/generated binding ownership
- [ ] Re-check high-traffic guides/reference docs so they also read as
  current-state docs, not rewrite notes.

Verification:

- `rg -n "go-backend-rewrite|rewrite closeout|Python backend|FastAPI|backend/setta/(routers|start\\.py|dev_start\\.py|server\\.py)" README.md AGENTS.md CLAUDE.md docs/README.md docs/guides docs/reference`

## Workstream 3: Script, Packaging, And Help Surfaces

Goal: commands and help text should match the Go-first runtime story.

- [ ] Audit the supported entrypoints together:
  - `./scripts/go.sh`
  - `./scripts/run-dev-instance.sh`
  - `frontend/backendStart.sh`
  - `./build.sh`
  - `./verify_install.sh`
  - `python -m setta`
- [ ] Make the default source/dev loop consistently Go-first.
- [ ] Keep Python activation guidance only where it is still correct:
  - retained Python tooling
  - packaging flows
  - Python/package tests
- [ ] Remove stale help text that still implies removed Python startup paths or
  router ownership.

Verification:

- `./scripts/go.sh version`
- `./scripts/run-dev-instance.sh --help`
- `source activate.sh && python -m setta --help`
- `./build.sh`
- `./verify_install.sh`

## Workstream 4: Delete `docs/plans/go-backend-rewrite/`

Goal: remove rewrite-plan sprawl from the repo instead of carrying it forward
as history.

- [ ] Inventory which files in `docs/plans/go-backend-rewrite/` still contain
  present-day value.
- [ ] For any still-useful content, extract only the durable parts into neutral
  docs outside this folder.
- [ ] Delete rewrite-only planning/history docs rather than archiving them in
  place.
- [ ] Delete the folder entrypoints and trackers once their useful content has
  been moved or dropped:
  - `CURRENT.md`
  - `README.md`
  - `merge-readiness-cleanup-checklist.md`
  - all remaining rewrite plans/checklists/matrices
- [ ] Remove inbound references from normal docs, scripts, or contributor
  guidance.

Verification:

- `git diff --name-status main...HEAD -- docs/plans/go-backend-rewrite`
- `rg -n "go-backend-rewrite|CURRENT.md|merge-readiness-cleanup-checklist|go-rewrite-closeout-cleanup-plan" README.md AGENTS.md CLAUDE.md docs scripts`

## Workstream 5: Delete `docs/reference/dependencies/`

Goal: remove the large dependency-document dump unless a very small subset is
proved necessary.

- [ ] Find all inbound references to `docs/reference/dependencies/`.
- [ ] Classify each referenced file as:
  - actively needed right now
  - only referenced by rewrite docs
  - dead
- [ ] Delete the whole tree if nothing live needs it.
- [ ] If a tiny subset is still useful, move or compress that content into a
  much smaller neutral home instead of keeping the full dump tree.
- [ ] Remove any scripts or maintenance expectations that imply this tree is a
  normal permanent part of the repo.

Verification:

- `rg -n "docs/reference/dependencies" README.md AGENTS.md docs scripts`
- `git diff --name-status main...HEAD -- docs/reference/dependencies`

## Workstream 6: Re-Audit The Retained Python Surface

Goal: keep only the Python that still has a real current owner story.

- [ ] Re-freeze the intentional keep-list from current code:
  - `backend/setta/__main__.py`
  - `backend/setta/entrypoint.py`
  - `backend/setta/api/*`
  - `backend/setta/share/listener_runtime.py`
  - `backend/setta/mcp/tool_metadata.py`
  - wheel/package hooks in `pyproject.toml`
- [ ] Classify every remaining Python file into:
  - retained package boundary
  - retained support module
  - generated/type support
  - packaging/build support
  - explicit process/sidecar boundary
  - deletion candidate
- [ ] Rewrite docs that still call this surface "the backend" so they describe
  it as package/SDK/tooling ownership instead.
- [ ] Build the next deletion queue from ambiguous survivors.

Verification:

- `find backend/setta -name '*.py' | sort`
- `git ls-files 'backend/setta/**/*.py'`
- `rg -n "from setta|import setta|backend/setta" tests backend/setta pyproject.toml scripts docs`

## Workstream 7: Delete Residual Dead Python And Superseded Tests

Goal: remove dead code in bounded batches after the documentation reset makes
the intended Python boundary clear.

- [ ] Build deletion batches around clusters, not one-off files, when the
  evidence supports it.
- [ ] For each batch, record:
  - file set
  - classification
  - current caller evidence
  - replacement owner or no-replacement justification
  - proof tests
  - decision
- [ ] Delete Python tests only when they prove a dead path or are clearly
  replaced by Go/frontend coverage for the surviving behavior.
- [ ] Keep tests that still prove the retained Python package/SDK boundary.
- [ ] Re-run the full backend pytest suite after each material deletion batch.

Verification:

- `./scripts/run_go_tests.sh`
- `source activate.sh && ./scripts/run_backend_tests.sh`

## Workstream 8: Search-Driven Zero-History Sweep

Goal: eliminate mentions that depend on the repo being understood as a
Python-to-Go migration.

- [ ] Sweep for migration/history language in active docs and plans:
  - `go-backend-rewrite`
  - `Go rewrite`
  - `rewrite closeout`
  - `Python backend`
  - `FastAPI`
  - `backend/setta/routers`
  - `backend/setta/start.py`
  - `backend/setta/dev_start.py`
  - `backend/setta/server.py`
  - `uvicorn`
- [ ] For each hit, classify it as:
  - delete/fix now
  - acceptable current Python package reference
  - acceptable test/negative assertion
  - temporary cleanup-only reference that must disappear before merge
- [ ] Continue until contributor-facing docs and normal plan/reference paths no
  longer require any migration context to understand the repo.

Known likely-allowed hits while cleanup is still in progress:

- logger/test references to legacy logger names
- negative packaging assertions
- this temporary tracker and any other temporary cleanup-only notes

Verification:

- `rg -n "go-backend-rewrite|Go rewrite|rewrite closeout|Python backend|FastAPI|backend/setta/(routers|start\\.py|dev_start\\.py|server\\.py)|uvicorn" README.md AGENTS.md CLAUDE.md docs backend/setta tests scripts frontend -g '!frontend/node_modules/**' -g '!**/dist/**'`

## Final Merge Gate

- [ ] Non-rewrite docs that still belong on `main` have been kept unless there
  was a separate reason to remove them.
- [ ] `docs/plans/go-backend-rewrite/` has been deleted.
- [ ] `docs/reference/dependencies/` has been deleted or reduced to a tiny,
  clearly justified replacement.
- [ ] Contributor-facing docs assume Go backend ownership without explaining
  prior Python ownership.
- [ ] Remaining Python files all have a clear current owner story.
- [ ] Remaining legacy-reference search hits are limited to intentional tests,
  compatibility names, or narrow retained Python package docs.
- [ ] Packaging/install smoke still passes at the Go/Python boundary.
- [ ] Go tests pass.
- [ ] Python/package tests pass.

## Suggested Execution Order

1. Freeze the keep/delete matrix against `main`.
2. Fix front-door docs and command/help surfaces.
3. Extract any real keeper content, then delete `docs/plans/go-backend-rewrite/`.
4. Delete `docs/reference/dependencies/` unless a tiny subset survives review.
5. Re-audit the retained Python tree and land the next deletion batches.
6. Run the zero-history search sweep.
7. End with packaging/install smoke plus full Go and Python test passes.
