# Go Rewrite Docs

This folder is the live doc set for the Go backend rewrite.
Start with `CURRENT.md`.
Use this file only as the folder map.

## Core Docs

- `CURRENT.md`
  - entrypoint, read order, retained Python boundaries, task loop
- `go-rewrite-closeout-cleanup-plan.md`
  - repo/docs/script cleanup plan now that the active backend runtime is Go
    owned and the retained Python boundary is explicit
- `unused-python-deletion-plan.md`
  - stepwise evidence-gated plan for deleting superseded Python code and tests
- `backend-behavior-parity-matrix-plan.md`
  - plan for building a behavior-level parity matrix against `main`
- `backend-behavior-parity-matrix.md`
  - current behavior-level parity ledger and gap list
- `caller-backed-backend-surface-checklist.md`
  - whether current callers already hit Go-owned transport/runtime
- `backend-capability-coverage-checklist.md`
  - where runtime/service ownership lives overall
- `go-backend-rewrite-plan.md`
  - clean-break defaults and port-vs-redesign decisions
- `testing-strategy.md`
  - rewrite testing contract and coverage expectations

## Slice Docs

- `setta-listener-protocol-redesign-plan.md`
  - Python listener SDK boundary and listener websocket ownership
- `go-backed-python-sdk-plan.md`
  - retained Python SDK architecture, local-core boundaries, and
    Go-backed local execution plan
- `go-backed-python-sdk-surface-inventory.md`
  - phase-0 retained Python SDK surface matrix and immediate blocker verdict
- `go-frontend-binding-generation-plan.md`
  - Go-owned frontend route/type/endpoint generation
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

## Go Toolchain

- Run Go commands with `./scripts/go.sh <args>`.
- Resolve the pinned SDK root with `./scripts/go.sh env GOROOT`.
- If `gofmt` is not on `PATH`:
  - `GOROOT="$(./scripts/go.sh env GOROOT)"`
  - `"$GOROOT/bin/gofmt" -w <files>`
- If the wrapper cannot find the SDK, install the repo-local toolchain with
  `./scripts/install_go_toolchain.sh`.
