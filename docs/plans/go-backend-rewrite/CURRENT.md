# Rewrite Working Set

Last verified: `2026-03-13`

Read this file first for active Go rewrite work.
Then read only the docs the task actually needs.

## Default Working Set

Read these for most implementation tasks:

- `caller-backed-backend-surface-checklist.md`
  - active caller reachability and transport cutover status
- `backend-capability-coverage-checklist.md`
  - runtime and service ownership
- `go-backend-rewrite-plan.md`
  - clean-break defaults and port-vs-redesign decisions
- `testing-strategy.md`
  - testing contract and coverage expectations

## Task-Specific Docs

Read these only when the task crosses that boundary:

- `go-dependency-inventory-and-rationale.md`
  - current `go.mod` choices and dependency rationale
- `docs/reference/dependencies/`
  - local upstream/library behavior notes
- `setta-listener-protocol-redesign-plan.md`
  - Python listener SDK and listener websocket boundary
- `go-frontend-binding-generation-plan.md`
  - Go-owned frontend route/type/endpoint generation
- `caller-backed-backend-surface-checklist-audit-plan.md`
  - only when editing the caller-backed checklist
- `backend-capability-coverage-checklist-audit-plan.md`
  - only when editing the ownership checklist
- `dependency-docs-local-reference.md`
  - rules for local dependency-reference notes
- `README.md`
  - folder map only

## Historical References

Use `archive/` only when the current docs and code are not enough:

- `archive/README.md`
  - folder guide for historical slice docs, older recommendations, and
    snapshots

## Reading Rules

- Start from the active caller, ownership bucket, and current code path. Do
  not bulk-read the whole folder.
- If a checklist is large, jump straight to the relevant subsystem or feature.
- Treat `archive/` as history, not live guidance.
- If docs disagree with current code or tests, trust the code/tests for actual
  behavior and update the docs.

## Task Router

- Caller reachability, route usage, websocket usage:
  `caller-backed-backend-surface-checklist.md`
- Runtime/service/package ownership:
  `backend-capability-coverage-checklist.md`
- Clean-break policy, port-vs-redesign, or "should this be a new slice?":
  `go-backend-rewrite-plan.md`
- Listener protocol or Python listener SDK questions:
  `setta-listener-protocol-redesign-plan.md`
- Frontend binding generation:
  `go-frontend-binding-generation-plan.md`
- Dependency or provider decisions:
  `go-dependency-inventory-and-rationale.md` plus
  `docs/reference/dependencies/`
- Testing expectations:
  `testing-strategy.md`

## Working Rules

- This is a clean break. Do not preserve backward compatibility, migrations,
  legacy route shapes, storage compatibility, or Python compatibility shims
  unless a live repo workflow explicitly requires them.
- Preserve capability and user-visible behavior, not Python implementation
  details.
- Preserve active product behavior and documented workflows, not Python-shaped
  architecture or dormant legacy surfaces.
- Default to a behavior-first, architecture-conservative port. Reopen redesign
  only when correctness, testability, or active caller coverage requires it.
- Prefer explicit typed boundaries, deterministic source-of-truth paths, and
  established libraries over heuristics or transitional glue.
- Do not widen scope unless a concrete caller, workflow, runtime issue, or
  documented product decision requires it.

## Task Loop

1. Inspect the touched Go code, tests, and transport/runtime path first.
   Read Python only when it is needed as behavior reference.
2. Map the request to the relevant caller-backed surface, ownership bucket,
   and any documented Python/shared/external boundary.
3. Summarize the relevant checklist rows, doc evidence, code paths, boundary
   implications, and the single highest-leverage next step.
4. Execute that step end-to-end unless the task is itself planning or
   inventory work.
5. Update the relevant source-of-truth docs in the same change when ownership,
   caller reachability, dependency decisions, or workflow guidance changed.

## Update Rules

- Update `CURRENT.md` only when the doc map, clean-break defaults, or rewrite
  workflow guidance changes.
- Update the relevant checklist in the same change when caller reachability or
  ownership changes.
- Read the matching audit-plan doc before editing either checklist.
- Do not create another numbered phase doc unless a concrete issue or task
  opens a bounded rewrite slice.
