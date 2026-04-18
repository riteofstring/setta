# Branch Intent Summary

Compared `HEAD` to merge base `e247e0e98f1f8a609ddd65c814c2a731dc2d4119` with `go-rewrite`. This summary captures branch-introduced behavior and product/runtime intent, not generator churn for its own sake.

## Features

### Explicit per-language plugin selection is now the only way to activate plugin-backed language servers

What changed: Before this branch, `internal/lsp/router.go` always injected a core-owned current-process Python `basedpyright` spec, and `internal/plugins/language_servers.go` auto-activated every discovered plugin language server while treating same-language duplicates as fatal conflicts. After this branch, the authoritative contract is `settings.languageServer.selectedByLanguage`, where each lowercase language key can be missing, `null`, or a plugin ID string. `internal/plugins/language_servers.go` now returns specs only for explicitly selected plugins, and `internal/lsp/router.go` starts with no built-in Python server.

Why this looks intentional: The change spans new settings parsing/validation helpers, app/router/service tests, a dedicated LSP contract suite, and regenerated HTTP/non-HTTP frontend contracts.

Files/endpoints/components: `internal/settingsstate/language_server_selection.go`, `internal/settingsstate/validation.go`, `internal/settingsstate/defaults.json`, `internal/settingsstate/frontend_defaults.go`, `internal/plugins/language_servers.go`, `internal/app/plugin_backend_runtime_refresh.go`, `internal/lsp/router.go`, `frontend/src/openapi/http/generated/types.gen.ts`, `frontend/src/openapi/non_http/generated/types.gen.ts`, `frontend/src/utils/generatedTypes.ts`.

Default/moved logic: `internal/settingsstate/defaults.json` changed `languageServer` from a prefilled `basedpyright` settings object to `{ "selectedByLanguage": {} }`. Core Python LSP bootstrapping was removed from `internal/lsp/current_process.go` and from router initialization.

Reviewer guardrail: Do not reintroduce automatic activation of all discovered language servers or a core-owned implicit Python fallback. The three selection states are intentional: missing = never chosen, `null` = explicitly off, string = chosen plugin.

### Python LSP ownership moved into a first-party `setta-basedpyright` plugin/package

What changed: The branch adds `plugins/setta-basedpyright` as a first-party plugin with its own manifest, Go backend probe, config schema, README, and Python package metadata. The plugin now registers the Python language server through plugin discovery instead of the app owning Python LSP startup directly. Its backend resolves the command from `SETTA_LSP_COMMAND` and `SETTA_LSP_ARGS`, or from `SETTA_PYTHON`, `VIRTUAL_ENV`, `python3`, or `python`.

Why this looks intentional: The plugin is wired end-to-end through plugin discovery, package-manager tests, app tests, and a new `internal/plugins/language_server_contract_test.go` suite that validates discovery, completion, signature help, diagnostics, disable/uninstall behavior, and invalid-command handling.

Files/endpoints/components: `plugins/setta-basedpyright/setta.plugin.json`, `plugins/setta-basedpyright/backend/main.go`, `plugins/setta-basedpyright/content/config/schema.json`, `plugins/setta-basedpyright/pyproject.toml`, `plugins/setta-basedpyright/README.md`, `internal/plugins/backend_probe.go`, `internal/plugins/language_server_contract_test.go`, `internal/testutil/firstpartyplugin/basedpyright.go`.

Default/moved logic: The old core-owned `basedpyright` command resolution moved out of `internal/lsp/current_process.go` and into `plugins/setta-basedpyright/backend/main.go`.

Reviewer guardrail: Do not move Python LSP ownership back into core app startup. Python LSP is now supposed to enter through plugin discovery and explicit selection, not through hardcoded router bootstrap.

### Basedpyright dependency and default settings moved from root settings/package metadata into the plugin

What changed: The root `setta` package no longer depends on `basedpyright` directly. Instead, the new optional `defaults` extra depends on `setta-basedpyright==0.1.0`, and the plugin package itself owns the pinned `basedpyright==1.25.0` dependency. Likewise, the old global `settings.languageServer.basedpyright.analysis.diagnosticSeverityOverrides` defaults were removed from `internal/settingsstate/defaults.json` and moved into the plugin config schema, then merged with saved plugin config when building `lsp.LanguageServerSpec.Settings`.

Why this looks intentional: Packaging metadata, lockfile entries, package-boundary tests, and new `internal/plugins/language_server_settings.go` all point in the same direction: the plugin package owns both the dependency and its default config.

