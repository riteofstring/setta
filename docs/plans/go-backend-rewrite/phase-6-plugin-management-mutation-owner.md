# Phase 6 Plugin Management Mutation Owner

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed plugin
store/discovery foundation work.

The goal is to add the missing Go-owned mutation service for
`install_plugin`, `uninstall_plugin`, `update_plugin`, and `rollback_plugin`
so the remaining plugin-management MCP tools can land on top of explicit Go
owners instead of a Python shim.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- the remaining non-project-state Python MCP gap count is 1
- Go now owns:
  - plugin manifest/state/install-metadata/history persistence in
    `internal/plugins`
  - filesystem plugin discovery/rescan in `internal/plugins/discovery.go`
  - source-spec parsing and retargeting for `github:` and `pypi:` mutation
    requests in `internal/plugins/source_specs.go`
  - install/update/uninstall/rollback service methods over plugin roots in
    `internal/plugins/service.go`
  - pending-restart tombstones for removed backend plugins inside the mutation
    service runtime
  - typed mutation result payloads in `internal/plugins/mutation_types.go`
  - plugin-management MCP transport parity for the five mutation tools
- Go does not yet own:
  - `getInstalledPythonPackages`

## Scope

This slice should cover:

- explicit Go parsing and validation for supported mutation source specs:
  - `github:<owner>/<repo>[#ref]`
  - `pypi:<package>[==version]`
- an install/update fetch-and-stage boundary with explicit interfaces for
  archive/network/package-manager edges
- install, uninstall, update, and rollback service methods over the completed
  plugin store/discovery owners
- persisted install metadata and rollback history updates during mutation flows
- restart-required bookkeeping for backend plugin replacement and removal
- focused runtime tests for the mutation owner

## Non-Goals

- MCP transport for plugin-management tools in this slice
- plugin CLI parity
- lockfile write/apply parity
- local-link, enable/disable, or plugin-config write parity
- package-manager discovery parity outside the Setta-managed mutation flows
- `getInstalledPythonPackages`

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-plugin-management-runtime-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-post-project-state-mcp-surface-inventory.md`
- `docs/reference/setta-cli-commands.md`
- `docs/reference/setta-files.md`
- `backend/setta/mcp/tools/plugins.py`
- `backend/setta/plugins/manager.py`
- `tests/mcp/test_plugin_tools.py`
- `tests/plugins/test_plugin_manager.py`
- `internal/plugins/store.go`
- `internal/plugins/discovery.go`

## Current Python Behavior

1. Install
   - accepts `sourceSpec`, optional `scope`, optional `installer`, `enable`,
     and `force`
   - stages a candidate, snapshots the existing plugin tree when replacing, and
     persists canonical source metadata plus rollback history

2. Uninstall
   - removes a plugin from an explicit or resolved scope
   - preserves pending-restart tombstones for removed backend plugins

3. Update
   - reuses stored source metadata unless `to` retargets the source
   - rejects linked local plugins explicitly

4. Rollback
   - restores from persisted history snapshots
   - rejects missing or changed rollback history explicitly

## Working Decisions

- build the mutation owner on top of the completed Go store/discovery service
  instead of extending the old resolver
- keep network/package-manager/archive work behind explicit interfaces instead
  of embedding shelling or HTTP logic into the mutation service
- persist rollback history through the shared plugin store rather than ad-hoc
  filesystem writes from transport handlers
- leave MCP transport for a follow-on slice once the mutation owner is stable

## Recommended Implementation Order

1. Source-spec and candidate staging layer
   - parse `github:` and `pypi:` source specs
   - define explicit fetch/install interfaces and a candidate descriptor
   - status: completed 2026-03-08

2. Mutation service methods
   - add install, uninstall, update, and rollback service methods
   - wire metadata/history updates and restart bookkeeping
   - status: completed 2026-03-08

3. Focused verification
   - add runtime tests for replace, rollback, linked-local rejection, and
     pending-restart tombstone behavior
   - status: completed 2026-03-08

4. Follow-on transport slice
   - expose `install_plugin`, `uninstall_plugin`, `rescan_plugins`,
     `update_plugin`, and `rollback_plugin` as thin MCP handlers
   - status: completed 2026-03-08
   - next detailed scope: `phase-6-python-environment-introspection-foundation.md`

## Verification Targets

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/plugins -count=1 -timeout 300s`

## Open Questions

- whether the first Go fetch/install backends should land with real GitHub and
  PyPI implementations immediately or first through narrower temp-fixture
  adapters that keep the service contract stable
- where to place the boundary between persistent pending-restart ids and
  in-memory tombstones for removed backend plugins

## Progress Notes

- 2026-03-08: added typed Go source-spec parsing and retarget helpers for
  `github:` and `pypi:` plugin mutation requests.
- 2026-03-08: added the Go plugin mutation service with install, uninstall,
  update, rollback, restart bookkeeping, and rescan+tombstone behavior over the
  completed store/discovery foundation.
- 2026-03-08: completed focused runtime coverage for source-spec parsing, the
  install/update/rollback/uninstall lifecycle, local-source update rejection,
  and backend uninstall tombstones.
- 2026-03-08: completed plugin-management MCP transport parity, so the next
  remaining non-project-state MCP gap is the blocked
  `getInstalledPythonPackages` environment-introspection slice.
