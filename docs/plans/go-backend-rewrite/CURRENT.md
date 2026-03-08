# Current Rewrite State

Last verified: `2026-03-10`

## Status

The Go backend rewrite is effectively closed for the current clean-break scope.
For the active product-facing backend surface, Go is now the source of truth.

There is no currently selected next rewrite phase.

## Canonical Docs

- `backend-feature-checklist.md`
  - fastest feature/parity lookup
- `go-backend-rewrite-plan.md`
  - stable rewrite charter and reopening rules
- `testing-strategy.md`
  - test expectations for any follow-on work
- `go-dependency-inventory-and-rationale.md`
  - actual current dependency state
- `archive/README.md`
  - historical phase docs, reranks, closeouts, and spikes

## Go-Owned Core Surface

- auth, modes, bootstrap, and live settings-state transport
- launcher, workspace launch, deployments, and packaged CLI/server ownership
- realtime frontend websocket transport, listener coverage reads, and terminals
- project shell, project-state hydration, layout mutations, rename flow, code
  edit/format, LSP, and Watch Code
- MCP server/client/tooling and the active caller-backed mutation surface
- current agentic runtime slices, managed chat/transcription runtime, and the
  bounded OpenAI-managed executor path
- plugin runtime, lifecycle mutations, backend route dispatch, backend MCP
  tools, and listener endpoints
- file browser, binary payloads, attachments, artifacts, and git reads

## Deliberate Boundaries That Still Exist

- dev-only Python reload/server ownership remains explicit
- thin packaged Python dispatch into the Go CLI remains explicit
- some Python sidecars/tool executables are still intentionally invoked by Go
- managed AI/runtime parity is intentionally bounded rather than complete
- some legacy Python route families remain omitted because no active caller
  selected them

## How Agents Should Work Here

- Start with `backend-feature-checklist.md` for "is this Go-owned?" questions.
- Use `go-backend-rewrite-plan.md` for rewrite rules, not for historical slice
  detail.
- Use `archive/` only for historical rationale or implementation archaeology.
- If new work changes scope, update `CURRENT.md`,
  `backend-feature-checklist.md`, and any supporting source-of-truth doc in the
  same change.
- Do not create another numbered phase doc unless a concrete issue or caller
  selects new rewrite work.