Files/endpoints/components: `pyproject.toml`, `uv.lock`, `tests/start/test_packaged_distribution.py`, `plugins/setta-basedpyright/pyproject.toml`, `plugins/setta-basedpyright/content/config/schema.json`, `internal/plugins/language_server_settings.go`, `internal/plugins/language_servers.go`.

Default/moved logic: Default basedpyright severity overrides were relocated from global settings defaults to plugin schema defaults, and plugin runtime config now overlays those defaults instead of reading from a core settings branch.

Reviewer guardrail: Do not re-add `basedpyright` to root default dependencies or put plugin-owned defaults back under `settings.languageServer.basedpyright`. The plugin package and plugin config are the source of truth now.

### A versioned defaults profile now bootstraps the default Python plugin selection on first open

What changed: The branch adds a versioned defaults install profile with `PackageSpecs: ["setta-basedpyright==0.1.0"]` and `LanguageServerPluginByLanguage: { "python": "setta-basedpyright" }`. On workspace open, `bootstrapWorkspaceDefaultsInstallProfile(...)` checks discovered plugins and writes the missing Python selection once if the default plugin is already available. It also records a runtime marker file so the bootstrap does not rerun until the profile version changes.

Why this looks intentional: The bootstrap has explicit schema/profile versioning, app startup integration, and tests for first-write, explicit-null preservation, and one-shot behavior.

Files/endpoints/components: `internal/plugins/defaults_profile.go`, `internal/app/defaults_profile_bootstrap.go`, `internal/app/app.go`, `internal/app/defaults_profile_bootstrap_test.go`, `internal/app/app_test.go`.

Default/moved logic: Bootstrap state is persisted under `defaults_install_profile_bootstrap.json` in the runtime root. The bootstrap fills only missing selections; it does not override explicit `null` or an existing plugin choice.

Reviewer guardrail: Preserve the current one-time, fill-only-missing behavior. Do not turn this into recurring auto-selection, and do not overwrite explicit opt-out or custom selections unless a new product decision says to.

### Plugin runtime/status now exposes registered language servers so the frontend can reason about LSP availability

What changed: `PluginStatusEntry` now includes `registeredLanguageServers`, the generated HTTP/non-HTTP contracts were regenerated, and the app header gained a `LanguageServerStatusBanner` that warns when Python has no selection, is explicitly turned off, points at a missing plugin, or points at a non-Python plugin. The banner deep-links to the Plugins overview tab.

Why this looks intentional: The backend status payload changed, all generated contract artifacts were refreshed, and the banner has focused tests for each user-visible state.

Files/endpoints/components: `internal/plugins/status.go`, `/api/plugins/runtime`, `frontend/generation/http_openapi/openapi.json`, `frontend/generation/non_http_shared/openapi.json`, `frontend/src/components/AppHeader/Header.tsx`, `frontend/src/components/AppHeader/LanguageServerStatusBanner.tsx`, `frontend/src/components/AppHeader/LanguageServerStatusBanner.test.tsx`.

Moved UX flow: The UX moved from implicit Python availability to explicit status messaging that directs the user to the plugin configuration path.

Reviewer guardrail: Do not remove `registeredLanguageServers` from plugin runtime/status payloads or silently hide these unsupported states. Follow-up UI work should preserve a clear path back to Plugins when Python LSP is missing or misconfigured.

## Bug Fixes

### Unconfigured Python LSP is now treated as a supported state instead of a generic failure

What changed: The app can now start with no Python plugin and no Python selection. In that state, code completions and diagnostics simply return empty results, and callable-signature resolution returns "unavailable" instead of surfacing an error. Restarting the language server now returns a specific `409` / `language_server_not_configured` response with user guidance, instead of a generic internal error.

Why this looks intentional: The behavior is covered across app, router, HTTP route, and signature-service tests, and the frontend banner text matches the backend error guidance.

Files/endpoints/components: `internal/lsp/router.go`, `internal/httpapi/lsp_routes.go`, `/api/restartLanguageServer`, `internal/app/lsp_admin.go`, `internal/lspsignature/service.go`, `internal/app/app_test.go`, `internal/httpapi/lsp_routes_test.go`, `frontend/src/components/AppHeader/LanguageServerStatusBanner.tsx`.

Reviewer guardrail: Do not regress this state back into startup failures, generic `500`s, or noisy background errors. "No configured Python LSP" is now an intentional state with explicit UX.

### Selected language-server availability is refreshed against current plugin state before restart/sync

