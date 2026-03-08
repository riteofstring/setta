# Go Rewrite Docs

The Go backend rewrite is effectively closed for the current clean-break scope.
This folder now has a small hot path for active agent work and a cold archive
for historical phase material.
That means there is no open-ended parity chase, not that every follow-on is
forbidden; selected bounded follow-ons still belong in the current docs.

## Read Order

1. `CURRENT.md`
   - current state, deliberate boundaries, selected follow-on work, and agent workflow
2. `caller-backed-backend-surface-checklist.md`
   - fastest answer to "does the active caller reach Go?"
3. `backend-capability-coverage-checklist.md`
   - broader backend runtime/service ownership coverage
4. `backend-capability-coverage-checklist-audit-plan.md`
   - maintenance rules for keeping the broader ownership checklist accurate
5. `caller-backed-backend-surface-checklist-audit-plan.md`
   - maintenance rules for keeping the caller-backed checklist current-caller-accurate
6. `go-backend-rewrite-plan.md`
   - stable rewrite charter and reopening rules
7. `testing-strategy.md`
   - test bar for follow-on work
8. `go-dependency-inventory-and-rationale.md`
   - current `go.mod` explanation
9. `go-backend-rewrite-stack-recommendations.md`
   - earlier design input, not the current source of truth
10. `dependency-docs-local-reference.md`
   - dependency-doc acquisition rules
11. `pyproject-dependency-replacement-snapshot.md`
   - point-in-time Python dependency classification
12. `archive/README.md`
   - historical `phase-*` and `spike-*` docs

## Agent Rules

- Start with `CURRENT.md`, not the archive.
- Treat `caller-backed-backend-surface-checklist.md` as the fastest answer to
  "does the active caller reach Go?".
- Use `backend-capability-coverage-checklist.md` when the question is about
  broader backend ownership rather than caller transport reachability.
- Use `archive/` only when a current doc points there or when you need
  historical rationale.
- Do not open a new rewrite phase without a concrete active workflow, caller,
  release problem, or product decision.

## Dependency Guardrail

- Prefer the Go stdlib or well-established libraries.
- Do not add obscure Go libraries by default.
- If a non-obvious library is proposed, document why the stdlib or a more
  established option is insufficient.
- If an obscure library already appears in `go.mod`, treat it as current-state
  debt, not precedent.

## Go Toolchain Shortcut

- Run Go commands with `./scripts/go.sh <args>`.
- Resolve the pinned SDK root with `./scripts/go.sh env GOROOT`.
- Run `gofmt` from that SDK when it is not on `PATH`:
  - `GOROOT="$(./scripts/go.sh env GOROOT)"`
  - `"$GOROOT/bin/gofmt" -w <files>`
- If the wrapper cannot find the SDK, install the repo-local toolchain with
  `./scripts/install_go_toolchain.sh`.
