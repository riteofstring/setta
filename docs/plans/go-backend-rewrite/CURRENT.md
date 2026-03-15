# Rewrite Working Set

Last verified: `2026-03-14`

Read this file first for active Go backend rewrite work.

## Rewrite Target

- Goal: Go owns backend runtime, transports, state, and service logic.
- Default assumption: if a backend behavior does not need to stay Python, move
  it to Go.
- This is a clean break. Do not preserve mixed Go/Python backend ownership,
  Python route shapes, migrations, storage compatibility, or transition layers
  unless a current repo workflow explicitly requires a bounded exception.
- Progress is tracked in the two checklist docs, not by how much Python source
  has been deleted from this branch.
- The rewrite is in late-stage cleanup. Once a Python surface is provably dead
  or behaviorally replaced by Go, delete the Python code/tests instead of
  keeping them around as rewrite history.
- Do not treat required plugin capabilities as deletable just because their
  Python implementation is going away. Full plugin support remains in scope;
  only the implementation language/runtime is changing.

## Explicit Retained Python Boundaries

These are intentional exceptions, not open-ended compatibility obligations:

- packaging/install entrypoints and wheel-facing wrappers, including
  `python -m setta`
- public Python APIs:
  - `setta.api.SettaListener`
  - `setta.api.ListenerHotReloader`
  - `setta.api.chat_toolkit`
  - share listener entrypoints that instantiate `SettaListener`
  - `setta.api.SettaRunner`
- retained Python listener SDK transport now targets the Go listener websocket
  route at `/ws/listeners/{listenerID}`; legacy `/pythonScript/{id}` is no
  longer the active caller path
- the retained Python listener boundary is the authoring/client surface only;
  local dependency-graph rebuilding, Python codegen, and generated-runtime
  fallback inside `setta.api.listener` are not retained end state
- external tool/provider runtimes and generic stdio MCP servers intentionally
  executed by Go; legacy Python subprocesses that only exist because backend
  or plugin ownership has not yet moved to Go are transitional, not retained
  boundaries

Everything else should default to Go ownership. That includes dev startup or
reload wrappers and any remaining listener-side dependency-graph rebuilding.
The Go-owned plugin authoring path should not scaffold new Python backend
plugins; treat any remaining Python backend plugin runtime as rewrite debt
rather than a retained authoring surface. That does not make backend plugin
capability optional. The target is full plugin support in a Go-native backend
plugin model, not product-level removal of backend plugin features.

## Read Order

1. Read `CURRENT.md`.
2. Read only the docs the task needs:
   - active caller reachability:
     `caller-backed-backend-surface-checklist.md`
   - runtime/service ownership:
     `backend-capability-coverage-checklist.md`
   - clean-break defaults and port-vs-redesign decisions:
     `go-backend-rewrite-plan.md`
   - testing expectations:
     `testing-strategy.md`
   - dependency, provider, transport, or library decisions:
     `go-dependency-inventory-and-rationale.md` plus
     `docs/reference/dependencies/`
   - Python listener SDK or listener websocket work:
     `setta-listener-protocol-redesign-plan.md`
   - Go-to-TypeScript frontend contract generation:
     `go-frontend-binding-generation-plan.md`
3. Use `README.md` only as the folder map and Go toolchain quick reference.
4. Use `*-audit-plan.md` only when editing the matching checklist.
5. Use `archive/` only when current docs and code are not enough.

## Working Rules

- If docs disagree with current code or tests, trust the code/tests and update
  the docs.
- Preserve active product behavior and current callers, not Python
  implementation details.
- Full plugin support is part of active product behavior for rewrite purposes.
  Restore plugin capability in Go rather than treating deleted Python-backed
  plugin features as accepted scope reduction.
- Test parity is behavioral, not implementation-level. Before deleting Python
  tests, either prove they only covered a dead path or point to the Go tests
  that now cover the surviving behavior.
- Managed-chat provider scope is currently the landed OpenAI, Azure OpenAI,
  Anthropic, and Gemini set. Do not widen the rewrite target to additional
  providers such as Mistral unless a concrete current caller or explicit
  product decision requires it.
- Read Go code first. Read Python only as behavior reference or when touching a
  retained Python boundary.
- Because `main` still evolves the Python backend, retain superseded Python
  source in-tree until the rewrite is complete unless a file clearly blocks the
  work. Do not treat retained Python files as the active source of truth once a
  slice is Go-owned.
- Default to a behavior-first, architecture-conservative port. Reopen redesign
  only when correctness, testability, or active caller coverage requires it.
- Prefer explicit ownership, thin transports, typed boundaries, deterministic
  source-of-truth paths, and established libraries.
- Do not widen scope unless a concrete caller, workflow, runtime issue, or
  documented product decision requires it.
- The repo does not need to route active callers through mixed Go/Python
  ownership while the rewrite is in flight, even if superseded Python source is
  temporarily retained for mergeability.

## Task Router

- "Does the current caller hit Go yet?":
  `caller-backed-backend-surface-checklist.md`
- "Where does ownership live overall?":
  `backend-capability-coverage-checklist.md`
- "Should this be ported as-is or redesigned?":
  `go-backend-rewrite-plan.md`
- "What tests should prove this?":
  `testing-strategy.md`
- "Which dependency or provider path should we use?":
  `go-dependency-inventory-and-rationale.md` plus
  `docs/reference/dependencies/`
- "How should the Python listener SDK boundary move?":
  `setta-listener-protocol-redesign-plan.md`
- "How should Go own the frontend contract surface?":
  `go-frontend-binding-generation-plan.md`

## Execution Loop

1. Inspect the touched Go code, tests, and current transport/runtime path
   first.
2. Map the task to:
   - the relevant caller-backed surface
   - the relevant ownership bucket
   - any retained Python, shared, or external boundary
3. In the first substantive update, summarize:
   - the relevant checklist rows or slice doc
   - the active code path
   - the boundary implications
   - the single highest-leverage next step
4. Execute that step end-to-end unless the task is planning or inventory work.
5. Update the source-of-truth docs in the same change when ownership, caller
   reachability, dependency decisions, or workflow guidance changed.

## Update Rules

- The rewrite progress tracker is:
  - `caller-backed-backend-surface-checklist.md`
  - `backend-capability-coverage-checklist.md`
- Update `caller-backed-backend-surface-checklist.md` when active caller
  reachability changed.
- Update `backend-capability-coverage-checklist.md` when runtime/service
  ownership changed.
- Update `CURRENT.md` only when doc routing, retained Python boundaries, or
  rewrite workflow guidance changed.
- Read the matching audit-plan doc before editing either checklist.
- Keep audit-plan docs concise. Use them for current verdict/evidence summaries
  and maintenance rules, not chronological cleanup logs.
- Do not create a new numbered phase or spike doc unless a bounded new rewrite
  slice is actually required.