What changed: Restarting the language server now refreshes plugin runtime first and refuses to continue if the selected plugin no longer yields any active specs. Disabling, uninstalling, or invalidating a selected plugin removes its LSP after refresh instead of letting stale specs survive. The contract tests also make it explicit that changing the selection alone does not hot-swap the router; the user must restart or refresh after the new plugin is available.

Why this looks intentional: `workspaceLSPAdmin` was added specifically for this path, and the contract suite covers selection changes, disable/uninstall transitions, and invalid plugin commands.

Files/endpoints/components: `internal/app/lsp_admin.go`, `internal/app/plugin_backend_runtime_refresh.go`, `internal/plugins/language_servers.go`, `internal/plugins/language_server_contract_test.go`, `/api/restartLanguageServer`.

Moved UX flow: The expected user flow is now "select plugin in settings, make sure it is installed or active, then restart." Selection changes are not supposed to silently take effect mid-session.

Reviewer guardrail: Do not make restart skip the plugin refresh, and do not reintroduce stale-spec behavior. If the flow is ever changed, it should be an explicit new decision, not an accidental review cleanup.

### Backend probe validation now allows Python plugin registrations but rejects multi-implementation plugins

What changed: Plugin backends are no longer blocked from registering a Python language server, which is required for `setta-basedpyright`. At the same time, one plugin may only expose multiple language-server registrations when they all share the same command, args, and settings key; different implementations inside one plugin are now rejected.

Why this looks intentional: The probe normalization logic and tests were updated in tandem with the first-party Python plugin work and the new explicit selection model.

Files/endpoints/components: `internal/plugins/backend_probe.go`, `internal/plugins/backend_probe_test.go`, `plugins/setta-basedpyright/backend/main.go`.

Reviewer guardrail: Do not re-ban Python in backend probe validation, and do not loosen the single-implementation check unless there is a deliberate design for multi-binary plugins.

## Intentional Behavior Changes To Preserve

### Preserve the missing vs `null` vs plugin-ID distinction in `settings.languageServer.selectedByLanguage`

What changed: This branch deliberately distinguishes "never chosen yet", "explicitly off", and "selected plugin". Bootstrap uses that distinction, the header banner uses that distinction, and validation/tests enforce lowercase trimmed keys plus non-empty string values.

Files/endpoints/components: `internal/settingsstate/language_server_selection.go`, `internal/settingsstate/validation.go`, `internal/settingsstate/frontend_defaults.go`, `frontend/src/components/AppHeader/LanguageServerStatusBanner.tsx`.

Reviewer guardrail: Do not collapse missing and `null` into the same state. Reviews that "simplify" this distinction will break bootstrap semantics and the unconfigured/off UX.

### Preserve plugin-owned language-server settings as the authoritative config path

What changed: `lsp.LanguageServerSpec` now carries `PluginID` and `Settings`, and router session startup prefers spec-owned settings over reaching back into a global document branch. For plugin-backed LSPs, the effective settings are now plugin schema defaults overlaid with plugin runtime config.

Files/endpoints/components: `internal/lsp/router.go`, `internal/plugins/language_server_settings.go`, `internal/plugins/language_servers.go`, `plugins/setta-basedpyright/content/config/schema.json`.

Reviewer guardrail: Do not move plugin LSP settings resolution back into a global current-process helper or a hardcoded `settings.languageServer.<server>` branch.

### Preserve the packaged-boundary split between core `setta` and the defaults/plugin layer

What changed: The root package now exposes a `defaults` extra for the first-party plugin instead of shipping `basedpyright` as a core dependency. The plugin package owns the direct `basedpyright` pin, and `uv` is wired to the local plugin source path for repo installs.

Files/endpoints/components: `pyproject.toml`, `uv.lock`, `tests/start/test_packaged_distribution.py`, `plugins/setta-basedpyright/pyproject.toml`.

Reviewer guardrail: Do not "fix" packaging by putting `basedpyright` back in root default metadata. The branch intentionally narrows the packaged core boundary and pushes Python LSP into the plugin/defaults lane.

### Preserve the explicit "install or enable, choose, then restart" UX

What changed: The header banner copy, restart error message, and refresh behavior all align on the same user path: choose a plugin in workspace settings, verify it is available, then restart. This is now the supported recovery path for missing Python LSP behavior.

Files/endpoints/components: `internal/httpapi/lsp_routes.go`, `internal/app/lsp_admin.go`, `frontend/src/components/AppHeader/LanguageServerStatusBanner.tsx`.

Reviewer guardrail: Do not replace this with silent fallback activation or reviewer-driven "cleanup" that hides the need for an explicit restart. That flow is the branch's intended contract.
