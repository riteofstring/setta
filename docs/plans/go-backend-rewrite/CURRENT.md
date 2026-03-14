# Rewrite Working Set

Last verified: `2026-03-13`

## Canonical Docs

- `caller-backed-backend-surface-checklist.md`
  - fastest answer to "does the active caller reach Go?"
- `backend-capability-coverage-checklist.md`
  - broader backend runtime/service ownership coverage
- `backend-capability-coverage-checklist-audit-plan.md`
  - maintenance rules for keeping the broader ownership checklist accurate
- `caller-backed-backend-surface-checklist-audit-plan.md`
  - maintenance rules for keeping the caller-backed checklist current-caller-accurate
- `go-backend-rewrite-plan.md`
  - stable rewrite rules, clean-break guardrails, and reopening criteria
- `go-frontend-binding-generation-plan.md`
  - subsystem-specific doc for Go-owned frontend binding generation; read it
    when a task touches frontend binding generation
- `testing-strategy.md`
  - test expectations for rewrite work
- `go-dependency-inventory-and-rationale.md`
  - current `go.mod` explanation and dependency decisions
- `docs/reference/dependencies/`
  - local dependency reference notes and upstream doc snapshots used during
    rewrite work
- `archive/README.md`
  - historical phase docs, reranks, closeouts, and spikes

## Clean-Break Defaults

- This doc set is for the entire Go rewrite, not a standing priority list for
  one narrow subsystem.
- Start from the task's caller-backed surface, ownership bucket, and current
  code paths; pull in subsystem docs only when the task actually touches them.
- No backward compatibility, migrations, legacy route preservation, storage
  migrations, or Python compatibility shims are required.
- There are no deployed users and no production compatibility contract, so
  prefer the clean Go-owned surface over transitional compatibility work.
- Preserve active product behavior and documented workflows, but do not
  preserve Python-shaped architecture just because it existed.
- `go-frontend-binding-generation-plan.md`, dependency docs, and provider docs
  are supporting references when their boundaries matter, not default
  repo-wide priorities.

## Agent Workflow

- Start with `caller-backed-backend-surface-checklist.md` for active-caller
  transport questions.
- Use `backend-capability-coverage-checklist.md` for broader backend ownership
  questions that go beyond current caller transport reachability.
- Use `go-backend-rewrite-plan.md` for rewrite rules, clean-break policy, and
  reopening criteria.
- Treat `go-backend-rewrite-plan.md` as the source of truth for the
  port-first policy:
  preserve product behavior and avoid broad redesign during the port by
  default, but do not spend effort on compatibility work or defer correctness
  hazards and cheap behavior-preserving seam creation.
- Read subsystem-specific docs only when the task actually touches that
  subsystem.
- Use `testing-strategy.md` for verification expectations.
- Use `archive/` only for historical rationale or implementation archaeology.
- Update `CURRENT.md` if the canonical doc list, clean-break defaults, or
  workflow guidance changes.
- Update the relevant checklists and supporting source-of-truth docs in the
  same change when ownership or caller reachability changes.
- Do not create another numbered phase doc unless a concrete issue or task
  opens a bounded slice.
