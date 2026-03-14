# Rewrite Working Set

Last verified: `2026-03-12`

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
  - stable rewrite rules, port-first guardrails, selected follow-ons, and
    reopening criteria
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
  - use a converter-style pipeline analogous to the existing
    Python-to-TypeScript generators, driven by explicit Go contract types and
    endpoint specs rather than handwritten TS emitters
  - keep the pipeline boundary-owned and fail-closed:
    prefer dedicated Go boundary DTOs plus converter rules, treat raw TS as
    temporary debt only, and require parity/typecheck verification beyond
    golden snapshots
  - the production generator now runs without raw-TS or `FactoryTS` escape
    hatches; future widening should use structured declarations, converter
    rules, or explicit Go boundary DTOs instead of reopening inline TS seams
  - sever frontend ties to Python-generated backend bindings rather than
    preserving a mixed-source transitional state
  - replace the canonical generated frontend contract files instead of keeping
    `generatedGo*` as a long-lived parallel track
  - if a runtime type does not convert cleanly, add a dedicated Go contract
    type or converter rule instead of hand-writing TS for that route
  - when only the canonical Go-owned route/type/endpoint outputs need
    regeneration, use `pnpm -C frontend generate-go-frontend-bindings`;
    reserve `pnpm generate` for the broader Python + frontend generation flow
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
- Treat `go-backend-rewrite-plan.md` as the source of truth for the
  port-first policy:
  preserve behavior and avoid broad redesign during the port by default, but
  do not defer correctness hazards or cheap behavior-preserving seam creation.
- Use `testing-strategy.md` for verification expectations.
- Use `archive/` only for historical rationale or implementation archaeology.
- Update `CURRENT.md` if the canonical doc list, selected follow-ons, or
  workflow guidance changes.
- Update the relevant checklists and supporting source-of-truth docs in the
  same change when ownership or caller reachability changes.
- Do not create another numbered phase doc unless a concrete issue or selected
  follow-on opens a bounded slice.
