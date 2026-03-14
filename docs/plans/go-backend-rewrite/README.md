# Go Rewrite Docs

This folder is the active working set for the Go backend rewrite.
Start with `CURRENT.md`.
Use this README only as the folder map.

## Core Docs

- `CURRENT.md`
  - entrypoint, task loop, and update rules
- `caller-backed-backend-surface-checklist.md`
  - active caller reachability
- `backend-capability-coverage-checklist.md`
  - runtime/service ownership
- `go-backend-rewrite-plan.md`
  - clean-break rules and port-vs-redesign decisions
- `testing-strategy.md`
  - testing contract and coverage expectations

## Boundary Docs

- `setta-listener-protocol-redesign-plan.md`
  - listener protocol or Python `SettaListener` SDK boundary
- `go-frontend-binding-generation-plan.md`
  - Go-owned frontend route/type generation
- `go-dependency-inventory-and-rationale.md`
  - dependency choices and `go.mod` rationale
- `docs/reference/dependencies/`
  - upstream dependency behavior and local reference notes
- `go-backend-rewrite-stack-recommendations.md`
  - older design guidance; not the primary source of truth
- `dependency-docs-local-reference.md`
  - dependency-doc acquisition/storage rules
- `pyproject-dependency-replacement-snapshot.md`
  - point-in-time Python dependency classification

## Maintenance Docs

- `caller-backed-backend-surface-checklist-audit-plan.md`
  - rules for maintaining the caller-backed checklist
- `backend-capability-coverage-checklist-audit-plan.md`
  - rules for maintaining the ownership checklist

## History

- `archive/README.md`
  - historical slice docs and spikes; use only for rationale or archaeology

## Working Rules

- Do not bulk-read every top-level rewrite doc by default.
- Start with `CURRENT.md`, not `archive/`.
- Update the relevant checklist in the same change when caller reachability or
  runtime ownership changes.
- Read the audit-plan docs only when you are editing those checklists.
- Update `CURRENT.md` only when the doc map, default workflow, or selected
  follow-on guidance changes.
- Use `archive/` only when a current doc points there or when you need
  historical rationale.

## Clean-Break Reminder

- There is no deployed-user compatibility contract for this rewrite.
- Do not preserve backward compatibility, legacy route shapes, migrations, or
  Python-shaped architecture unless a live repo workflow explicitly requires
  it.
- Preserve active product behavior and documented workflows, not legacy
  implementation shape.

## Go Toolchain Shortcut

- Run Go commands with `./scripts/go.sh <args>`.
- Resolve the pinned SDK root with `./scripts/go.sh env GOROOT`.
- If `gofmt` is not on `PATH`:
  - `GOROOT="$(./scripts/go.sh env GOROOT)"`
  - `"$GOROOT/bin/gofmt" -w <files>`
- If the wrapper cannot find the SDK, install the repo-local toolchain with
  `./scripts/install_go_toolchain.sh`.
