# Phase 6 Plugin Management Runtime Foundation

## Purpose

This doc scopes the next Phase 6 slice after the completed
`stream_app_definition` parity work.

The goal is to build the missing Go-owned runtime foundation for plugin package
management so the remaining MCP tools
`install_plugin`, `uninstall_plugin`, `rescan_plugins`, `update_plugin`, and
`rollback_plugin` can land on top of explicit Go owners instead of a Python
shim.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- Go now has parity for `stream_app_definition`
- the remaining non-project-state Python MCP gap count is 6
- five of those six remaining tools are plugin-management mutations
- Go already owns:
  - plugin worker/runtime and codegen execution boundaries under
    `internal/plugins`
  - plugin-root precedence and enablement reads for codegen-target resolution in
    `internal/plugins/filesystem_worker_spec_resolver.go`
  - typed plugin manifest, state, metadata, and history-snapshot ownership in
    `internal/plugins/types.go`, `internal/plugins/manifest.go`, and
    `internal/plugins/store.go`
  - a bounded filesystem discovery/rescan owner in
    `internal/plugins/discovery.go`
- Go does not yet own:
  - install/update/uninstall mutation owners for plugin package roots
  - plugin-management response payloads and restart-required bookkeeping
  - plugin-management MCP transport

## Scope

This slice should cover:

- a Go-owned file/state layer for the documented plugin install roots and state
  files:
  - `<workspace>/.setta_plugins/<plugin-id>`
  - `<setta_files_root>/plugins/<plugin-id>`
  - `<setta_home>/plugins/<plugin-id>`
  - `<setta_files_root>/plugins_state.json`
  - `<setta_files_root>/plugins_install_metadata.json`
  - `<setta_files_root>/plugins_history/`
  - `<setta_home>/plugins_global_state.json`
- explicit source-spec parsing for supported mutation sources:
  - `github:<owner>/<repo>[#ref]`
  - `pypi:<package>[==version]`
- a bounded discovery/rescan owner that resolves precedence, enablement,
  backend presence, and pending-restart state
- a mutation service boundary for install, uninstall, update, and rollback that
  persists install metadata/history and returns typed result payloads
- focused runtime/store coverage for those new owners

## Non-Goals

- MCP transport for plugin-management tools in this slice
- plugin CLI parity
- lockfile write/apply parity
- local-link, enable/disable, or plugin-config write parity
- frontend plugin routes or views
- `getInstalledPythonPackages`

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-post-project-state-mcp-surface-inventory.md`
- `docs/reference/setta-cli-commands.md`
- `docs/reference/setta-files.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/mcp/tools/plugins.py`
- `backend/setta/plugins/manager.py`
- `tests/mcp/test_plugin_tools.py`
- `tests/plugins/test_plugin_manager.py`
- `internal/plugins/filesystem_worker_spec_resolver.go`
- `internal/plugins/worker_runtime.go`
- `internal/app/app.go`

## Current Python Behavior

1. Tool policy
   - plugin mutation tools are blocked outside IDE mode
   - tool handlers are thin wrappers over `plugin_manager`

2. Install
   - accepts `sourceSpec`, optional `scope`, optional `installer`, `enable`,
     and `force`
   - supports `github:` and `pypi:` source specs
   - persists install metadata including canonical source key, digest, and
     rollback history
   - marks backend plugins as restart-required when needed

3. Uninstall
   - removes a plugin from an explicit or resolved scope
   - rejects ambiguous or non-Setta-managed writes
   - preserves pending-restart metadata for removed backend plugins

4. Update and rollback
   - update reuses stored source metadata and may retarget with `to`
   - rollback restores from persisted history snapshots
   - linked local plugins reject update/rollback explicitly

5. Rescan
   - rebuilds discovered-plugin state from install roots plus enablement state
   - returns aggregate installed/active counts

## Working Decisions

- do not port the Python `PluginManager` singleton shape into Go
- keep plugin discovery/state/mutation ownership explicit and separate from the
  existing worker/codegen runtime
- reuse the documented plugin roots and state-file layout as the source of
  truth instead of inventing heuristic discovery
- stage runtime/store foundations before MCP transport
- keep `getInstalledPythonPackages` deferred until Go owns explicit
  Python-environment selection metadata

## Recommended Implementation Order

1. State/store foundation
   - add typed Go ownership for plugin scopes, install metadata, history
     snapshots, and enablement state files
   - status: completed 2026-03-08

2. Discovery/rescan owner
   - add a runtime service that walks plugin roots, validates manifests,
     resolves precedence/enablement, and computes pending-restart state
   - status: completed 2026-03-08

3. Mutation owner
   - add install, uninstall, update, and rollback service methods above the
     completed store/discovery owners
   - keep installer and archive/network edges behind explicit interfaces
   - next detailed scope: `phase-6-plugin-management-mutation-owner.md`

4. Follow-on transport slice
   - once the runtime foundation is stable, expose the five plugin-management
     MCP tools as thin structural handlers

## Verification Targets

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/plugins -count=1 -timeout 300s`

## Open Questions

- whether the first Go mutation slice should support real remote install
  backends immediately or stage with explicit installer interfaces plus limited
  local-fixture coverage first
- whether pending-restart plugin state should live entirely inside the plugin
  runtime service or remain app-owned metadata composed around it

## Progress Notes

- 2026-03-08: added shared Go plugin manifest/state/install-metadata/history
  ownership under `internal/plugins`, and refactored the existing filesystem
  worker spec resolver to consume the shared store and manifest helpers.
- 2026-03-08: added a Go-owned filesystem discovery/rescan service covering
  precedence, enablement, invalid-manifest visibility, canonical source keys,
  and persisted pending-restart state.
- 2026-03-08: narrowed the remaining plugin-management runtime gap to the
  mutation owner for install, uninstall, update, and rollback.
