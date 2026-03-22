# Merge-Readiness Cleanup Checklist

Last updated: `2026-03-25`

Purpose: prepare the Go-backed branch for merge into `main` by making the
repo's contributor guidance stable, shrinking stale rewrite-only surfaces, and
deleting dead Python/code/test residue only when current callers and
replacement owners are proved.

Use this file as the execution tracker.
Use `go-rewrite-closeout-cleanup-plan.md` for the narrative plan and
`unused-python-deletion-plan.md` for deletion proof rules.

## Principles

- Present Setta as a Go-first codebase with a narrow retained Python
  package/SDK boundary.
- Prefer small, reviewable cleanup batches over one giant "cleanup" diff.
- Do not delete Python merely because it looks old; prove current caller
  reachability, replacement ownership, or explicit no-replacement first.
- Remove rewrite-only contributor clutter from the default path before pruning
  deep historical archives.
- Compare candidate deletions against `main` first. Do not delete top-level
  docs or repo workflow files that still exist on `main` unless the cleanup
  explicitly replaces them.

## Batch 1: Front-Door Docs And Ownership Story

- [x] Update `README.md` so the default docs entrypoints are stable
  contributor docs instead of rewrite trackers.
- [x] Fix branch-local absolute doc links in `README.md`.
- [x] Update `docs/README.md` to separate normal contributor docs from
  rewrite-closeout docs.
- [x] Make the Go-owned runtime / retained Python boundary explicit in
  `AGENTS.md`.
- [ ] Decide whether a permanent architecture/reference doc is needed once the
  merge is close.

Verification:

- `rg -n "Users/kevin/Documents/AppDevelopment/setta.go-rewrite" README.md docs/README.md AGENTS.md`
- `rg -n "CURRENT.md|go-rewrite-closeout-cleanup-plan|merge-readiness-cleanup-checklist" README.md docs/README.md docs/plans/go-backend-rewrite/README.md`

## Batch 2: Top-Level Branch-Only File Cleanup

- [x] Compare top-level markdown files against `main` before deleting them.
- [x] Keep `branch_intent.md`, `cumulative_review.md`, and `useful_prompts.md`
  because they still exist on `main` and are outside this cleanup scope.
- [x] Keep `CLAUDE.md` as a minimal pointer to `AGENTS.md`.
- [x] Re-check the repo-root markdown inventory after restoring the main-owned
  files.

Verification:

- `git diff --name-status main...HEAD -- branch_intent.md cumulative_review.md useful_prompts.md CLAUDE.md`

## Batch 3: High-Traffic Stale-Doc Sweep

- [x] Audit these docs first:
  - `docs/guides/dev-quickstart.md`
  - `docs/guides/dev-scripts.md`
  - `docs/reference/dev-vs-built.md`
  - `docs/reference/logging-and-error-handling.md`
  - `docs/reference/setta-cli-commands.md`
- [x] Triage each stale reference into:
  - rewrite to active Go owner/path
  - relabel as retained Python/package boundary
  - archive/delete if the behavior is gone
- [x] Use these search buckets as the initial audit set:
  - `backend/setta/routers`
  - `backend/setta/start.py`
  - `backend/setta/dev_start.py`
  - `backend/setta/server.py`
  - `FastAPI`
  - `uvicorn`
  - `Python backend`

Verification:

- `rg -n "backend/setta/(routers|start\\.py|dev_start\\.py|server\\.py)|FastAPI|uvicorn|Python backend" README.md docs backend tests scripts frontend -g '!frontend/node_modules/**' -g '!**/dist/**'`

## Batch 4: Retained Python Boundary Audit

- [x] Freeze the intentional keep-list from `CURRENT.md`.
- [x] Re-check imports rooted at:
  - `backend/setta/__main__.py`
  - `backend/setta/entrypoint.py`
  - `backend/setta/api/*`
  - `backend/setta/share/listener_runtime.py`
  - `backend/setta/mcp/tool_metadata.py`
- [x] Classify the remaining `backend/setta/**/*.py` tree into:
  - retained boundary
  - retained support module
  - explicit asset/process boundary
  - deletion candidate

Audit snapshot:

- 74 local Python modules are still reachable from the explicit retained
  boundary import closure.
- Keep outside that closure for non-deletion reasons:
  - explicit process boundaries:
    - `backend/setta/agentic/external_adapters/sidecars/claude_sdk_runner.py`
    - `backend/setta/share/deployment_listener_process.py`
  - dynamic/package support:
    - `backend/setta/logging/filters.py`
    - `backend/setta/sdk_contracts/__init__.py`
  - active repo tooling support:
    - `backend/setta/utils/format_code.py`
- Next deletion-review queue:
  - `backend/setta/code_gen/python/value_helpers.py`
  - `backend/setta/code_gen/value_mode.py`
  - `backend/setta/secrets/password_store.py`
  - `backend/setta/types/core.py`
  - `backend/setta/types/dropzone.py`
  - `backend/setta/types/generated/effective_impls.py`
  - `backend/setta/types/generated/impl_args_as_typed_dicts.py`
  - `backend/setta/types/generated/impl_field_literals.py`
  - `backend/setta/types/generated/shared_modifier.py`
  - `backend/setta/types/hierarchy_traversal.py`
  - `backend/setta/utils/errors.py`
  - `backend/setta/utils/utils.py`

Verification:

- `find backend/setta -name '*.py' | sort`
- `git ls-files 'backend/setta/**/*.py'`

## Batch 5: Dead Python And Test Deletion

- [ ] Delete bounded Python clusters only with a deletion ledger:
  - file set
  - classification
  - current caller evidence
  - replacement owner or no-replacement justification
  - proof tests
  - decision
- [x] First bounded deletion batch:
  - file set:
    - `backend/setta/utils/errors.py`
  - classification:
    - dead reference tail
  - current caller evidence:
    - no non-doc import/use hits for `setta.utils.errors`,
      `InvalidProjectName`, `InvalidSectionName`, or `InvalidParamName`
  - replacement owner:
    - active name-validation errors already live in Go under
      `internal/projectstate/*NameError`
  - proof tests:
    - existing Go name-validation and route tests under `internal/projectstate`
      and `internal/httpapi`
  - decision:
    - delete now
- [ ] Delete Python tests only when they either:
  - prove a dead path, or
  - have clear Go/frontend replacement coverage
- [ ] Keep tests that still prove the retained Python SDK, wheel boundary, or
  listener authoring/client surface.

Verification:

- `./scripts/run_go_tests.sh`
- `./scripts/run_backend_tests.sh`

## Batch 6: Script And Packaging Surface Verification

- [ ] Confirm docs and help text line up with the real supported entrypoints:
  - `./scripts/go.sh`
  - `./scripts/run-dev-instance.sh`
  - `frontend/backendStart.sh`
  - `./build.sh`
  - `./verify_install.sh`
  - `python -m setta`
- [ ] Correct stale help text or wrapper wording while touching each script.
- [ ] Keep the default dev story Go-first; keep Python activation scoped to
  retained SDK/package tooling and Python-specific workflows.

Verification:

- `./scripts/go.sh version`
- `./scripts/run-dev-instance.sh --help`
- `source activate.sh && python -m setta --help`
- `./build.sh`
- `./verify_install.sh`

## Batch 7: Rewrite Doc Rehoming And Archive Trim

- [ ] Remove rewrite docs from default contributor paths once the replacement
  guidance is stable.
- [ ] Keep the archive intact until there is a clear rule for what is still
  historically useful.
- [ ] Delete only obviously dead/empty rewrite-era docs after checking for
  references.
- [ ] Leave `archive/` as history, not as the main entrypoint.

Verification:

- `find docs/plans/go-backend-rewrite/archive -type f | wc -l`
- `rg -n "plans/go-backend-rewrite/archive" README.md docs`

## Final Merge Gate

- [ ] Front-door docs present the repo as Go-first with an explicit retained
  Python boundary.
- [ ] Top-level branch-only clutter is gone or explicitly justified.
- [ ] High-traffic docs no longer imply Python/FastAPI owns the active backend
  runtime.
- [ ] Remaining Python code is either retained intentionally or backed by a
  deletion-proof ledger.
- [ ] Packaging/install smoke still passes at the Go/Python package boundary.
