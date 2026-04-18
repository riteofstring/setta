# Features

## Explicit plugin-backed language-server selection by language
What changed: Before this branch, the runtime always had an implicit current-process Python language server path, and plugin language-server registrations effectively behaved like one-server-per-language because duplicate language registrations were treated as ambiguous. After this branch, language servers are opt-in through `settings.languageServer.selectedByLanguage`, keyed by lowercase language ID. The router now starts with no built-in language servers, multiple plugins may register the same language, and only the explicitly selected plugin contributes the active spec for that language. Missing selection now means "unconfigured", `null` means "explicitly turned off", and a string means "this plugin is selected".

Why the change appears intentional: the branch deletes [`internal/lsp/current_process.go`](internal/lsp/current_process.go), adds a dedicated settings contract/parser in `internal/settingsstate/language_server_selection.go`, changes defaults/validation/generated frontend types, and adds tests that assert the app starts with no Python LSP, no Python completions/diagnostics, and no active plugin language server until a selection is written.

Files/endpoints/components involved: `internal/settingsstate/language_server_selection.go`, `internal/settingsstate/validation.go`, `internal/settingsstate/defaults.json`, `internal/settingsstate/frontend_defaults.go`, `frontend/generation/non_http_shared/schema.json`, `frontend/generation/http_openapi/openapi.json`, `frontend/src/openapi/*/generated/*`, `frontend/src/utils/generatedTypes.ts`, `internal/plugins/language_servers.go`, `internal/app/plugin_backend_runtime_refresh.go`, `internal/lsp/router.go`, `internal/app/app.go`, `internal/app/app_test.go`.

Default-value changes, moved flows, relocated logic: the old shared default branch under `settings.languageServer.basedpyright` was removed from `internal/settingsstate/defaults.json` and replaced with `settings.languageServer.selectedByLanguage = {}`. The old built-in current-process Python launch path moved out of the core router and into plugin selection plus plugin-owned backend registration.

Reviewer guardrail: do not reintroduce implicit Python LSP startup, "pick the first matching plugin" fallback, or ambiguity errors that force only one plugin to register a language. Preserve the distinction between missing selection, explicit `null`, and explicit plugin ID.

## First-party `setta-basedpyright` plugin package now owns Python LSP runtime wiring
What changed: Before this branch, the root Python package directly depended on `basedpyright`, and the core runtime resolved the Python language server from the current process or `SETTA_LSP_COMMAND`. After this branch, Python LSP is provided by a first-party plugin package, `setta-basedpyright`, with its own plugin manifest, backend probe, schema-owned config defaults, backend launcher, and package metadata. The root package no longer declares `basedpyright` as a default dependency; instead it exposes a `defaults` extra that installs `setta-basedpyright==0.1.0`.

Why the change appears intentional: the branch adds a full plugin directory under `plugins/setta-basedpyright/`, adds packaging and distribution tests that assert the plugin package owns the `basedpyright` dependency, and updates app/plugin contract tests to exercise Python completions through the plugin rather than through a built-in runtime path.

Files/endpoints/components involved: `plugins/setta-basedpyright/setta.plugin.json`, `plugins/setta-basedpyright/backend/main.go`, `plugins/setta-basedpyright/content/config/schema.json`, `plugins/setta-basedpyright/pyproject.toml`, `plugins/setta-basedpyright/README.md`, `pyproject.toml`, `uv.lock`, `tests/start/test_packaged_distribution.py`, `internal/testutil/firstpartyplugin/basedpyright.go`, `internal/plugins/language_server_contract_test.go`.

Default-value changes, moved flows, relocated logic: the language-server command resolution moved from deleted core file `internal/lsp/current_process.go` into `plugins/setta-basedpyright/backend/main.go`, which now resolves `SETTA_LSP_COMMAND`, `SETTA_LSP_ARGS`, `SETTA_PYTHON`, and `VIRTUAL_ENV`. The basedpyright default severity overrides moved out of shared settings defaults and into the plugin schema at `plugins/setta-basedpyright/content/config/schema.json`.

Reviewer guardrail: do not move `basedpyright` back into the root package's default dependency set, and do not move Python LSP launch/default-setting ownership back into the core app/router unless there is a new explicit product decision to undo pluginization.

## One-time defaults-profile bootstrap selects package-manager `setta-basedpyright` on first open
What changed: Before this branch, there was no versioned "defaults install profile" that could translate available package-manager plugins into an initial workspace language-server selection. After this branch, `plugins.DefaultsInstallProfile()` defines a versioned defaults profile that includes `setta-basedpyright==0.1.0` and maps `python -> setta-basedpyright`. On first workspace open only, the app rescans package-manager plugins and bootstraps `settings.languageServer.selectedByLanguage.python = "setta-basedpyright"` if that plugin is actually discovered and active. It records a bootstrap state file so the profile is not re-applied on every launch.

Why the change appears intentional: there is dedicated profile code, dedicated bootstrap code, and tests covering first-open application, preservation of explicit `null`, and "run only once per profile version" semantics.

