# Phase 11 Plugin Version-Range Owner And Dependency Cleanup

## Purpose

This doc records the bounded plugin follow-on that removed the last direct
dependency called out below the rewrite's library-selection bar.

The goal of this slice was to replace
`github.com/aquasecurity/go-pep440-version` with a small Go-owned
version/specifier owner for plugin `settaVersionRange` validation, without
reopening broader plugin lifecycle scope and without falling back to heuristic
string matching.

## Current Status

Completed before this slice:

- Phase 11 plugin authoring/local-link ownership in
  `phase-11-plugin-authoring-and-local-link-stage5.md`
- Phase 11 plugin source acquisition and convergence ownership in
  `phase-11-plugin-source-acquisition-and-convergence-stage7.md`
- the rewrite-wide dependency inventory in
  `go-dependency-inventory-and-rationale.md` that identified
  `go-pep440-version` as the clearest remaining direct dependency below the
  preferred bar

Current Go state after this slice:

- `internal/plugins/version_specifiers.go`
  - now owns the bounded version/specifier parsing used by plugin compatibility
    checks
- `internal/plugins/authoring.go`
  - now validates plugin `settaVersionRange` without a third-party PEP 440
    module
- `internal/plugins/candidate_provider.go`
  - now reuses that same owner for source-acquisition host-version checks
- `go.mod`
  - no longer includes:
    - `github.com/aquasecurity/go-pep440-version`
    - `github.com/aquasecurity/go-version`
    - `golang.org/x/xerrors` from that dependency chain

## Scope

This slice delivered:

- a bounded Go-owned parser/comparator for the plugin compatibility surface we
  currently accept:
  - public release segments
  - epochs
  - prerelease, post-release, and dev-release ordering
  - comma-joined comparison clauses
  - compatible-release `~=...`
  - release-prefix `==...*` / `!=...*`
- deterministic rejection for malformed versions and unsupported specifiers
- focused tests for parser behavior plus plugin authoring validation
- module-graph cleanup through `go mod tidy`

## Non-Goals

- becoming a general-purpose PEP 440 library for unrelated subsystems
- widening plugin manifest semantics beyond the current bounded
  `settaVersionRange` owner
- reintroducing Python packaging as a runtime dependency for Go plugin flows
- reopening plugin install/update/restart behavior

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/go-dependency-inventory-and-rationale.md`
- `docs/plans/go-backend-rewrite/phase-11-plugin-authoring-and-local-link-stage5.md`
- `backend/setta/plugins/manager.py`
- `tests/plugins/test_plugin_manager.py`
- `internal/plugins/authoring.go`
- `internal/plugins/candidate_provider.go`
- `internal/plugins/authoring_test.go`
- `internal/plugins/candidate_provider_test.go`

## Working Decisions

- keep the owner bounded to the plugin compatibility surface instead of
  vendoring or replacing `go-pep440-version` with another third-party module
- preserve deterministic parser behavior:
  - accept the specifier/version forms the current plugin subsystem needs
  - reject malformed or unsupported inputs explicitly
- keep the shared owner inside `internal/plugins` so authoring and candidate
  resolution use the same source of truth

## Implementation Notes

1. Added `internal/plugins/version_specifiers.go`.
   - version parsing now handles bounded release, prerelease, post-release,
     dev-release, epoch, and local-version forms
   - specifier parsing now handles comparison clauses, compatible releases, and
     release-prefix matches

2. Switched plugin compatibility checks off `go-pep440-version`.
   - `validateSettaVersionRange(...)` now uses the internal parser for both
     local authoring validation and source-acquisition host-version checks

3. Tightened failure behavior instead of guessing.
   - malformed version strings now fail deterministically
   - unsupported specifier forms now fail deterministically
   - prerelease host versions remain rejected unless the specifier set
     explicitly allows them

4. Removed the obsolete dependency chain.
   - `go mod tidy` dropped the direct `go-pep440-version` module and the
     indirect `go-version` / `xerrors` baggage that existed only for that path

## Verification

- `./scripts/go.sh test ./internal/plugins -count=1`
- `./scripts/go.sh test ./internal/settacmd -run 'Plugins' -count=1`

## Decisions Made

- use a bounded internal owner for plugin compatibility instead of swapping one
  third-party PEP 440 module for another
- preserve the current plugin compatibility semantics through explicit parsing
  and ordering logic rather than string matching
- treat unsupported future manifest syntax as an explicit follow-on decision,
  not as a reason to keep an obscure dependency in the graph today

## Progress Notes

- 2026-03-09: opened this focused cleanup slice after the dependency inventory
  called out `go-pep440-version` as the clearest remaining direct dependency
  below the preferred library bar.
- 2026-03-09: landed the bounded internal plugin version/specifier owner,
  switched plugin compatibility checks over to it, and removed the obsolete
  dependency chain from `go.mod`.

## Next Recommended Step

- treat the plugin compatibility dependency cleanup as complete for the current
  bounded rewrite scope
- use `go-dependency-inventory-and-rationale.md` as the source of truth for
  future dependency discussions
- only reopen this area if plugin manifests need additional explicit
  version/specifier forms beyond the bounded owner now in `internal/plugins`
