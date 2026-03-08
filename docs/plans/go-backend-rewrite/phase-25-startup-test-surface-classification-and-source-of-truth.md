# Phase 25 Startup Test Surface Classification And Source Of Truth

## Purpose

This doc completes Phase 25 Slice 1 from
`phase-25-legacy-startup-and-distribution-boundary-plan.md`.

The goal is to stop treating all of `tests/start/*` as one undifferentiated
"startup contract". The current repo mixes:

- active packaged command and distribution behavior
- active source/dev workflow wiring
- legacy Python fallback behavior centered on `backend/setta/start.py`

Later cleanup should preserve the first two buckets deliberately and should
only preserve the third bucket when a real remaining consumer still needs it.

## Current Status

Completed before this doc:

- packaged `setta` entrypoint ownership moved to
  `backend/setta/entrypoint.py` plus Go-owned binaries
- shipped CLI/reference docs were synced to the current Go-owned command
  surface in `docs/reference/setta-cli-commands.md`
- Phase 25 inventory and broader boundary plan landed in:
  - `phase-25-remaining-python-ownership-inventory-and-rerank.md`
  - `phase-25-legacy-startup-and-distribution-boundary-plan.md`

What this doc adds:

- file-level classification for the current `tests/start/*` surface
- an explicit distinction between active workflow coverage and legacy
  fallback coverage
