# Cumulative Review

## 2026-02-15T12:25:41-08:00 - b8056e21ba699187a2e8360443512565600c6401

- Standardized plugin scope naming across the stack by removing the legacy `environment` alias and using canonical scopes only: `workspace`, `setta_files`, and `global`.
- Updated backend plugin contracts and CLI flags/options accordingly, including scope normalization and scope label output (`setta_files` instead of `environment`).
- Updated frontend plugin install UI and generated API types to use `setta_files`, and aligned Playwright expectations for scope values and confirmation text.
- Updated plugin fixture smoke guidance to reflect `setta_files` scope precedence over `global`.
- Improved `scripts/run_backend_tests.sh` by caching plugin fixture build signatures under `setta_files/.cache/`, skipping unchanged rebuilds, and adding a force rebuild override via `SETTA_FORCE_PLUGIN_FIXTURE_BUILD=1`.
- Expanded test coverage to enforce the new scope behavior (including rejection of `environment`/`--environment`) and added new tests verifying backend test-runner fixture cache behavior.

## 2026-02-15T13:06:40-08:00 - 556c9425d72d2b919a67533b8970a2debdca6814

- Hardened plugin scope normalization to return a targeted error for the removed `environment` alias with explicit guidance to use `setta_files`.
- Updated plugin fixture helper scripts (`link.sh`, `unlink.sh`, `reset.sh`) so accepted scopes and usage text are canonical-only: `workspace`, `setta_files`, `global`.
- Removed remaining plugin-scope alias references from canonical docs and fixture docs (`plugin-authoring-golden-path`, `plugin-fixture-manual-smoke`, fixture READMEs).
- Added/updated tests to lock behavior: unit coverage for explicit `environment` rejection guidance, CLI coverage for rejecting `--scope environment` with canonical choices in help output, and Playwright coverage that install-scope UI exposes `workspace`/`setta_files`/`global` with no `environment` option.
