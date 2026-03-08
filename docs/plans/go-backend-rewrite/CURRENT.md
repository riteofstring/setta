# Current Rewrite State

Last verified: `2026-03-10`

## Status

The Go backend rewrite is effectively closed for the current clean-break scope,
but the repo still carries a smaller caller-backed Python HTTP and websocket
surface.
For most of the active product-facing backend runtime, Go is now the source of
truth.

There is no currently selected next rewrite phase.

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
  - stable rewrite charter and reopening rules
- `testing-strategy.md`
  - test expectations for any follow-on work
- `go-dependency-inventory-and-rationale.md`
  - actual current dependency state
- `archive/README.md`
  - historical phase docs, reranks, closeouts, and spikes

## Go-Owned Core Surface

- auth, modes, bootstrap, and settings-state load/save transport
- launcher, workspace launch, deployments, and packaged CLI/server ownership
- listener coverage reads plus Go-owned websocket/terminal runtime on the
  replacement `/ws/...` transport
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
- some legacy Python route families remain omitted with no proven current
  caller
- a smaller set of current frontend calls still reaches Python-owned HTTP and
  websocket routes, notably app-definition REST/app-spec streaming,
  attachment/default-project/file helpers, helper/admin endpoints,
  Python-era `/api/frontend` and terminal websocket paths, and parts of the
  project-mutation tail
- some Go live-update paths are not yet end-to-end because the core frontend
  still uses Python-era websocket shapes; this currently affects settings
  broadcasts, UI-setting reveal/result flows, and managed chat/tool-preview
  streaming

## How Agents Should Work Here

- Start with `caller-backed-backend-surface-checklist.md` for "does the active
  caller reach Go?" questions.
- Use `backend-capability-coverage-checklist.md` for broader backend ownership
  questions that go beyond active caller transport reachability.
- Treat `Complete` in the caller-backed checklist as "current caller reaches Go
  today," not merely "Go has an internal equivalent somewhere."
- Use `go-backend-rewrite-plan.md` for rewrite rules, not for historical slice
  detail.
- Use `archive/` only for historical rationale or implementation archaeology.
- If new work changes scope, update `CURRENT.md`,
  `caller-backed-backend-surface-checklist.md`,
  `backend-capability-coverage-checklist.md`, and any supporting
  source-of-truth doc in the same change.
- Do not create another numbered phase doc unless a concrete issue or caller
  selects new rewrite work.
