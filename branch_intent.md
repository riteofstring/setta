# Branch Intent

This branch is intended to pluginize the Python language-server path and make
language-server selection explicit and plugin-owned.

## Explicit plugin-backed language-server selection by language

- `settings.languageServer.selectedByLanguage` is now the source of truth.
- Lowercase language IDs are required.
- Missing key means "not configured yet".
- `null` means "explicitly turned off".
- A string means "this plugin ID is selected".
- The router now supports zero configured language servers. There is no implicit
  built-in Python LSP fallback.

Guardrails:
- Do not reintroduce implicit current-process Python LSP startup.
- Do not auto-pick the first matching plugin for a language.
- Do not collapse missing and `null` into the same meaning.

Key files:
- `internal/settingsstate/language_server_selection.go`
- `internal/settingsstate/validation.go`
- `internal/plugins/language_servers.go`
- `internal/app/plugin_backend_runtime_refresh.go`
- `internal/lsp/router.go`

## First-party `setta-basedpyright` plugin owns Python LSP runtime wiring

- Python LSP now comes from the first-party plugin package
  `plugins/setta-basedpyright/`.
- The root Python package no longer owns basedpyright as a built-in default
  runtime path.
- The root package exposes the plugin through the `defaults` install lane.
- Plugin schema/defaults now own basedpyright-specific config instead of shared
  core settings defaults.

Guardrails:
- Do not move Python LSP launch/default-setting ownership back into the core
  app/router.
- Do not move `basedpyright` back into the root package's base install.

Key files:
- `plugins/setta-basedpyright/setta.plugin.json`
- `plugins/setta-basedpyright/backend/main.go`
- `plugins/setta-basedpyright/content/config/schema.json`
- `plugins/setta-basedpyright/pyproject.toml`
- `pyproject.toml`

## One-time defaults-profile bootstrap selects packaged basedpyright

- On first workspace open only, the app may bootstrap
  `python -> setta-basedpyright` when the package-manager plugin is actually
  discovered and active.
- The bootstrap is versioned and recorded so it does not rerun every startup.
- Explicit user choices, including explicit `null`, must win over defaults.

Guardrails:
- Do not make defaults bootstrap run every startup.
- Do not let bootstrap overwrite explicit user selections.

Key files:
- `internal/plugins/defaults_profile.go`
- `internal/app/defaults_profile_bootstrap.go`
- `internal/app/app.go`

## Header and plugin runtime now surface Python LSP availability explicitly

- Plugin runtime status now includes registered language-server metadata.
- The header renders a Python language-server status banner in local IDE mode.
- The banner distinguishes between:
  - no selection yet
  - explicitly disabled
  - selected plugin missing
  - selected plugin does not provide Python
  - selected plugin unavailable

Guardrails:
- Do not collapse these states back into a generic failure state.
- Preserve enough backend/frontend contract detail for the banner to explain why
  Python LSP is unavailable.

Key files:
- `internal/plugins/status.go`
- `frontend/src/components/AppHeader/LanguageServerStatusBanner.tsx`
- `frontend/src/components/AppHeader/Header.tsx`

## Restart and unconfigured-state behavior is intentionally explicit

- Restart now validates configured specs after plugin runtime refresh.
- If no configured language server remains, `POST /api/restartLanguageServer`
  returns HTTP `409` with `language_server_not_configured`.
- Router and signature-help flows now treat "language server not configured" as
  a first-class state rather than relying on an implicit Python fallback.

Guardrails:
- Do not turn this back into a generic `500`.
- Do not hide the unconfigured state by restoring unconditional Python startup.

Key files:
- `internal/app/lsp_admin.go`
- `internal/httpapi/lsp_routes.go`
- `internal/lsp/router.go`
- `internal/lspsignature/service.go`

## Plugin backend probing now allows Python registrations

- Plugin backends may now register Python language servers.
- One plugin must still represent one concrete language-server implementation;
  multi-implementation ambiguity inside one plugin remains invalid.

Guardrails:
- Do not restore the blanket "plugins cannot register Python" rule.
- Do not silently allow one plugin ID to fan out into multiple unrelated LSP
  implementations.

Key files:
- `internal/plugins/backend_probe.go`
- `internal/plugins/backend_probe_test.go`

## Preserve refresh boundaries

- Selection writes alone do not instantly mutate the live LSP session.
- Active specs are recalculated through runtime refresh/replacement.
- Disable/uninstall/invalid selected-plugin states become effective through that
  explicit refresh boundary.

Guardrails:
- Do not add hidden auto-refresh or stale-session fallback logic unless there is
  a new explicit product decision to do so.

Key files:
- `internal/app/plugin_backend_runtime_refresh.go`
- `internal/plugins/language_servers.go`
- `internal/lsp/router.go`
