# Go Rewrite Cleanup Docs

This folder holds merge-tracking, parity, and cleanup docs for the Go backend
branch. For normal contributor docs, start at `docs/README.md`.
Start here only when you are doing merge cleanup, parity proof, or Python
package boundary work.

## Active Tracker Docs

- `CURRENT.md`
  - entrypoint, read order, Python package boundaries, task loop
- `merge-readiness-cleanup-checklist.md`
  - concrete execution checklist for merge-prep cleanup batches
- `go-rewrite-closeout-cleanup-plan.md`
  - repo/docs/script cleanup plan
- `unused-python-deletion-plan.md`
  - stepwise evidence-gated plan for deleting superseded Python code and tests

## Active Parity Docs

- `backend-behavior-parity-matrix-plan.md`
  - plan for building a behavior-level parity matrix against `main`
- `backend-behavior-parity-matrix.md`
  - current behavior-level parity ledger and gap list
- `caller-backed-backend-surface-checklist.md`
  - whether current callers already hit the backend transport/runtime
- `backend-capability-coverage-checklist.md`
  - where runtime/service ownership lives overall
- `go-backend-rewrite-plan.md`
  - clean-break defaults and port-vs-redesign decisions
- `testing-strategy.md`
  - rewrite testing contract and coverage expectations

## Supporting Reference Docs

- `setta-listener-protocol-redesign-plan.md`
  - Python listener SDK boundary and listener websocket ownership
- `go-backed-python-sdk-plan.md`
  - Python SDK architecture, local-core boundaries, and local execution plan
- `go-backed-python-sdk-surface-inventory.md`
  - phase-0 Python SDK surface matrix and immediate blocker verdict
- `go-frontend-binding-generation-plan.md`
  - frontend route/type/endpoint generation
- `go-dependency-inventory-and-rationale.md`
  - current `go.mod` choices and dependency rationale
- `dependency-docs-local-reference.md`
  - how to gather and maintain local dependency notes
- `docs/reference/dependencies/`
  - repo-local upstream/library references

## Maintenance Docs

- `caller-backed-backend-surface-checklist-audit-plan.md`
  - how to update the caller-backed checklist
- `backend-capability-coverage-checklist-audit-plan.md`
  - how to update the ownership checklist

## History

- `archive/README.md`
  - historical slice docs and older planning snapshots
  - use this for phase-by-phase history, not as the default contributor entrypoint

## Go Toolchain

- Run Go commands with `./scripts/go.sh <args>`.
- Resolve the pinned SDK root with `./scripts/go.sh env GOROOT`.
- If `gofmt` is not on `PATH`:
  - `GOROOT="$(./scripts/go.sh env GOROOT)"`
  - `"$GOROOT/bin/gofmt" -w <files>`
- If the wrapper cannot find the SDK, install the repo-local toolchain with
  `./scripts/install_go_toolchain.sh`.
