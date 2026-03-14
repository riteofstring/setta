# Go Rewrite Docs

This folder contains the active working docs for the Go backend rewrite plus a
historical archive.

## Read Order

1. `CURRENT.md`
   - canonical doc map, clean-break defaults, and agent workflow
2. `caller-backed-backend-surface-checklist.md`
   - fastest answer to "does the active caller reach Go?"
3. `backend-capability-coverage-checklist.md`
   - broader backend runtime/service ownership coverage
4. `backend-capability-coverage-checklist-audit-plan.md`
   - maintenance rules for keeping the broader ownership checklist accurate
5. `caller-backed-backend-surface-checklist-audit-plan.md`
   - maintenance rules for keeping the caller-backed checklist current-caller-accurate
6. `go-backend-rewrite-plan.md`
   - stable rewrite charter, clean-break guardrails, and reopening rules
7. `go-frontend-binding-generation-plan.md`
   - subsystem-specific doc for Go-owned frontend binding generation; read it
     when a task touches that boundary
8. `testing-strategy.md`
   - test bar for rewrite work
9. `go-dependency-inventory-and-rationale.md`
   - current `go.mod` explanation
10. `docs/reference/dependencies/`
   - local dependency reference notes and upstream doc snapshots
11. `go-backend-rewrite-stack-recommendations.md`
   - earlier design input, not the primary working source of truth
12. `dependency-docs-local-reference.md`
   - dependency-doc acquisition rules
13. `pyproject-dependency-replacement-snapshot.md`
   - point-in-time Python dependency classification
14. `archive/README.md`
   - historical `phase-*` and `spike-*` docs

## Agent Rules

- Start with `CURRENT.md`, not the archive.
- Treat this folder as the working set for the entire Go rewrite, not as a
  standing priority list for one narrow subsystem.
- Treat `caller-backed-backend-surface-checklist.md` as the fastest answer to
  "does the active caller reach Go?".
- Use `backend-capability-coverage-checklist.md` when the question is about
  broader backend ownership rather than caller transport reachability.
- Use `archive/` only when a current doc points there or when you need
  historical rationale.
- Do not open a new rewrite phase without a concrete active workflow, caller,
  release problem, or product decision.

## Clean-Break Reminder

- This rewrite has no deployed users and no production compatibility contract.
- Do not spend rewrite effort on backward compatibility, migrations, legacy
  route preservation, or Python transitional support unless a current repo
  workflow explicitly requires it.
- Preserve active product behavior and documented workflows, not Python-shaped
  architecture or unused legacy compatibility surfaces.

## Dependency Guardrail

- Prefer the Go stdlib or well-established libraries.
- Do not add obscure Go libraries by default.
- If a non-obvious library is proposed, document why the stdlib or a more
  established option is insufficient.
- If an obscure library already appears in `go.mod`, treat it as existing repo
  debt, not precedent.

## Go Toolchain Shortcut

- Run Go commands with `./scripts/go.sh <args>`.
- Resolve the pinned SDK root with `./scripts/go.sh env GOROOT`.
- Run `gofmt` from that SDK when it is not on `PATH`:
  - `GOROOT="$(./scripts/go.sh env GOROOT)"`
  - `"$GOROOT/bin/gofmt" -w <files>`
- If the wrapper cannot find the SDK, install the repo-local toolchain with
  `./scripts/install_go_toolchain.sh`.
