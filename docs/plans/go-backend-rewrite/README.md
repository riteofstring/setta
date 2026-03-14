# Go Rewrite Docs

This folder is the active working set for the Go backend rewrite.
If you are starting a rewrite task, read `CURRENT.md` first.
Use this README as the folder router, not as the default first deep read.

## Default Read Path

1. `CURRENT.md`
   - entrypoint; task loop, clean-break defaults, and update rules
2. The checklist that matches the task
   - `caller-backed-backend-surface-checklist.md` for "does the active caller
     hit Go?"
   - `backend-capability-coverage-checklist.md` for "where does ownership
     live?"
3. `go-backend-rewrite-plan.md`
   - decision order, port-first guardrails, and reopening criteria
4. `testing-strategy.md`
   - read when changing code, behavior, or verification

## Read Only When Needed

- `caller-backed-backend-surface-checklist-audit-plan.md`
  - rules for maintaining the caller-backed checklist
- `backend-capability-coverage-checklist-audit-plan.md`
  - rules for maintaining the ownership checklist
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
- `archive/README.md`
  - historical phase docs and spikes; use only for rationale or archaeology

## Quick Router

- Active caller reachability, route usage, websocket usage:
  `caller-backed-backend-surface-checklist.md`
- Runtime or service ownership, including Go/Python/shared boundaries:
  `backend-capability-coverage-checklist.md`
- Clean-break policy, port-vs-redesign, or "should this open a new slice?":
  `go-backend-rewrite-plan.md`
- Listener protocol or Python listener SDK questions:
  `setta-listener-protocol-redesign-plan.md`
- Go-owned frontend binding generation:
  `go-frontend-binding-generation-plan.md`
- Dependency or provider decisions:
  `go-dependency-inventory-and-rationale.md` plus
  `docs/reference/dependencies/`
- Testing expectations:
  `testing-strategy.md`
- Historical rationale:
  `archive/`

## Maintenance Rules

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
