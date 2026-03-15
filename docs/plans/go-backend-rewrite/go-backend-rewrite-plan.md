# Go Backend Rewrite Plan

Use this file for clean-break defaults, port-vs-redesign decisions, and
"should this become a new rewrite slice?" questions.

## Goal

- Go should become the owner of backend runtime, transports, state, and
  service logic.
- This is a clean break, not a Python compatibility program.
- Preserve active product behavior for current callers. Do not preserve Python
  route shapes, storage formats, or architecture by default.
- Progress is measured in caller reachability and ownership cutover, not in how
  aggressively Python files are deleted during the rewrite.

## Explicit Retained Python Boundaries

These are the intended exceptions:

- packaging/install entrypoints and wheel-facing wrappers, including
  `python -m setta`
- public Python APIs:
  - `setta.api.SettaListener`
  - `setta.api.ListenerHotReloader`
  - `setta.api.chat_toolkit`
  - share listener entrypoints that instantiate `SettaListener`
  - `setta.api.SettaRunner`
- external tool/provider runtimes and generic stdio MCP servers intentionally
  executed by Go

The retained Python listener boundary is the authoring/client surface only.
Local dependency-graph rebuilding, Python codegen, and generated-runtime
fallback inside the listener client are not retained end state.

If a backend behavior is not in that list, the default target is Go ownership.
That does not require immediate source deletion while `main` is still evolving
the Python backend.

## Decision Order

When the right move is unclear, decide in this order:

1. Preserve active product behavior for the current caller.
2. Prefer clean Go ownership over Python compatibility or mixed-source
   transitional work.
3. Keep the port behavior-first and architecture-conservative unless
   correctness, testability, or active caller coverage requires redesign.
4. Prefer explicit typed boundaries, deterministic source-of-truth paths, and
   established libraries over incidental Python behavior or heuristics.

## Rewrite Rules

- Treat Python code, tests, and docs as behavior reference, not as a
  compatibility contract.
- Preserve capability and user-visible behavior, not Python implementation
  details.
- Test parity is behavior-only. Do not chase implementation-level symmetry
  between Python and Go.
- Move runtime ownership to Go as slices land, but keep superseded Python
  source in-tree until the rewrite is complete when that makes merges from
  `main` easier.
- In the final cleanup stage, delete dead Python code/tests once the caller and
  runtime path are proven gone or behaviorally replaced by Go. Git history is
  the rewrite log; the repo does not need to preserve dead Python files as
  historical breadcrumbs.
- Retained Python source after a Go cutover is a merge buffer/reference
  surface, not an active fallback or source of truth.
- Do not preserve Python dev startup/reload wrappers or Python plugin backend
  workers as steady state without an explicit product decision.
- Do not add migrations, backward-compatibility shims, legacy route-shape
  preservation, or mixed Go/Python transition layers unless a current repo
  workflow explicitly needs a bounded exception.
- The backend does not need to keep active callers on a mixed Go/Python
  ownership path at every intermediate commit.
- Before deleting Python tests for a still-relevant behavior, add or identify
  the Go tests that prove that behavior. If the deleted Python test only covers
  a dead path, document that classification and delete it without forcing a
  fake one-for-one replacement.
- If a Go-owned boundary needs a stable frontend, SDK, or provider contract,
  introduce an explicit boundary DTO or adapter instead of reflecting runtime
  internals directly.
- Prefer the Go stdlib or well-established libraries.
- Use official provider SDKs at the provider edge when they cover the needed
  surface cleanly. Keep them behind Go-owned adapters.

## Port-First Guardrails

Safe to defer until after the Go runtime is proven:

- broad package reshaping
- organization-only route/module splits
- new service boundaries added mainly for elegance
- non-essential performance tuning

Take during the port when they materially reduce rewrite risk:

- correctness fixes
- explicit source-of-truth boundaries
- low-risk seam extraction that reduces constructor, lifecycle, or ownership
  sprawl
- test harness work needed to prove parity

Not acceptable to defer:

- split-brain or partial-commit state behavior
- brittle heuristics where deterministic metadata or state already exists
- hidden runtime coupling that blocks testing, shutdown, or safe cutover

## Infrastructure Rules

- Go-owned frontend bindings:
  - canonical frontend route/type/endpoint outputs should come from Go-owned
    specs and DTOs
  - do not keep `generatedGo*` shadow outputs or add handwritten TypeScript
    wrappers as steady state
- Python listener SDK:
  - keep the public Python authoring surface
  - move listener websocket, bootstrap, endpoint dispatch, and mutation
    authority to Go
  - do not retain local dependency-graph rebuilding, Python codegen, or
    generated-runtime fallback inside the Python listener client
- Backend/plugin extension boundaries:
  - backend/plugin logic that touches Setta runtime should land in Go
  - generic stdio MCP servers and external tool/provider runtimes remain
    acceptable subprocess boundaries
- Provider edges:
  - use official SDKs behind internal adapters where possible
  - do not silently grow bespoke transport clients when an explicit planning
    decision is needed

## When To Open New Rewrite Work

Open a new bounded rewrite slice only when at least one of these is true:

- an active caller or workflow is blocked by a Python-owned boundary
- a release or runtime issue exposes a real ownership gap
- tests show the current boundary is broken
- a product decision explicitly expands scope
- a concrete rewrite infrastructure task is directly required by the work at
  hand

Otherwise, keep working inside the existing doc set and code paths.

## Done Means

For any rewritten subsystem, "done" means:

- the active runtime and transport ownership are where the docs say they are
- the relevant tests prove the intended behavior
- any remaining Python/shared boundary is explicit and deliberate
- the checklist docs reflect the current caller reachability and ownership
  state
- the source-of-truth docs were updated with the same change
