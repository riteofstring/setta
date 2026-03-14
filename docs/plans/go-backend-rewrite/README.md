# Go Rewrite Docs

This folder is the active doc set for the Go backend rewrite.
Start with `CURRENT.md`.
Use this file only as the folder map.

Rules and workflow live in `CURRENT.md`, not here.

## Core Docs

- `CURRENT.md`
  - entrypoint, task loop, update rules
- `caller-backed-backend-surface-checklist.md`
  - active caller reachability
- `backend-capability-coverage-checklist.md`
  - runtime/service ownership
- `go-backend-rewrite-plan.md`
  - clean-break defaults and port-vs-redesign decisions
- `testing-strategy.md`
  - testing contract and coverage expectations

## Slice Docs

- `setta-listener-protocol-redesign-plan.md`
  - listener protocol and Python `SettaListener` boundary
- `go-frontend-binding-generation-plan.md`
  - Go-owned frontend route/type/endpoint generation
- `go-dependency-inventory-and-rationale.md`
  - current dependency choices and `go.mod` rationale
- `docs/reference/dependencies/`
  - local upstream/library notes
- `dependency-docs-local-reference.md`
  - how to gather and maintain local dependency-reference notes

## Maintenance Docs

- `caller-backed-backend-surface-checklist-audit-plan.md`
  - how to maintain the caller-backed checklist
- `backend-capability-coverage-checklist-audit-plan.md`
  - how to maintain the ownership checklist

## History

- `archive/README.md`
  - historical slice docs, earlier recommendations, and snapshots

## Go Toolchain

- Run Go commands with `./scripts/go.sh <args>`.
- Resolve the pinned SDK root with `./scripts/go.sh env GOROOT`.
- If `gofmt` is not on `PATH`:
  - `GOROOT="$(./scripts/go.sh env GOROOT)"`
  - `"$GOROOT/bin/gofmt" -w <files>`
- If the wrapper cannot find the SDK, install the repo-local toolchain with
  `./scripts/install_go_toolchain.sh`.
