# Go Backend Rewrite Plan

## Goal

Rewrite the backend from Python to Go as a clean break in runtime ownership
without bundling that work into a broad architecture redesign.

Default approach:

- preserve active product behavior for the current caller
- move runtime ownership to Go
- keep the port behavior-first and architecture-conservative until the Go
  runtime is proven by tests and live workflows

There is no deployed-user compatibility contract for the Python backend.
Do not preserve backward compatibility, legacy route shapes, migrations, or
Python transition layers unless a current repo workflow explicitly requires a
bounded exception.

## Source Of Truth

Start with `CURRENT.md`, then read only the docs the task actually needs.

Default working docs:

- `CURRENT.md`
- `caller-backed-backend-surface-checklist.md`
- `backend-capability-coverage-checklist.md`
- `testing-strategy.md`

Conditional docs:

- `go-dependency-inventory-and-rationale.md`
- `docs/reference/dependencies/`
- `setta-listener-protocol-redesign-plan.md`
- `go-frontend-binding-generation-plan.md`

Use `README.md` only for the folder map.
Use `archive/` only for historical rationale.

## Decision Order

When the right move is unclear, decide in this order:

1. Preserve active product behavior for the current caller.
2. Prefer clean Go ownership over Python compatibility or mixed-source
   transitional work.
3. Avoid broad redesign during the port unless correctness, testability, or
   active caller coverage requires it.
4. Prefer explicit typed boundaries and deterministic source-of-truth pathways
   over incidental Python behavior or heuristics.

## Rewrite Rules

- Treat the Python code, tests, and docs as reference material for behavior
  and edge cases, not as a compatibility contract.
- Preserve product behavior first, unless a caller, release path, or
  documented product decision requires a behavior change.
- Do not combine the language rewrite with broad architecture cleanup by
  default. Land the Go-owned runtime first; reopen cleanup as a separate slice.
- The rewrite does not need to keep a partially mixed Go/Python backend
  working at every intermediate step.
- Prefer explicit ownership, thin transports, typed contracts, and robust
  source-of-truth pathways over Python-era incidental behavior.
- Prefer the Go stdlib or well-established libraries.
- For Go-owned OpenAI API surfaces, use `github.com/openai/openai-go/v3` at
  the provider edge rather than growing bespoke HTTP or WebSocket clients.
- If a required OpenAI surface is not covered cleanly by `openai-go`, treat
  that as an explicit planning decision instead of silently adding bespoke
  transport code.
- Do not preserve old route shapes or Python-generated frontend contract
  artifacts merely to support a temporary mixed-source state.

## Port-First Guardrails

Safe to defer until after the Go runtime is proven:

- broad package reshaping
- new service boundaries added mainly for elegance
- large route/module splits done only for organization
- non-essential performance optimization

Expected during the port:

- correctness fixes
- explicit source-of-truth boundaries that remove ambiguity
- low-risk seam extraction that reduces lifecycle or constructor sprawl
- test harness work needed to prove parity

Not acceptable to defer:

- partial-commit or split-brain state behavior
- brittle heuristics where deterministic metadata or state already exists
- hidden runtime coupling that blocks testing or safe shutdown

If a change is behavior-preserving seam creation and meaningfully lowers future
rewrite cost, take it. If it is a true redesign, defer it unless correctness
or active caller coverage requires it.

## Task-Specific Infrastructure Tracks

Use these only when the task touches them:

- Go-owned frontend binding generation
  - frontend-facing backend contracts should have a Go-owned source of truth
    wherever transport/runtime ownership is Go
  - replace the canonical generated frontend contract files rather than
    growing long-lived `generatedGo*` shadow outputs
  - if a runtime type does not convert cleanly, add a Go boundary DTO or
    converter rule instead of hand-writing TypeScript for one route
- `openai-go` convergence for Go-owned OpenAI provider edges
  - keep the SDK behind internal adapters so repo contracts stay Go-owned
  - do not broaden bespoke OpenAI transport clients by default

## When To Open New Rewrite Work

Open a new bounded rewrite slice only when at least one of these is true:

- an active caller or workflow is blocked by a Python-owned boundary
- a release or runtime issue exposes a real ownership gap
- tests show the current boundary is broken
- a product decision explicitly expands scope
- a concrete rewrite infrastructure task is directly required by the work at
  hand

Otherwise, do not open a new numbered phase doc.
