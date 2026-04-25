# Setta JSON Render App Generation Plugin

This first-party plugin gates the extracted app subsystem.

## Packaging Model

- `enabledByDefault` remains `false`.
- The package-manager wheel now ships the normal runtime-managed plugin shape:
  `setta.plugin.json`, a backend entrypoint under `runtime_backend/`, and the
  bundled frontend entrypoint under `frontend/dist/`.
- The plugin frontend now owns its build metadata under `frontend/` with
  explicit third-party dependencies and a vendored packaged
  `@setta/app-subsystem-frontend-sdk` surface for staged-source builds.
  The vendored SDK `dist/` is generated from
  `frontend/plugin-sdk/app-subsystem`; it is not checked into git.
- The plugin now declares its plugin-owned frontend build contract in
  `setta.plugin.json`, so source/deployment packaging no longer depends on a
  host-side plugin-id special case.
- The plugin still depends on Setta runtime contracts for app-subsystem
  integration, which is intentional.

Installing this package makes the app subsystem available to the plugin system,
but the feature still stays off until the plugin is enabled.

## Build Frontend Bundle

Build the frontend bundle through the plugin-owned frontend package metadata:

```bash
pnpm --dir plugins/setta-json-render-app-gen/frontend run prepare-sdk
pnpm --dir plugins/setta-json-render-app-gen/frontend install --lockfile=false
pnpm --dir plugins/setta-json-render-app-gen/frontend typecheck
pnpm --dir plugins/setta-json-render-app-gen/frontend test
pnpm --dir plugins/setta-json-render-app-gen/frontend build
```

The `test` and `build` scripts run `prepare-sdk` and refresh frontend
dependencies before invoking Vitest or Vite, so staged source trees can rebuild
from source even when the vendored SDK `dist/` directory is absent.

## Build Wheel

Build the plugin wheel from this folder:

```bash
python -m build
```

The wheel and editable build paths now rebuild `frontend/dist/*` from the
plugin-owned frontend package before packaging. The source distribution
materializes the vendored SDK `dist/` first, then includes the frontend
source/build inputs needed to build the plugin frontend from `sdist`.

## Install

Install it into the active environment:

```bash
uv pip install ./plugins/setta-json-render-app-gen
```

## Manual Smoke Test App Spec

The App Config editor expects Setta app-spec JSON, not React-style JSX JSON.
Element roots must include `key` and `type`, child elements belong in top-level
`children`, and component props must match the Setta catalog.

Paste this into the App Spec JSON editor to verify that the plugin renders and
saves a minimal app:

```json
{
  "key": "app-root",
  "type": "Card",
  "props": {
    "title": "Plugin render smoke test",
    "description": "If you can see this card, JSON Render is working."
  },
  "children": [
    {
      "key": "smoke-text",
      "type": "Text",
      "props": {
        "text": "This is a simple app-subsystem render check."
      }
    }
  ]
}
```
