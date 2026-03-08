# Go Rewrite Docs

The Go backend rewrite is effectively closed for the current clean-break scope.
This folder now has a small hot path for active agent work and a cold archive
for historical phase material.

## Read Order

1. `CURRENT.md`
   - current state, deliberate boundaries, and agent workflow
2. `backend-feature-checklist.md`
   - fastest feature/parity lookup
3. `backend-feature-checklist-audit-plan.md`
   - maintenance rules for keeping the checklist current-caller-accurate
4. `go-backend-rewrite-plan.md`
   - stable rewrite charter and reopening rules
5. `testing-strategy.md`
   - test bar for follow-on work
6. `go-dependency-inventory-and-rationale.md`
   - current `go.mod` explanation
7. `go-backend-rewrite-stack-recommendations.md`
   - earlier design input, not the current source of truth
8. `dependency-docs-local-reference.md`
   - dependency-doc acquisition rules
9. `pyproject-dependency-replacement-snapshot.md`
   - point-in-time Python dependency classification
10. `archive/README.md`
   - historical `phase-*` and `spike-*` docs

## Agent Rules

- Start with `CURRENT.md`, not the archive.
- Treat `backend-feature-checklist.md` as the fastest answer to "is this Go-owned?".
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
