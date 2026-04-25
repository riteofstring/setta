# Setta Watch Code Plugin

First-party Setta plugin that gates Watch Code and owns the canvas control UI.
Go remains the owner of Watch Code parsing, planning, routes, settings,
project-state mutation, and persistence contracts.

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