Files/endpoints/components involved: `internal/plugins/defaults_profile.go`, `internal/app/defaults_profile_bootstrap.go`, `internal/app/app.go`, `internal/settingsstate/language_server_selection.go`, `pyproject.toml`, `internal/app/defaults_profile_bootstrap_test.go`, `internal/plugins/defaults_profile_test.go`.

Default-value changes, moved flows, relocated logic: bootstrap state is persisted as `defaults_install_profile_bootstrap.json` under the runtime root. Selection bootstrap happens during workspace service startup in `internal/app/app.go`, before later runtime bootstrapping.

Reviewer guardrail: do not make this bootstrap run on every startup, and do not let it overwrite explicit user choices. The intent is "fill in missing selection once for this profile version", not "continuously enforce defaults".

## Python LSP availability is now surfaced in the header and plugin runtime status
What changed: Before this branch, the frontend had no dedicated Python LSP status banner and the plugin runtime payload did not expose plugin-registered language servers. After this branch, plugin status entries include `registeredLanguageServers`, and the header renders `LanguageServerStatusBanner` in local IDE mode. The banner distinguishes between "never selected", "explicitly turned off", "selected plugin missing", "selected plugin does not provide Python", and "selected plugin unavailable", and sends the user to the Plugins tab.

Why the change appears intentional: the branch adds a new header component with targeted tests, expands plugin runtime status types on both Go and TypeScript sides, and wires the banner into the shared header instead of leaving these states implicit.

Files/endpoints/components involved: `internal/plugins/status.go`, `frontend/generation/http_openapi/openapi.json`, `frontend/generation/non_http_shared/schema.json`, `frontend/src/openapi/http/generated/types.gen.ts`, `frontend/src/openapi/non_http/generated/types.gen.ts`, `frontend/src/components/AppHeader/Header.tsx`, `frontend/src/components/AppHeader/LanguageServerStatusBanner.tsx`, `frontend/src/components/AppHeader/LanguageServerStatusBanner.test.tsx`, `GET /api/plugins/runtime`.

Default-value changes, moved flows, relocated logic: the reviewer/user flow moved from "Python LSP is assumed to exist if the environment is okay" to "select a plugin in workspace settings, make sure it is available, then restart". The banner is intentionally a persistent header-level affordance, not a buried plugin-pane-only message.

Reviewer guardrail: do not remove `registeredLanguageServers` from plugin runtime status or collapse the banner back into a generic failure state. Follow-up UI or API work should preserve the ability to explain why Python LSP is unavailable.

# Bug Fixes

## Restarting an unconfigured language server now fails clearly instead of falling through as a generic error
What changed: Before this branch, attempting to restart the language server with no configured/available selection would have fallen through the generic restart path and surfaced as an internal failure. After this branch, restart first refreshes plugin runtime state, then checks whether any configured language-server specs remain. If none do, `POST /api/restartLanguageServer` now returns HTTP `409` with error code `language_server_not_configured` and the actionable message "Language server is not configured. Select a plugin and restart after it is available."

Why the change appears intentional: the branch adds a dedicated `workspaceLSPAdmin` wrapper, threads plugin runtime access into the admin path, and adds focused HTTP and app tests for the exact conflict response and message.

Files/endpoints/components involved: `internal/app/lsp_admin.go`, `internal/app/app.go`, `internal/app/plugin_backend_runtime_refresh.go`, `internal/httpapi/lsp_routes.go`, `internal/httpapi/lsp_routes_test.go`, `internal/app/lsp_admin_test.go`, `POST /api/restartLanguageServer`.

Default-value changes, moved flows, relocated logic: restart is no longer "project syncer only"; it is now "refresh plugin runtime, validate configured specs, then restart project LSP".

Reviewer guardrail: do not turn this back into a generic `500` or a silent no-op. Reviewers should preserve the explicit `409 language_server_not_configured` behavior until a new UX/API decision is made.

## Unconfigured language-server state is now handled gracefully across router and signature-help flows
What changed: Before this branch, missing language-server configuration was tied up with the built-in Python assumption, so callers could treat "no language server" as an exceptional state. After this branch, the router explicitly supports zero configured language servers, snapshot requests return `ErrLanguageServerNotConfigured` when appropriate, the callable-signature service converts that specific error into "signature unavailable" instead of surfacing an application error, and app startup without a selected Python server produces empty completions/diagnostics rather than breaking runtime startup.

Why the change appears intentional: the branch adds router tests for "no configured language servers", signature-service tests for treating the error as unavailable, and app tests that assert no Python completions/diagnostics until selection exists.

Files/endpoints/components involved: `internal/lsp/router.go`, `internal/lsp/router_test.go`, `internal/lspsignature/service.go`, `internal/lspsignature/service_test.go`, `internal/app/app_test.go`.

