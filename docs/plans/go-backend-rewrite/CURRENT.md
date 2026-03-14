# Rewrite Working Set

Last verified: `2026-03-13`

Use this as the entrypoint for active Go rewrite work.
Read this file first. Then open only the docs the task actually needs.

## Read First

- `caller-backed-backend-surface-checklist.md`
  - active caller reachability
- `backend-capability-coverage-checklist.md`
  - runtime/service ownership
- `go-backend-rewrite-plan.md`
  - clean-break rules and port-vs-redesign decisions
- `testing-strategy.md`
  - testing contract and coverage expectations

## Read Only When Needed

- `README.md`
  - folder map only
- `caller-backed-backend-surface-checklist-audit-plan.md`
  - only when editing the caller-backed checklist
- `backend-capability-coverage-checklist-audit-plan.md`
  - only when editing the ownership checklist
- `setta-listener-protocol-redesign-plan.md`
  - listener protocol or Python listener SDK boundary
- `go-frontend-binding-generation-plan.md`
  - Go-owned frontend route/type generation
- `go-dependency-inventory-and-rationale.md`
  - current `go.mod` decisions and dependency rationale
- `docs/reference/dependencies/`
  - upstream/library behavior notes
- `go-backend-rewrite-stack-recommendations.md`
  - older design guidance; not the primary source of truth
- `dependency-docs-local-reference.md`
  - dependency-doc acquisition/storage rules
- `pyproject-dependency-replacement-snapshot.md`
  - point-in-time Python dependency classification
- `archive/README.md`
  - historical phase docs and spikes

## How To Read

- Treat the non-archive top-level docs as the current doc source of truth.
- Treat `archive/` as cold history. Use it only for rationale the current docs
  no longer summarize.
- If current planning text and current code or tests disagree, trust the code
  and tests for current behavior and update the docs.
- If a checklist is large, jump to the relevant subsystem or feature instead of
  reading the whole table by default.
- Start from the active caller, ownership bucket, and current code path. Do not
  bulk-read the whole folder.

## Task Router

- Active caller reachability, route usage, websocket usage:
  `caller-backed-backend-surface-checklist.md`
- Runtime or service ownership, including Go/Python/shared boundaries:
  `backend-capability-coverage-checklist.md`
- Clean-break policy, port-vs-redesign, or "should this become a new slice?":
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

## Working Rules

- This is a clean break. Do not preserve backward compatibility, migrations,
  legacy route shapes, storage migrations, or Python compatibility shims
  unless a live repo workflow explicitly requires them.
- Preserve capability and user-visible behavior, not Python implementation
  details.
- Preserve active product behavior and documented workflows, not Python-shaped
  architecture or unused legacy surfaces.
- Prefer a behavior-first, architecture-conservative port. Reopen redesign
  only when correctness, testability, or active caller coverage requires it.
- Prefer explicit typed boundaries and deterministic source-of-truth pathways
  over heuristics.

## Expected Task Loop

1. Inspect the touched Go code, tests, and current repo state.
2. Map the request to the relevant caller-backed surface, ownership bucket,
   and any documented Python/shared/external boundary.
3. Summarize the relevant checklist rows, doc evidence, code paths, and the
   single highest-leverage next step.
4. Execute that step end-to-end unless the task is itself planning or
   inventory work.
5. Update the relevant source-of-truth docs in the same change when ownership,
   reachability, dependency decisions, or workflow guidance changed.

## Update Rules

- Update `CURRENT.md` only when the canonical doc map, clean-break defaults, or
  workflow guidance changes.
- Update the relevant checklist and supporting source-of-truth docs in the
  same change when ownership or caller reachability changes.
- Read the checklist audit-plan docs when you need to edit those checklists
  accurately.
- Do not create another numbered phase doc unless a concrete issue or task
  opens a bounded rewrite slice.
