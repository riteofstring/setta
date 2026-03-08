# Rewrite Working Set

Last verified: `2026-03-10`

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
  - stable rewrite rules, selected follow-ons, and reopening criteria
- `go-frontend-binding-generation-plan.md`
  - working slice doc for the selected Go-owned frontend binding generation
    follow-on
- `testing-strategy.md`
  - test expectations for rewrite work
- `go-dependency-inventory-and-rationale.md`
  - current `go.mod` explanation and dependency decisions
- `docs/reference/dependencies/`
  - local dependency reference notes and upstream doc snapshots used during
    rewrite work
- `archive/README.md`
  - historical phase docs, reranks, closeouts, and spikes

## Selected Follow-On Work

- Go-owned frontend binding generation for Go HTTP/websocket contracts
  - give frontend-facing backend contracts a Go-owned source of truth wherever
    transport/runtime ownership is Go
  - keep generated contract surfaces deliberate and explicit
  - schema reflection from arbitrary Go structs should remain a tool, not the
    default contract owner
  - current slice doc: `go-frontend-binding-generation-plan.md`
- Converge Go-owned OpenAI API interactions on `github.com/openai/openai-go/v3`
  - apply this at the provider edge for managed chat, transcription, realtime,
    and later Go-owned OpenAI provider surfaces
  - keep SDK usage behind internal adapters so frontend/runtime contracts stay
    repo-owned rather than SDK-owned
  - if a required OpenAI surface is missing or awkward in the SDK, treat that
    as an explicit planning decision rather than silently widening bespoke
    transport code

## Agent Workflow

- Start with `caller-backed-backend-surface-checklist.md` for active-caller
  transport questions.
- Use `backend-capability-coverage-checklist.md` for broader backend ownership
  questions that go beyond current caller transport reachability.
- Use `go-backend-rewrite-plan.md` for rewrite rules and reopening criteria.
- Use `testing-strategy.md` for verification expectations.
- Use `archive/` only for historical rationale or implementation archaeology.
- Update `CURRENT.md` if the canonical doc list, selected follow-ons, or
  workflow guidance changes.
- Update the relevant checklists and supporting source-of-truth docs in the
  same change when ownership or caller reachability changes.
- Do not create another numbered phase doc unless a concrete issue or selected
  follow-on opens a bounded slice.