Default-value changes, moved flows, relocated logic: the runtime no longer masks missing configuration by auto-providing Python. Higher-level callers now have to handle "unconfigured" as a first-class state.

Reviewer guardrail: do not restore fake/default LSP results to hide an unconfigured state, and do not reintroduce unconditional Python startup just to avoid touching these callers.

## Plugin backend probing now allows Python language-server registrations while rejecting multi-implementation ambiguity inside one plugin
What changed: Before this branch, plugin backend language-server registrations were explicitly rejected if they targeted `python`, which blocked Python pluginization altogether. After this branch, Python registrations are allowed. At the same time, the probe now enforces that one plugin's language-server registrations must share a single command/args/settingsKey implementation, so a plugin cannot advertise multiple unrelated LSP backends under one plugin ID.

Why the change appears intentional: the branch removes the Python-target ban, adds `ensureSinglePluginLanguageServerImplementation`, and adds probe tests for both "python is allowed" and "multiple implementations per plugin are rejected".

Files/endpoints/components involved: `internal/plugins/backend_probe.go`, `internal/plugins/backend_probe_test.go`, `plugins/setta-basedpyright/backend/main.go`.

Default-value changes, moved flows, relocated logic: the system moved from "Python can only come from the core runtime" to "Python may come from plugins, but each plugin still represents one concrete backend implementation".

Reviewer guardrail: do not restore the blanket Python-target rejection, and do not silently permit one plugin ID to fan out into multiple independent backend implementations unless there is a new explicit plugin model to support that.

# Intentional Behavior Changes To Preserve

## Preserve the stored selection shape and semantics exactly
What changed: the branch intentionally narrows `settings.languageServer` to a typed object containing `selectedByLanguage` instead of a free-form map. Lowercase trimmed keys are required. Missing key means "not configured yet", `null` means "intentionally off", and string means "selected plugin ID".

Why the change appears intentional: validation, frontend defaults, generated schemas, and tests all now encode this exact shape.

Files/endpoints/components involved: `internal/settingsstate/validation.go`, `internal/settingsstate/language_server_selection.go`, `internal/settingsstate/frontend_defaults.go`, `frontend/generation/non_http_shared/schema.json`, `frontend/src/openapi/non_http/generated/types.gen.ts`, `frontend/src/utils/generatedTypes.ts`.

Reviewer guardrail: do not loosen this back into `map[string]any`, do not accept mixed-case language keys, and do not collapse `missing` and `null` into the same meaning.

## Preserve plugin-owned basedpyright defaults and config merging
What changed: the branch intentionally moved basedpyright defaults out of shared settings defaults and into the plugin's schema, then taught plugin language-server spec construction to merge schema defaults with saved plugin config and hand that merged root to the LSP router via `spec.Settings`.

Why the change appears intentional: `internal/plugins/language_server_settings.go` exists solely for this, the plugin schema carries the old severity overrides, and the router now prefers spec-owned settings over the global settings callback when present.

Files/endpoints/components involved: `plugins/setta-basedpyright/content/config/schema.json`, `internal/plugins/language_server_settings.go`, `internal/plugins/language_servers.go`, `internal/plugins/runtime.go`, `internal/lsp/router.go`.

Reviewer guardrail: do not move these defaults back into `internal/settingsstate/defaults.json`, and do not bypass the spec-owned settings path in the router. The branch intent is that plugin config owns plugin LSP settings.

## Preserve refresh-dependent selection application
What changed: selection writes alone do not instantly mutate live LSP sessions. The selected spec set is recalculated through plugin runtime refresh/replacement, and disabling, uninstalling, or invalidating the selected plugin removes its spec after refresh.

Why the change appears intentional: contract tests explicitly cover "selection change requires explicit refresh", plus disable/uninstall/invalid-command flows that become unavailable only after refresh.

Files/endpoints/components involved: `internal/app/plugin_backend_runtime_refresh.go`, `internal/plugins/language_server_contract_test.go`, `internal/plugins/language_servers.go`, `internal/lsp/router.go`.

Reviewer guardrail: do not add hidden auto-refresh or stale-session fallback logic in follow-up reviews unless that is a conscious product/runtime decision. The current behavior is intentionally explicit about refresh boundaries.

## Preserve the package-boundary cleanup around defaults installation
What changed: the core package now treats the Python LSP as part of the optional defaults/plugin lane instead of part of its base dependency set. The defaults install profile, `pyproject.toml` extras, and package-manager plugin discovery are meant to work together.

Why the change appears intentional: packaging metadata, wheel metadata tests, defaults profile code, and first-open bootstrap tests all align around this boundary.

Files/endpoints/components involved: `pyproject.toml`, `uv.lock`, `tests/start/test_packaged_distribution.py`, `internal/plugins/defaults_profile.go`, `internal/app/defaults_profile_bootstrap.go`.

Reviewer guardrail: do not "simplify" follow-up packaging work by moving `basedpyright` back into the base install or by removing the `defaults` extra without replacing the entire defaults-profile/plugin story with a new explicit decision.