- the source-of-truth boundary for later Slice 2 and Slice 3 work

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-25-legacy-startup-and-distribution-boundary-plan.md`
- `docs/plans/go-backend-rewrite/phase-25-remaining-python-ownership-inventory-and-rerank.md`
- `docs/plans/go-backend-rewrite/phase-7-closeout-and-cli-follow-up-boundary.md`
- `docs/plans/go-backend-rewrite/phase-8-cli-closeout-and-launcher-distribution-boundary.md`
- `docs/plans/go-backend-rewrite/phase-9-shipped-entrypoint-and-launcher-distribution-plan.md`
- `docs/plans/go-backend-rewrite/phase-11-maintenance-command-inventory.md`
- `docs/reference/setta-cli-commands.md`
- `pyproject.toml`
- `backend/setta/entrypoint.py`
- `backend/setta/__main__.py`
- `backend/setta/start.py`
- `frontend/backendStart.sh`
- `scripts/run-dev-instance.sh`
- `verify_install.sh`
- `tests/start`

## Classification

### 1. Active shipped and distribution behavior

These tests still validate active shipped behavior or current
distribution/installer workflow contracts. They should remain source-of-truth
for the current product surface.

- `test_module_entrypoint.py`
- `test_packaged_distribution.py`
- `test_desktop_launcher_install_scripts.py`
- `test_launcher_artifact_installers.py`
- `test_launcher_metadata.py`
- `test_launcher_setup.py`
- `test_launcher_workspace_store.py`
- `test_linux_launcher_scripts.py`
- `test_macos_launcher_scripts.py`
- `test_windows_launcher_scripts.py`

Why these stay active:

- they target the packaged `setta` dispatcher, wheel/distribution layout, or
  launcher install/update/remove metadata and artifact workflows
- they do not depend on the legacy Click command tree as the product contract
- they continue to protect the current packaged/install boundary even after the
  backend/runtime rewrite closed

### 2. Active source/dev workflow behavior

These tests validate current repo-local workflow wiring. They are not packaged
CLI behavior, but they are still active because local development and CI use
them today.

- `test_activate_built_setta_script.py`
- `test_dev_script_wiring_ai.py`
- `test_dev_script_wiring_aireset.py`
- `test_dev_script_wiring_backend_start.py`
- `test_dev_script_wiring_run_dev_instance.py`
- `test_dev_script_wiring_structure.py`
- `test_install_root_path_script.py`
- `test_plugin_fixture_reset_script.py`
- `test_plugin_fixture_target_selection_script.py`
- `test_prune_generated_types_script.py`
- `test_reset_setta_state_script.py`
- `test_run_backend_tests_script.py`
- `test_setta_path_flags_script.py`
- `test_start_browser_mcp_script.py`

Why these stay active:

- they validate shell-level env/path contract, dev-start defaults, and test
  workflow helpers that still exist in this repo
- they are the right protection for Slice 2 source/dev startup hardening
- they should be preserved as workflow tests, not misread as shipped CLI
  compatibility requirements

### 3. Legacy fallback behavior

These tests currently validate the old Python startup/fallback path rather than
the active packaged Go-owned command surface. They should not silently block
later cleanup unless a concrete active workflow still depends on them.

- `test_launch.py`
- `test_launch_grace.py`
- `test_launch_process_cleanup.py`
- `test_launcher_cli.py`
- `test_ssh_common.py`
- `test_ssh_connect.py`
- `test_ssh_tunnel_metadata.py`
- `test_start_auth_api.py`
- `test_start_backups.py`
- `test_start_cli_helpers.py`
- `test_start_interrupt_handling.py`
- `test_start_paths_env.py`
- `test_start_plugins.py`
- `test_start_remote_delete_timeout.py`
- `test_start_remote_logs.py`
- `test_start_remote_path_forwarding.py`
- `test_start_status.py`
- `test_start_tools.py`
- `test_start_workspace_validation.py`
- `test_startup_helpers.py`
- `test_startup_message.py`

Why these are legacy fallback:

- they directly exercise `setta.start`, `setta.launch`, `setta.ssh_connect`,
  or `setta.ssh_common`
- they anchor the old Python startup command/helper graph rather than the
  packaged entrypoint boundary in `backend/setta/entrypoint.py`
- the current Go-owned shipped command surface does not require preserving
  those Python internals by default

## Important Clarifications

### `test_launcher_cli.py` is intentionally classified as legacy

The launcher feature itself is still active, but this specific test invokes the
legacy `setta.start.cli` launcher path directly. The active packaged and
distribution contract for launcher behavior is instead covered by:

- `test_module_entrypoint.py`
- `test_launcher_metadata.py`
- `test_launcher_setup.py`
- `test_launcher_artifact_installers.py`
- the platform launcher install-script tests

That distinction matters for later cleanup: launcher distribution behavior is
still real, but the old Click command implementation is not automatically
protected.

### `tests/start/dev_script_wiring_helpers.py` is support code, not a bucket

`dev_script_wiring_helpers.py` is test support for the active source/dev
workflow bucket above. It is not itself a contract surface.

## Source Of Truth After Slice 1

For the current rewrite boundary:

- shipped packaged CLI command ownership:
  `docs/reference/setta-cli-commands.md`
- broader remaining ownership rerank:
  `phase-25-remaining-python-ownership-inventory-and-rerank.md`
- startup/distribution cleanup plan:
  `phase-25-legacy-startup-and-distribution-boundary-plan.md`
- file-level startup test classification:
  this doc

## Decisions Made

- do not treat all of `tests/start/*` as active shipped-product compatibility
- preserve active shipped/distribution tests as real product/workflow contract
- preserve source/dev wiring tests as active repo workflow contract
- treat direct `setta.start` / `setta.launch` / `setta.ssh_*` test coverage as
  legacy fallback by default
- require a concrete active caller or workflow before keeping legacy fallback
  behavior as part of later cleanup scope

## Next Recommended Step

Slice 2 is now complete, and the remaining post-Slice-2 reachability is now
recorded in:

- `phase-25-dev-startup-command-boundary-plan.md`
- `phase-25-start-py-reachability-inventory-and-rerank.md`

Use this classification doc as the contract boundary for any later cleanup:

- preserve the active shipped/distribution and active source/dev buckets above
- do not promote the legacy fallback bucket back into active contract scope
  unless a concrete workflow proves it still needs to be active
