# Setta Watch Code Plugin

First-party Setta plugin that gates Watch Code and owns the canvas control UI.
Go remains the owner of Watch Code parsing, planning, routes, settings,
project-state mutation, and persistence contracts.

## Runtime Contract

- Backend probe publishes the Watch Code backend contract, the POST route
  `/plugins/setta-watch-code/watch-code/inputs`, and plugin-owned UI settings
  for `folders` and `files`.
- Backend runtime dispatches through `setta.plugin_runtime.watch_code`, which
  calls the packaged Setta local-core command surface.
- Frontend runtime registers the project canvas control and the
  `watch-code-settings` reveal handler through the generic plugin host.
- The provider declares a Python language-server dependency so signature/param
  refresh status is visible in plugin runtime health.

## Validate

```bash
setta plugins validate .
```

## Build Frontend Bundle

```bash
pnpm --dir plugins/setta-watch-code/frontend install --lockfile=false
pnpm --dir plugins/setta-watch-code/frontend typecheck
pnpm --dir plugins/setta-watch-code/frontend test
pnpm --dir plugins/setta-watch-code/frontend build
```

The built `frontend/dist/*` files are runtime/package artifacts and are not
checked in.
