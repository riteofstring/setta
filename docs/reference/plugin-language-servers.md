# Plugin Language Servers

This reference explains the plugin-backed language-server model added on top of
the Go-owned runtime.

## Ownership

- Go owns language-server lifecycle, selection persistence, restart behavior,
  websocket status updates, and the frontend/runtime contracts.
- Plugins advertise language servers through `registerLanguageServer`.
- Plugin packages own only their manifest, probe entrypoint, and config schema
  for server-specific settings.

## Workspace settings

- Workspace selection lives in `settings.languageServer.selectedByLanguage`.
- Each key is a normalized language id such as `python`.
- A string value selects a plugin id for that language.
- A `null` value explicitly disables the language server for that language in
  the workspace.
- An absent key means no explicit workspace selection has been saved.

## First-party Python plugins

- `plugins/setta-basedpyright` is the repo-local defaults-profile plugin for
  Python.
- `plugins/setta-ty` is an optional first-party Python language-server plugin.
- `./dev_install.sh` syncs the repo Python environment with the `defaults`
  extra, so source-checkout dev installs include `setta-basedpyright`.

## Defaults bootstrap

- On first IDE startup for a workspace, Setta checks the defaults install
  profile and bootstraps missing language-server selections from active
  first-party plugins.
- Today that means Python defaults to `setta-basedpyright` when it is available.
- Bootstrap is one-shot per profile version and does not overwrite an existing
  explicit selection, including an explicit `null`.

## Runtime behavior

- Only the selected plugin for a language is turned into an active language
  server spec.
- Saving a selection updates workspace settings immediately, but the running
  language server does not change until restart.
- The backend publishes plugin runtime updates over websocket after settings or
  plugin-runtime changes so the frontend can show current selection health.
- The header banner and `Overview > Plugins` pane use backend-owned selection
  status to show whether the current selection is active, unavailable, or still
  pending restart.

## Watch Code dependency

The Watch Code provider probe can declare `requiresLanguageServer=true`. When
the active Watch Code provider does this, plugin runtime status includes a
Python language-server dependency status under
`featureCapabilities.watchCode.languageServerDependency`. A missing, disabled,
unavailable, or pending-restart Python selection is reported there so the
frontend can surface why Watch Code cannot refresh callable params reliably.

## Plugin config

- Server-specific settings stay under plugin-owned config roots such as
  `basedpyright` or `ty`. The top-level `settings.languageServer` contract
  stores language selection.
- A language-server registration can provide `settingsKey` so Setta scopes the
  plugin config branch passed to that server.
- Setta also injects required runtime search paths for first-party Python
  plugins so workspace imports resolve consistently.

## Code references

- `internal/settingsstate/language_server_selection.go`
- `internal/app/defaults_profile_bootstrap.go`
- `internal/app/plugin_language_server_selection_status.go`
- `internal/httpapi/settings_routes.go`
- `internal/httpapi/plugin_runtime_updates.go`
- `internal/plugins/language_servers.go`
- `frontend/src/components/AppHeader/LanguageServerStatusBanner.tsx`
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
